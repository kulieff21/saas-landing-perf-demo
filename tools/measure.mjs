// Measures site/before/ and site/after/ the same way and writes results/.
//
//   node tools/measure.mjs [--runs 3] [--no-lighthouse] [--no-shots] [--live <base url>]
//
// --live measures the deployed pages instead (real host: compression, CDN) and writes
// results/live/ without touching the local results the case study is built from.
//
// Both pages are served by the same local static server (no compression,
// Cache-Control: no-store), so server-level audits are identical on both sides
// and excluded from the comparison (see SERVER_AUDITS).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, resolve } from './deps.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? dflt : args[i + 1];
};
const RUNS = Number(opt('runs', 3));
const LIGHTHOUSE = !args.includes('--no-lighthouse');
const SHOTS = !args.includes('--no-shots');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 8820;
const LIVE = opt('live', null)?.replace(/\/$/, '');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = LIVE ? path.join(root, 'results', 'live') : path.join(root, 'results');
const shotsDir = path.join(results, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

const PAGES = { before: '/before/index.html', after: '/after/index.html' };
const SERVER_AUDITS = new Set(['uses-text-compression', 'uses-long-cache-ttl', 'bf-cache', 'cache-insight', 'document-latency-insight']);

const server = LIVE ? null : spawn(process.execPath, [resolve('http-server/bin/http-server'), path.join(root, 'site'), '-p', String(PORT), '-s', '-c-1']);
await new Promise((r) => setTimeout(r, 1500));
const url = (p) => (LIVE ? `${LIVE}${p.replace(/index\.html$/, '')}` : `http://localhost:${PORT}${p}`);

const summary = { date: new Date().toISOString(), runs: RUNS, host: LIVE || 'local http-server', pages: {} };
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

if (LIGHTHOUSE) {
    const lighthouse = await load('lighthouse');
    const desktopConfig = await load('lighthouse/core/config/desktop-config.js');
    const chromeLauncher = await load('chrome-launcher');
    const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ['--headless=new', '--no-first-run'] });
    for (const [page, p] of Object.entries(PAGES)) {
        summary.pages[page] = { url: p };
        for (const mode of ['mobile', 'desktop']) {
            const runs = [];
            let failing;
            for (let i = 0; i < RUNS; i++) {
                const { lhr } = await lighthouse(url(p), { port: chrome.port, output: 'json', logLevel: 'error' }, mode === 'desktop' ? desktopConfig : undefined);
                runs.push({
                    ...Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
                    lcp: lhr.audits['largest-contentful-paint'].numericValue,
                    fcp: lhr.audits['first-contentful-paint'].numericValue,
                    tbt: lhr.audits['total-blocking-time'].numericValue,
                    cls: lhr.audits['cumulative-layout-shift'].numericValue,
                    si: lhr.audits['speed-index'].numericValue,
                    bytes: lhr.audits['total-byte-weight'].numericValue,
                    requests: lhr.audits['network-requests'].details.items.length,
                });
                if (i === 0) {
                    failing = [];
                    for (const cat of Object.values(lhr.categories)) {
                        for (const ref of cat.auditRefs) {
                            const a = lhr.audits[ref.id];
                            if (a.score === null || a.score >= 0.9 || SERVER_AUDITS.has(a.id)) continue;
                            if (!['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode)) continue;
                            failing.push({ id: a.id, title: a.title, display: a.displayValue || '' });
                        }
                    }
                    fs.writeFileSync(path.join(results, `lhr-${page}-${mode}.json`), JSON.stringify(lhr));
                }
            }
            const keys = Object.keys(runs[0]);
            summary.pages[page][mode] = {
                median: Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))])),
                runs,
                failing: [...new Map(failing.map((f) => [f.id, f])).values()],
            };
            const m = summary.pages[page][mode].median;
            console.log(page, mode, `P${m.performance} A${m.accessibility} BP${m['best-practices']} SEO${m.seo} LCP ${(m.lcp / 1000).toFixed(1)}s TBT ${Math.round(m.tbt)}ms ${Math.round(m.bytes / 1024)}KB`);
        }
    }
    await chrome.kill();
}

// Browser checks: console errors, horizontal overflow, content hidden before scrolling.
const puppeteer = await load('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const hiddenCount = () => {
    const els = [...document.querySelectorAll('main h1, main h2, main h3, main p, main img, section h1, section h2, section h3, section p, section img')];
    const uniq = [...new Set(els)];
    const hidden = uniq.filter((e) => {
        let o = 1;
        for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o < 0.05 || getComputedStyle(e).visibility === 'hidden';
    });
    return { hidden: hidden.length, total: uniq.length };
};
const scrollThrough = async (page) =>
    page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 300) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 900));
    });

const VIEWPORTS = {
    desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
    mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
for (const [pageName, p] of Object.entries(PAGES)) {
    summary.pages[pageName] ??= { url: p };
    const checks = {};
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
        const page = await browser.newPage();
        const errors = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
        await page.setViewport(vp);
        await page.goto(url(p), { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1200));
        const hiddenBeforeScroll = await page.evaluate(hiddenCount);
        // First-screen shots are lossless at 2x; the case study encodes them once, from the PNG.
        if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `${pageName}-${vpName}.png`), type: 'png' });
        await scrollThrough(page);
        if (SHOTS) {
            await page.setViewport({ ...vp, deviceScaleFactor: vpName === 'desktop' ? 0.5 : 1 });
            await page.screenshot({ path: path.join(shotsDir, `${pageName}-${vpName}-full.jpg`), type: 'jpeg', quality: 70, fullPage: true });
        }
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        checks[vpName] = { consoleErrors: [...new Set(errors)], overflowX, hiddenBeforeScroll };
        await page.close();
    }
    for (const [mode, setup] of [
        ['reducedMotion', (pg) => pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])],
        ['noJs', (pg) => pg.setJavaScriptEnabled(false)],
    ]) {
        const page = await browser.newPage();
        await setup(page);
        await page.setViewport(VIEWPORTS.desktop);
        await page.goto(url(p), { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1200));
        checks[`hiddenBeforeScroll_${mode}`] = await page.evaluate(hiddenCount);
        await page.close();
    }
    // Layout shift when images and fonts arrive late (a cold CDN, a slow phone): every
    // image and font is held back 2.5 s, CLS is summed from PerformanceObserver.
    {
        const page = await browser.newPage();
        await page.setViewport({ width: 412, height: 823, isMobile: true, hasTouch: true, deviceScaleFactor: 1.75 });
        await page.setRequestInterception(true);
        page.on('request', (r) => (/\.(avif|webp|png|jpe?g|svg|woff2?)(\?|$)/.test(r.url()) ? setTimeout(() => r.continue(), 2500) : r.continue()));
        await page.evaluateOnNewDocument(() => {
            window.__cls = 0;
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
            }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(url(p), { waitUntil: 'networkidle0', timeout: 90000 });
        await new Promise((r) => setTimeout(r, 1000));
        checks.slowAssetsCls = Number((await page.evaluate(() => window.__cls)).toFixed(3));
        await page.close();
    }
    summary.pages[pageName].checks = checks;
    console.log(pageName, JSON.stringify(checks));
}
await browser.close();
server?.kill();

if (LIGHTHOUSE) fs.writeFileSync(path.join(results, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.exit(0);

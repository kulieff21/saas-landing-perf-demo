// Renders the Upwork portfolio images (1000x750, 4:3, at 2x) from results/summary.json
// and the case-study screenshots, so no number on them is typed by hand.
//
//   node tools/portfolio-images.mjs <output dir>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, resolve } from './deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'results', 'portfolio'));
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 8840;

const s = JSON.parse(fs.readFileSync(path.join(root, 'results', 'summary.json'), 'utf8'));
const B = s.pages.before;
const A = s.pages.after;
const bm = B.mobile.median;
const am = A.mobile.median;
const kb = (x) => Math.round(x / 1024);
const sec = (ms) => (ms / 1000).toFixed(1);
const mb = (x) => (x / 1024 / 1024).toFixed(1);
// Transfer size per resource type, from the Lighthouse resource summary.
const res = (page) =>
    Object.fromEntries(
        JSON.parse(fs.readFileSync(path.join(root, 'results', `lhr-${page}-mobile.json`), 'utf8')).audits['resource-summary'].details.items.map((i) => [i.resourceType, i.transferSize]),
    );
const rb = res('before');
const ra = res('after');
const color = (v) => (v >= 90 ? '#0cce6b' : v >= 50 ? '#ffa400' : '#ff4e42');

const base = `
<style>
@font-face { font-family: Ubuntu; font-weight: 400; src: url(/site/after/assets/fonts/ubuntu-latin-400.woff2); }
@font-face { font-family: Ubuntu; font-weight: 500; src: url(/site/after/assets/fonts/ubuntu-latin-500.woff2); }
@font-face { font-family: Ubuntu; font-weight: 700; src: url(/site/after/assets/fonts/ubuntu-latin-700.woff2); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1000px; height: 750px; overflow: hidden; }
body { font-family: Ubuntu, sans-serif; color: #f4f4f5; background: #050505; position: relative; }
body::before { content: ""; position: absolute; inset: -20%; z-index: -1;
  background: radial-gradient(35% 40% at 20% 20%, #7e22ce55, transparent 70%), radial-gradient(30% 35% at 85% 15%, #54d2d02e, transparent 70%); }
.eyebrow { font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: #d8b4fe; font-weight: 500; }
h1 { font-weight: 700; letter-spacing: -.01em; line-height: 1.05; }
.muted { color: #a1a1aa; }
.frame { border: 1px solid #2e2a3a; border-radius: 12px; overflow: hidden; background: #000; box-shadow: 0 30px 60px -25px #7e22ce99; }
.frame .bar { height: 26px; display: flex; gap: 6px; align-items: center; padding: 0 10px; background: #0f0d15; border-bottom: 1px solid #221f2b; }
.frame .bar i { width: 8px; height: 8px; border-radius: 50%; background: #2a2733; }
.frame img { display: block; width: 100%; }
.tag { display: inline-block; padding: 5px 12px; border-radius: 999px; font-size: 14px; font-weight: 500; border: 1px solid #ffffff26; background: #000000b3; }
.demo { position: absolute; right: 28px; bottom: 20px; font-size: 13px; color: #71717a; }
</style>`;

const pages = {
    '01-cover': `
<div style="padding:52px 56px 0">
  <div class="eyebrow">Front-end performance · before / after</div>
  <h1 style="font-size:58px;margin-top:16px">SaaS landing page,<br><span style="color:${color(bm.performance)}">${bm.performance}</span> → <span style="color:${color(am.performance)}">${am.performance}</span> on mobile</h1>
  <div style="display:flex;gap:14px;margin-top:26px">
    ${[
        ['Lighthouse mobile', `${bm.performance} → ${am.performance}`],
        ['Largest Contentful Paint', `${sec(bm.lcp)} s → ${sec(am.lcp)} s`],
        ['Page weight', `${mb(bm.bytes)} MB → ${kb(am.bytes)} KB`],
    ]
        .map(
            ([l, v]) =>
                `<div style="flex:1;border:1px solid #221f2b;background:#0c0b10cc;border-radius:14px;padding:16px 18px"><div class="muted" style="font-size:15px">${l}</div><div style="font-size:30px;font-weight:700;margin-top:4px">${v}</div></div>`,
        )
        .join('')}
  </div>
</div>
<div class="frame" style="position:absolute;left:56px;right:56px;top:352px;height:460px"><div class="bar"><i></i><i></i><i></i></div><img src="/site/case-assets/after-desktop-1800.webp"></div>
<div class="demo" style="bottom:auto;top:24px">Portfolio demo</div>`,

    '02-same-design': `
<div style="padding:44px 56px 0">
  <div class="eyebrow">Same design, ${Math.round((1 - am.bytes / bm.bytes) * 100)}% less to download</div>
  <h1 style="font-size:40px;margin-top:12px">Original template vs. optimized</h1>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;padding:34px 56px 0">
  ${[
      ['before', 'Original', `${kb(bm.bytes)} KB · LCP ${sec(bm.lcp)} s · score ${bm.performance}`, '#fca5a5'],
      ['after', 'Optimized', `${kb(am.bytes)} KB · LCP ${sec(am.lcp)} s · score ${am.performance}`, '#86efac'],
  ]
      .map(
          ([k, t, m, c]) =>
              `<div><div style="position:relative;padding:0 34px 70px 0">` +
              `<div class="frame"><div class="bar"><i></i><i></i><i></i></div><img src="/site/case-assets/${k}-desktop-1350.webp"></div>` +
              `<div class="frame" style="position:absolute;right:0;bottom:0;width:104px;border-radius:16px;border:5px solid #1b1924;box-shadow:0 20px 40px -10px #000"><img src="/site/case-assets/${k}-mobile-560.webp" style="height:200px;object-fit:cover;object-position:top"></div></div>` +
              `<div style="margin-top:6px"><span class="tag" style="color:${c}">${t}</span></div><div class="muted" style="margin-top:12px;font-size:19px">${m}</div></div>`,
      )
      .join('')}
</div>
<div class="demo" style="left:56px;right:auto;bottom:28px;font-size:14px">Dashdark is a fictional product · template: SaaSyDark (MIT) · desktop and mobile screenshots</div>`,

    '03-scores': `
<div style="padding:44px 56px 0">
  <div class="eyebrow">Lighthouse, mobile · median of ${s.runs} runs</div>
  <h1 style="font-size:40px;margin-top:12px">All four categories in the green</h1>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:34px 56px 0">
  ${[
      ['performance', 'Performance'],
      ['accessibility', 'Accessibility'],
      ['best-practices', 'Best practices'],
      ['seo', 'SEO'],
  ]
      .map(([k, n]) => {
          const b = bm[k];
          const a = am[k];
          const c = 2 * Math.PI * 45;
          return `<div style="border:1px solid #221f2b;background:#0c0b10;border-radius:16px;padding:22px 10px;text-align:center">
        <svg viewBox="0 0 100 100" style="width:120px;height:120px;transform:rotate(-90deg)"><circle cx="50" cy="50" r="45" fill="none" stroke="#1f1d26" stroke-width="8"/><circle cx="50" cy="50" r="45" fill="none" stroke="${color(a)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${((a / 100) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
        <div style="margin-top:-86px;height:52px;font-size:36px;font-weight:700;color:${color(a)}">${a}</div>
        <div style="margin-top:30px;font-size:19px;font-weight:500">${n}</div>
        <div class="muted" style="margin-top:6px;font-size:16px">was <b style="color:${color(b)}">${b}</b></div></div>`;
      })
      .join('')}
</div>
<div style="margin:30px 56px 0;border:1px solid #221f2b;border-radius:16px;overflow:hidden">
  ${[
      ['First Contentful Paint', `${sec(bm.fcp)} s`, `${sec(am.fcp)} s`],
      ['Largest Contentful Paint', `${sec(bm.lcp)} s`, `${sec(am.lcp)} s`],
      ['Transferred on load', `${kb(bm.bytes)} KB`, `${kb(am.bytes)} KB`],
      ['Requests', `${bm.requests}`, `${am.requests}`],
      ['Layout shift, slow images', `${B.checks.slowAssetsCls.toFixed(3)}`, `${A.checks.slowAssetsCls.toFixed(3)}`],
  ]
      .map(
          ([l, b, a], i) =>
              `<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;padding:11px 20px;font-size:18px;${i ? 'border-top:1px solid #221f2b' : ''}"><span>${l}</span><span class="muted" style="text-align:right">${b}</span><span style="text-align:right;font-weight:500">${a}</span></div>`,
      )
      .join('')}
</div>`,

    '04-fixes': `
<div style="padding:44px 56px 0">
  <div class="eyebrow">What changed</div>
  <h1 style="font-size:40px;margin-top:12px">Nine fixes, no redesign</h1>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:28px 56px 0">
  ${[
      ['Responsive AVIF/WebP images', `images on load ${kb(rb.image)} KB → ${kb(ra.image)} KB`],
      ['One inlined stylesheet', 'no render-blocking CSS'],
      ['3 self-hosted font weights', 'subset, preloaded; icons as SVG'],
      ['No animation library', 'IntersectionObserver + CSS'],
      ['SEO basics', `score ${bm.seo} → ${am.seo}`],
      ['Images keep their box', `CLS on slow load ${B.checks.slowAssetsCls.toFixed(3)} → ${A.checks.slowAssetsCls.toFixed(3)}`],
      ['Motion respects user settings', 'content visible without JS'],
      ['Keyboard and screen readers', 'FAQ, menu, form, skip link'],
      ['Honest copy', 'no fake logos or reviews'],
  ]
      .map(
          ([t, d]) =>
              `<div style="border:1px solid #221f2b;background:#0c0b10;border-radius:14px;padding:14px 18px;display:flex;gap:14px;align-items:center"><span style="flex:none;width:30px;height:30px;border-radius:50%;background:#0cce6b22;color:#0cce6b;display:grid;place-items:center;font-weight:700">✓</span><div><div style="font-size:18px;font-weight:500">${t}</div><div class="muted" style="font-size:15px;margin-top:2px">${d}</div></div></div>`,
      )
      .join('')}
</div>`,
};

const tmp = path.join(root, '.build', 'portfolio');
fs.mkdirSync(tmp, { recursive: true });
for (const [name, body] of Object.entries(pages)) fs.writeFileSync(path.join(tmp, `${name}.html`), `<!doctype html><meta charset="utf-8">${base}<body>${body}</body>`);

const server = spawn(process.execPath, [resolve('http-server/bin/http-server'), root, '-p', String(PORT), '-s', '-c-1']);
await new Promise((r) => setTimeout(r, 1500));
const puppeteer = await load('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 750, deviceScaleFactor: 2 });
for (const name of Object.keys(pages)) {
    await page.goto(`http://localhost:${PORT}/.build/portfolio/${name}.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`${name}.png`);
}
await browser.close();
server.kill();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);

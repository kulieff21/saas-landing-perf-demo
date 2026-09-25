// Renders site/index.html (the case study) from src/case/index.html, filling
// every number from results/ so nothing on the page is typed by hand.
//
//   node tools/case-study.mjs        (after tools/measure.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = path.join(root, 'results');
const site = path.join(root, 'site');
const sharp = await load('sharp');

const summary = JSON.parse(fs.readFileSync(path.join(results, 'summary.json'), 'utf8'));
const lhr = (page, mode) => JSON.parse(fs.readFileSync(path.join(results, `lhr-${page}-${mode}.json`), 'utf8'));
const B = summary.pages.before;
const A = summary.pages.after;
const bm = B.mobile.median;
const am = A.mobile.median;

const kb = (bytes) => Math.round(bytes / 1024);
const sec = (ms) => (ms / 1000).toFixed(1);
const resources = (page) =>
    Object.fromEntries(lhr(page, 'mobile').audits['resource-summary'].details.items.map((i) => [i.resourceType, i]));
const rb = resources('before');
const ra = resources('after');
const scriptKb = (page, re) =>
    kb(
        lhr(page, 'mobile')
            .audits['network-requests'].details.items.filter((i) => re.test(i.url))
            .reduce((s, i) => s + i.transferSize, 0),
    );

// --- screenshots ----------------------------------------------------------
const assets = path.join(site, 'case-assets');
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
const shots = {};
for (const [name, widths] of [
    ['before-desktop', [720, 1200]],
    ['after-desktop', [720, 1200]],
    ['before-mobile', [280, 560]],
    ['after-mobile', [280, 560]],
]) {
    const input = path.join(results, 'screenshots', `${name}.jpg`);
    const meta = await sharp(input).metadata();
    for (const w of widths) await sharp(input).resize(w).webp({ quality: 80 }).toFile(path.join(assets, `${name}-${w}.webp`));
    const big = widths.at(-1);
    const h = Math.round((meta.height * big) / meta.width);
    const sizes = name.endsWith('desktop') ? '(max-width: 860px) 100vw, 548px' : '(max-width: 700px) 42vw, 280px';
    const label = name.startsWith('before') ? 'Original SaaSyDark template' : 'Optimized Dashdark page';
    const view = name.endsWith('desktop') ? 'desktop, 1440 px wide' : 'mobile, 390 px wide';
    shots[name] =
        `<img src="./case-assets/${name}-${widths[0]}.webp" srcset="${widths.map((w) => `./case-assets/${name}-${w}.webp ${w}w`).join(', ')}"` +
        ` sizes="${sizes}" width="${big}" height="${h}" loading="lazy" decoding="async" alt="${label}, first screen on ${view}">`;
}

// --- gauges ---------------------------------------------------------------
const color = (score) => (score >= 90 ? 'var(--good)' : score >= 50 ? 'var(--avg)' : 'var(--poor)');
const CATS = [
    ['performance', 'Performance'],
    ['accessibility', 'Accessibility'],
    ['best-practices', 'Best practices'],
    ['seo', 'SEO'],
];
const gauges = (mode) =>
    CATS.map(([key, name]) => {
        const before = B[mode].median[key];
        const after = A[mode].median[key];
        const c = 2 * Math.PI * 45;
        // The markup shows the final score; case.js replays before -> after when it scrolls into view.
        return (
            `<div class="gauge" data-from="${before}" data-to="${after}">` +
            `<div class="ring" role="img" aria-label="${name}: ${after} out of 100, was ${before}">` +
            `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="45" fill="none" stroke-width="8"/>` +
            `<circle class="arc" cx="50" cy="50" r="45" fill="none" stroke="${color(after)}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${((1 - after / 100) * c).toFixed(2)}"/></svg>` +
            `<span class="val" style="color:${color(after)}">${after}</span></div>` +
            `<span class="name">${name}</span>` +
            `<span class="was" style="--c:${color(before)}">${before === after ? 'unchanged, was' : 'was'} <b>${before}</b></span>` +
            `</div>`
        );
    }).join('');

// --- metric table ---------------------------------------------------------
const pct = (b, a) => (b === 0 ? '' : `${a < b ? '−' : '+'}${Math.abs(Math.round(((a - b) / b) * 100))}%`);
const METRICS = [
    ['First Contentful Paint', 'fcp', (v) => `${sec(v)} s`],
    ['Largest Contentful Paint', 'lcp', (v) => `${sec(v)} s`],
    ['Speed Index', 'si', (v) => `${sec(v)} s`],
    ['Total Blocking Time', 'tbt', (v) => `${Math.round(v)} ms`],
    ['Cumulative Layout Shift', 'cls', (v) => v.toFixed(3)],
    ['Transferred on load', 'bytes', (v) => `${kb(v)} KB`],
    ['Requests', 'requests', (v) => String(v)],
];
const metricRows = METRICS.map(([label, key, fmt]) => {
    const b = bm[key];
    const a = am[key];
    // A metric that got worse is shown as it is, not hidden.
    const worse = a > b && fmt(a) !== fmt(b);
    const delta = worse ? (b === 0 ? `+${fmt(a)}` : pct(b, a)) : fmt(a) === fmt(b) || key === 'cls' ? '—' : pct(b, a);
    return `<tr><td>${label}</td><td>${fmt(b)}</td><td class="after">${fmt(a)}</td><td class="delta${worse ? ' worse' : ''}">${delta}</td></tr>`;
}).join('');

// --- bytes bars -----------------------------------------------------------
const TYPES = [
    ['image', 'Images', '#a855f7'],
    ['font', 'Fonts', '#54d2d0'],
    ['script', 'JavaScript', '#ffa400'],
    ['stylesheet', 'CSS', '#f472b6'],
    ['document', 'HTML', '#e4e4e7'],
    ['other', 'Other', '#52525b'],
];
const maxTotal = Math.max(rb.total.transferSize, ra.total.transferSize);
const bar = (who, r) =>
    `<div class="bytes-row"><span class="who">${who}</span><div class="bar">` +
    TYPES.map(([t, name, c]) => {
        const size = r[t]?.transferSize || 0;
        return size ? `<span style="width:${((size / maxTotal) * 100).toFixed(2)}%;--c:${c}" data-label="${name} ${kb(size)} KB"></span>` : '';
    }).join('') +
    `</div><span class="total">${kb(r.total.transferSize)} KB</span></div>`;
const bytesLegend = TYPES.map(([t, name, c]) => `<span style="--c:${c}">${name} ${kb(rb[t]?.transferSize || 0)} → ${kb(ra[t]?.transferSize || 0)} KB</span>`).join('');

const arrow =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8"/></svg>';

const afterHtml = fs.readFileSync(path.join(site, 'after', 'index.html'), 'utf8');
const inlineCss = afterHtml.match(/<style>([\s\S]*?)<\/style>/)[1];

const values = {
    mPerfB: bm.performance,
    mPerfA: am.performance,
    mSeoB: bm.seo,
    mSeoA: am.seo,
    lcpB: sec(bm.lcp),
    lcpA: sec(am.lcp),
    fcpB: sec(bm.fcp),
    fcpA: sec(am.fcp),
    kbB: kb(bm.bytes),
    kbA: kb(am.bytes),
    reqB: bm.requests,
    reqA: am.requests,
    weightCut: Math.round((1 - am.bytes / bm.bytes) * 100),
    runs: summary.runs,
    date: summary.date.slice(0, 10),
    lhVersion: lhr('after', 'mobile').lighthouseVersion,
    imgB: kb(rb.image.transferSize),
    imgA: kb(ra.image.transferSize),
    fontB: kb(rb.font.transferSize),
    fontA: kb(ra.font.transferSize),
    jsB: kb(rb.script.transferSize),
    jsA: kb(ra.script.transferSize),
    thirdB: rb['third-party'].requestCount,
    gsapKb: scriptKb('before', /gsap/),
    iconFontKb: scriptKb('before', /bootstrap-icons\.woff2/),
    cssKb: (Buffer.byteLength(inlineCss) / 1024).toFixed(0),
    hiddenB: B.checks.desktop.hiddenBeforeScroll.hidden,
    hiddenTotalB: B.checks.desktop.hiddenBeforeScroll.total,
    hiddenRmB: B.checks.hiddenBeforeScroll_reducedMotion.hidden,
    hiddenRmA: A.checks.hiddenBeforeScroll_reducedMotion.hidden,
    gaugesMobile: gauges('mobile'),
    gaugesDesktop: gauges('desktop'),
    metricRows,
    bytesRows: bar('Original', rb) + bar('Optimized', ra),
    bytesLegend,
    shotBeforeDesktop: shots['before-desktop'],
    shotAfterDesktop: shots['after-desktop'],
    shotBeforeMobile: shots['before-mobile'],
    shotAfterMobile: shots['after-mobile'],
    shotHero: shots['after-desktop'].replace(' loading="lazy"', ' fetchpriority="high"').replace(/sizes="[^"]*"/, 'sizes="540px"'),
    arrow,
};

let html = fs.readFileSync(path.join(root, 'src', 'case', 'index.html'), 'utf8');
html = html.replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in values)) throw new Error(`No value for ${m}`);
    return String(values[key]);
});
fs.writeFileSync(path.join(site, 'index.html'), html);
console.log('site/index.html written', JSON.stringify({ mobile: `${values.mPerfB} -> ${values.mPerfA}`, lcp: `${values.lcpB} -> ${values.lcpA}`, kb: `${values.kbB} -> ${values.kbA}` }));

// Drives the optimized page in a real browser: mobile menu, FAQ (mouse and
// keyboard), sign-up form, anchor links. Exits non-zero on the first failure.
//
//   node tools/interactions.mjs
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, resolve } from './deps.mjs';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 8821;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn(process.execPath, [resolve('http-server/bin/http-server'), path.join(root, 'site'), '-p', String(PORT), '-s', '-c-1']);
await new Promise((r) => setTimeout(r, 1500));

const puppeteer = await load('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
    for (const page_ of ['/after/index.html', '/index.html']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('requestfailed', (r) => errors.push(`request failed ${r.url()}`));
        await page.goto(`http://localhost:${PORT}${page_}`, { waitUntil: 'networkidle0' });
        const broken = await page.evaluate(async () => {
            const bad = [];
            for (const a of document.querySelectorAll('a[href]')) {
                const href = a.getAttribute('href');
                if (href.startsWith('#') && !document.querySelector(href)) bad.push(href);
            }
            return bad;
        });
        check(`${page_}: in-page anchors resolve`, broken.length === 0, broken.join(', '));
        check(`${page_}: no console errors`, errors.length === 0, errors.join(' | '));
        await page.close();
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`http://localhost:${PORT}/after/index.html`, { waitUntil: 'networkidle0' });

    const menuState = () =>
        page.evaluate(() => {
            const menu = document.getElementById('collapsed-header-items');
            return {
                visibility: getComputedStyle(menu).visibility,
                expanded: document.getElementById('collapse-btn').getAttribute('aria-expanded'),
            };
        });
    let s = await menuState();
    check('mobile menu starts hidden (links not focusable)', s.visibility === 'hidden' && s.expanded === 'false', JSON.stringify(s));
    await page.click('#collapse-btn');
    await wait(400);
    s = await menuState();
    check('menu opens on tap', s.visibility === 'visible' && s.expanded === 'true', JSON.stringify(s));
    await page.keyboard.press('Escape');
    await wait(400);
    s = await menuState();
    const focusBack = await page.evaluate(() => document.activeElement?.id);
    check('Escape closes menu and returns focus', s.visibility === 'hidden' && focusBack === 'collapse-btn', `${JSON.stringify(s)} focus=${focusBack}`);
    await page.click('#collapse-btn');
    await wait(400);
    await page.click('#collapsed-header-items a[href="#pricing"]');
    await wait(900);
    s = await menuState();
    check('tapping a menu link closes the menu', s.visibility === 'hidden', JSON.stringify(s));

    const faq = () =>
        page.evaluate(() => {
            const btn = document.querySelector('.faq-accordion');
            const content = document.getElementById(btn.getAttribute('aria-controls'));
            return { expanded: btn.getAttribute('aria-expanded'), visibility: getComputedStyle(content).visibility, height: content.getBoundingClientRect().height };
        });
    let f = await faq();
    check('FAQ answer starts collapsed and hidden', f.expanded === 'false' && f.visibility === 'hidden', JSON.stringify(f));
    await page.focus('.faq-accordion');
    await page.keyboard.press('Enter');
    await wait(600);
    f = await faq();
    check('FAQ opens with keyboard (Enter)', f.expanded === 'true' && f.visibility === 'visible' && f.height > 20, JSON.stringify(f));
    await page.keyboard.press('Space');
    await wait(600);
    f = await faq();
    check('FAQ closes with keyboard (Space)', f.expanded === 'false' && f.visibility === 'hidden', JSON.stringify(f));

    await page.evaluate(() => document.getElementById('signup-email').scrollIntoView());
    await page.click('#signup-form button[type=submit]');
    let status = await page.$eval('.form-status', (e) => e.textContent);
    check('empty email shows an error', /valid email/i.test(status), status);
    await page.type('#signup-email', 'test@example.com');
    await page.click('#signup-form button[type=submit]');
    status = await page.$eval('.form-status', (e) => e.textContent);
    check('valid email shows the demo notice', /nothing was sent/i.test(status), status);

    const desktop = await browser.newPage();
    await desktop.setViewport({ width: 1440, height: 900 });
    await desktop.goto(`http://localhost:${PORT}/after/index.html`, { waitUntil: 'networkidle0' });
    const nav = await desktop.evaluate(() => ({
        visibility: getComputedStyle(document.getElementById('collapsed-header-items')).visibility,
        btn: getComputedStyle(document.getElementById('collapse-btn')).display,
    }));
    check('desktop nav visible, menu button hidden', nav.visibility === 'visible' && nav.btn === 'none', JSON.stringify(nav));

    // Case study page: animations, slider, and that nothing depends on them.
    const cs = await browser.newPage();
    await cs.setViewport({ width: 1440, height: 900 });
    await cs.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });
    await cs.evaluate(() => document.querySelector('.gauges .gauge').scrollIntoView({ block: 'center' }));
    await wait(500);
    const mid = await cs.$eval('.gauges .gauge .val', (e) => Number(e.textContent));
    await wait(2200);
    const end = await cs.$eval('.gauges .gauge', (g) => [Number(g.querySelector('.val').textContent), Number(g.dataset.to), Number(g.dataset.from)]);
    check('performance gauge animates from before to after', mid < end[1] && mid >= end[2] && end[0] === end[1], `mid=${mid} end=${end[0]} target=${end[1]}`);
    await cs.evaluate(() => document.querySelector('.slider').scrollIntoView({ block: 'center' }));
    await wait(5000);
    const box = await (await cs.$('.stage')).boundingBox();
    await cs.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await cs.mouse.down();
    await cs.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
    await cs.mouse.up();
    const pos = await cs.$eval('.slider', (e) => parseFloat(e.style.getPropertyValue('--pos')));
    check('compare slider follows a drag', Math.abs(pos - 20) < 4, `--pos=${pos}`);
    await cs.focus('.stage input');
    await cs.keyboard.press('ArrowRight');
    const pos2 = await cs.$eval('.slider', (e) => parseFloat(e.style.getPropertyValue('--pos')));
    check('compare slider works with the keyboard', pos2 > pos, `--pos=${pos2}`);

    for (const [label, setup] of [
        ['reduced motion', (pg) => pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])],
        ['JavaScript off', (pg) => pg.setJavaScriptEnabled(false)],
    ]) {
        const pg = await browser.newPage();
        await setup(pg);
        await pg.setViewport({ width: 1440, height: 900 });
        await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });
        await wait(300);
        const state = await pg.evaluate(() => {
            const els = [...document.querySelectorAll('main h2, main h3, main p, main .gauge, main .fix')];
            const hidden = els.filter((e) => Number(getComputedStyle(e).opacity) < 0.5).length;
            const vals = [...document.querySelectorAll('.gauges .gauge')].map((g) => g.querySelector('.val').textContent === g.dataset.to);
            return { hidden, total: els.length, finalScores: vals.every(Boolean) };
        });
        check(`case study fully visible with final numbers (${label})`, state.hidden === 0 && state.finalScores, JSON.stringify(state));
        await pg.close();
    }
} finally {
    await browser.close();
    server.kill();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

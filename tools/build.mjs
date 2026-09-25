// Builds site/after/ from src/after/ and the original template assets in site/before/.
//
//   node tools/build.mjs
//
// - images: responsive AVIF + WebP variants with explicit width/height
// - icons: Bootstrap Icons inlined as SVG (no icon font, no CDN)
// - fonts: self-hosted Ubuntu, subset to Latin-1, three weights
// - CSS: Tailwind built from the rendered HTML, minified and inlined
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, pkgDir, resolve } from './deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'after');
const beforeAssets = path.join(root, 'site', 'before', 'assets');
const out = path.join(root, 'site', 'after');
const tmp = path.join(root, '.build');

const sharp = await load('sharp');

// name -> source file and output widths
const IMAGES = {
    dashboard: { file: 'images/home/dashboard.png', widths: [480, 800, 1228] },
    dash: { file: 'images/home/dash.png', widths: [640, 1024, 1440, 1700] },
    insights: { file: 'images/home/insights.png', widths: [640, 1024, 1440, 1700] },
    forest: { file: 'images/home/forest.jpg', widths: [400, 640] },
    mountain: { file: 'images/home/mountain.jpg', widths: [400, 640] },
    photography: { file: 'images/home/photography.jpg', widths: [400, 640] },
    logo: { file: 'logo/logo.png', widths: [48, 100, 150] },
};

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets', 'img'), { recursive: true });
fs.mkdirSync(path.join(out, 'assets', 'fonts'), { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

// --- images ---------------------------------------------------------------
const variants = {};
for (const [name, spec] of Object.entries(IMAGES)) {
    const input = path.join(beforeAssets, spec.file);
    const meta = await sharp(input).metadata();
    variants[name] = [];
    for (const w of spec.widths) {
        const width = Math.min(w, meta.width);
        const height = Math.round((meta.height * width) / meta.width);
        const base = path.join(out, 'assets', 'img', `${name}-${width}`);
        await sharp(input).resize(width).avif({ quality: 50, effort: 6 }).toFile(`${base}.avif`);
        await sharp(input).resize(width).webp({ quality: 78, effort: 6 }).toFile(`${base}.webp`);
        variants[name].push({ width, height });
    }
}

const logo = path.join(beforeAssets, 'logo', 'logo.png');
await sharp(logo).resize(32).png().toFile(path.join(out, 'assets', 'img', 'favicon-32.png'));
await sharp(logo)
    .resize(140)
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#000' })
    .flatten({ background: '#000' })
    .png()
    .toFile(path.join(out, 'assets', 'img', 'apple-touch-icon.png'));
await sharp(path.join(beforeAssets, 'images', 'home', 'dashboard.png'))
    .resize(1200, 630, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(out, 'assets', 'img', 'og.jpg'));

// --- fonts ----------------------------------------------------------------
// Ubuntu latin files from Google Fonts (src/after/fonts), subset to Latin-1 plus
// the typographic punctuation the copy uses, with hinting removed (~60% smaller).
const subsetFont = await load('subset-font');
const GLYPHS =
    String.fromCharCode(...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i)) +
    String.fromCharCode(...Array.from({ length: 0x100 - 0xa0 }, (_, i) => 0xa0 + i)) +
    '\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2192\u00b7\u2022';
for (const weight of [400, 500, 700]) {
    const f = `ubuntu-latin-${weight}.woff2`;
    const buf = fs.readFileSync(path.join(src, 'fonts', f));
    fs.writeFileSync(path.join(out, 'assets', 'fonts', f), await subsetFont(buf, GLYPHS, { targetFormat: 'woff2', noHinting: true }));
}
fs.copyFileSync(path.join(src, 'fonts', 'LICENSE-UFL-1.0.txt'), path.join(out, 'assets', 'fonts', 'LICENSE-UFL-1.0.txt'));

// --- HTML -----------------------------------------------------------------
const iconDir = path.join(pkgDir('bootstrap-icons'), 'icons');
const icon = (name) => {
    const svg = fs.readFileSync(path.join(iconDir, `${name}.svg`), 'utf8').trim();
    return svg
        .replace(/ width="16" height="16"/, '')
        .replace(/ class="[^"]*"/, ` class="bi bi-${name}"`)
        .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
        .replace(/\s*\n\s*/g, '');
};

const srcset = (name, ext) => variants[name].map((v) => `./assets/img/${name}-${v.width}.${ext} ${v.width}w`).join(', ');
const picture = (name, alt, sizes, cls, mode) => {
    const largest = variants[name].at(-1);
    const fallback = variants[name][Math.min(1, variants[name].length - 1)];
    const loading =
        mode === 'hero' ? ' fetchpriority="high"' : mode === 'lazy' ? ' loading="lazy" decoding="async"' : '';
    return (
        `<picture>` +
        `<source type="image/avif" srcset="${srcset(name, 'avif')}" sizes="${sizes}">` +
        `<img src="./assets/img/${name}-${fallback.width}.webp" srcset="${srcset(name, 'webp')}" sizes="${sizes}"` +
        ` width="${largest.width}" height="${largest.height}" alt="${alt}" class="${cls}"${loading}>` +
        `</picture>`
    );
};

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html
    .replace(/\{\{icon ([a-z0-9-]+)\}\}/g, (_, name) => icon(name))
    .replace(/\{\{img ([^}]+)\}\}/g, (_, args) => picture(...args.split('|').map((s) => s.trim())));
const leftover = html.match(/\{\{[^}]*\}\}/);
if (leftover) throw new Error(`Unrendered token: ${leftover[0]}`);

// --- CSS ------------------------------------------------------------------
const renderedHtml = path.join(tmp, 'index.html');
fs.writeFileSync(renderedHtml, html);
fs.copyFileSync(path.join(src, 'main.js'), path.join(out, 'main.js'));
const config = path.join(tmp, 'tailwind.config.cjs');
fs.writeFileSync(
    config,
    `const base = require(${JSON.stringify(path.join(src, 'tailwind.config.cjs'))});\n` +
        `module.exports = { ...base, content: ${JSON.stringify([renderedHtml, path.join(src, 'main.js')])} };\n`,
);
const cssOut = path.join(tmp, 'styles.css');
execFileSync(process.execPath, [resolve('tailwindcss/lib/cli.js'), '-c', config, '-i', path.join(src, 'styles.css'), '-o', cssOut, '--minify'], {
    stdio: ['ignore', 'ignore', 'inherit'],
});
const css = fs.readFileSync(cssOut, 'utf8').trim();
if (!html.includes('/*inline-css*/')) throw new Error('Missing /*inline-css*/ marker');
html = html.replace('/*inline-css*/', css);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.rmSync(tmp, { recursive: true, force: true });

// --- report ---------------------------------------------------------------
const sizeOf = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
        const p = path.join(dir, e.name);
        return sum + (e.isDirectory() ? sizeOf(p) : fs.statSync(p).size);
    }, 0);
console.log(`index.html ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB (inline CSS ${(css.length / 1024).toFixed(1)} KB)`);
console.log(`site/after total on disk ${(sizeOf(out) / 1024).toFixed(0)} KB (all variants; a browser loads one per image)`);

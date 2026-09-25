# SaaS landing page: before/after performance fix (demo)

A portfolio case study by **Elmar Guliyev**.

**Live:** [case study](https://kulieff21.github.io/saas-landing-perf-demo/) ·
[optimized page](https://kulieff21.github.io/saas-landing-perf-demo/after/) ·
[original template](https://kulieff21.github.io/saas-landing-perf-demo/before/) I took an open-source SaaS landing template, measured it exactly as it
ships, then fixed what was slowing it down without changing how it looks.

**Dashdark is a fictional product.** The page copy was written for this demo because the
template shipped with lorem ipsum. No real customers, reviews or brand logos are shown.

## Result

Lighthouse 12.8.2, headless Chrome, median of 3 runs per version, measured 2026-09-25.
Both versions served by the same local static server.

| Mobile | Original | Optimized |
|---|---|---|
| Performance | 67 | **99** |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 82 | **100** |
| Largest Contentful Paint | 6.7 s | **1.7 s** |
| First Contentful Paint | 4.2 s | **1.6 s** |
| Total Blocking Time | 0 ms | 28 ms |
| Transferred on load | 1415 KB | **159 KB** |
| Requests | 32 | **9** |

Desktop: Performance 97 → 100, Best practices 96 → 100, SEO 82 → 100.
Full numbers, per-run values and the failing audits are in [`results/summary.json`](results/summary.json).

**Live check** (GitHub Pages, gzip and CDN on, 2026-09-25, 3 runs, mobile): Performance 69 → **96** (runs 99, 95, 96), LCP 5.2 s → **1.6 s**, 1332 KB → **93 KB** transferred. Raw data in [`results/live/`](results/live/summary.json).

Mobile scores move a few points between sessions (the original measured 47–67 across all
runs so far); the gap between the two versions does not.

## What changed

| Original | Optimized |
|---|---|
| PNG screenshots up to 2876 px wide, no `width`/`height`, all loaded up front | Responsive AVIF + WebP (2–4 sizes each), explicit dimensions, lazy below the fold, hero image at high priority |
| 4 render-blocking stylesheets, including a Google Fonts `@import` inside CSS | Tailwind rebuilt from the real markup, minified and inlined |
| Ubuntu in 8 styles + an unused Dancing Script family; 128 KB icon font for 18 icons | 3 self-hosted Ubuntu weights, subset to Latin-1 without hinting (39 KB); icons inlined as SVG |
| GSAP + ScrollTrigger from a CDN for fade-ins and the hero tilt | `IntersectionObserver` + a CSS scroll-driven animation; no third-party requests |
| Empty meta description, no `<h1>`, `href=""` links, empty Open Graph tags | Description, one `<h1>`, logical headings, working anchors, OG image |
| Hero image reserves no space: with images and fonts 2.5 s late, layout shift (CLS) 0.099 | Images keep their box from `width`/`height`: CLS 0.004 under the same delay |
| 56 of 61 text/image elements invisible until scrolled, also with reduced motion | Visible by default; fade-ins only when JS has loaded and reduced motion is off |
| FAQ made of `<div>`s, closed mobile menu still focusable, unlabeled email input | Buttons with `aria-expanded`, hidden closed menu (Escape closes it), labelled form, skip link, focus styles |
| Lorem ipsum, real company logos under "Trusted by", invented testimonials | Copy for a clearly labelled fictional product; the testimonial grid became a "who it's for" grid |

## Layout

```
site/                 deploy root
  index.html          case study page (generated)
  before/             the template exactly as downloaded (+ its LICENSE)
  after/              optimized page (generated)
  case-assets/        screenshots used by the case study (generated)
src/
  after/              source of the optimized page (HTML, CSS, JS, fonts)
  case/               case study template
tools/
  build.mjs           src/after -> site/after (images, fonts, icons, CSS)
  measure.mjs         Lighthouse + browser checks for before and after -> results/
  interactions.mjs    menu, FAQ, form and anchor tests on the optimized page
  case-study.mjs      results/ -> site/index.html (no hand-typed numbers)
  portfolio-images.mjs  results/ -> 1000x750 portfolio images (at 2x)
results/              summary.json, full Lighthouse reports, screenshots
```

## Run it

Requires Node 22 and Google Chrome.

```bash
cd tools && npm install && cd ..
node tools/build.mjs
node tools/measure.mjs --runs 3
node tools/interactions.mjs
node tools/case-study.mjs
node tools/measure.mjs --live https://kulieff21.github.io/saas-landing-perf-demo   # optional: results/live/
npx http-server site     # then open http://localhost:8080
```

`CHROME_PATH` overrides the Chrome location. `DEPS_DIR` lets the scripts use a `node_modules`
installed elsewhere.

## Credits and licenses

- Original page: [SaaSyDark](https://github.com/PaulleDemon/awesome-landing-pages/tree/main/src/saas/SaaSyDark)
  from PaulleDemon/awesome-landing-pages, commit `54e867c`, MIT license
  ([`site/before/LICENSE.txt`](site/before/LICENSE.txt)). Its images come from free-to-use sources
  listed in that repository.
- Font: Ubuntu, [Ubuntu Font Licence 1.0](src/after/fonts/LICENSE-UFL-1.0.txt).
- Icons: [Bootstrap Icons](https://icons.getbootstrap.com/), MIT.
- Everything else in this repository: MIT, see [`LICENSE`](LICENSE).

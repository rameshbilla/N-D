// Captures the continuous production story at key moments (desktop + mobile) and checks that it is
// scroll-linked: same position → same frame, scrolling back → earlier stage, and that the SAME
// ingredient objects persist (7 ingredients → 24 slices) across the whole journey.
// Usage: BASE_URL=http://localhost:4000 node scripts/screenshots.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL || 'http://localhost:4000';
const out = process.argv[2] || 'test-results/screens';
mkdirSync(out, { recursive: true });

const TOTAL = 103; // timeline units (10 stages × 10 + hold) — keep in sync with production-timeline.ts
const MOMENTS = [
  [4, 'fresh'], [16, 'washing'], [22.4, 'cutting-first'], [26, 'cutting-mid'], [32.8, 'loading-trays'], [37.4, 'drying-inside'],
  [9.6, 'transition-1-2'], [46.6, 'collection'], [49.6, 'transition-5-6'], [53.4, 'grinding-carrot'], [57, 'grinding-beet'], [63.3, 'mixing-pour'], [67.4, 'mixing-blend'],
  [75.5, 'sieving'], [84.8, 'filling'], [88, 'sealed-labelled'], [96, 'showcase'],
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: true });
const results = [];
// factor = viewport-heights of scroll per stage (SCROLL_PER_STAGE in production-story.ts): wide = landscape ≥768px.
const factorFor = (w, h) => (w >= 768 && w >= h ? 1.8 : 1.5);
const ONLY = process.env.VIEWPORTS?.split(',');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, shots: MOMENTS },
  { name: 'laptop', width: 1280, height: 720, shots: MOMENTS.filter((_, i) => i % 3 === 0) },
  { name: 'tablet-portrait', width: 768, height: 1024, isMobile: true, hasTouch: true, shots: MOMENTS.filter((_, i) => i % 3 === 1) },
  { name: 'phone-landscape', width: 844, height: 390, isMobile: true, hasTouch: true, shots: MOMENTS.filter((_, i) => i % 3 === 2) },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, shots: MOMENTS.filter((_, i) => i % 2 === 0) },
  { name: 'small-phone', width: 360, height: 640, isMobile: true, hasTouch: true, shots: MOMENTS.filter((_, i) => i % 3 === 0) },
].filter((v) => !ONLY || ONLY.includes(v.name));
for (const v of VIEWPORTS) {
  const vp = { ...v, factor: factorFor(v.width, v.height) };
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const counts = await page.evaluate(() => ({
    ingredients: document.querySelectorAll('[data-ingredient]').length,
    slices: document.querySelectorAll('[data-ingredient] [data-slice]').length,
  }));
  results.push(`${vp.name}: persistent objects → ${counts.ingredients} ingredients, ${counts.slices} slices`);
  const pinLen = await page.evaluate((f) => innerHeight * 10 * f, vp.factor);
  const stepLabel = () => page.evaluate(() => document.querySelector('[aria-current="step"]')?.getAttribute('aria-label')?.replace('Go to ', '') ?? 'none');
  const goTo = async (t) => {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((pinLen * t) / TOTAL));
    await page.waitForTimeout(2200); // let scrub smoothing settle
  };
  for (const [t, name] of vp.shots) {
    await goTo(t);
    await page.screenshot({ path: `${out}/${vp.name}-${String(Math.round(t)).padStart(3, '0')}-${name}.png` });
    results.push(`${vp.name} t=${t} (${name}) → ${await stepLabel()}`);
  }
  // Continuity probe at the grinder: carrot slices already ground (hidden), beet slices not yet.
  await goTo(55.2);
  results.push(`${vp.name} grinder probe: ${await page.evaluate(() => {
    const op = (sel) => [...document.querySelectorAll(sel)].map((e) => Number(getComputedStyle(e).opacity));
    const c = op('[data-itype="carrot"] [data-slice]');
    const b = op('[data-itype="beet"] [data-slice]');
    return `carrot slices visible ${c.filter((o) => o > 0.5).length}/${c.length}, beet slices visible ${b.filter((o) => o > 0.5).length}/${b.length}`;
  })}`);
  await goTo(30);
  results.push(`${vp.name} reverse to t=30 → ${await stepLabel()}`);
  const a = await page.screenshot();
  await page.waitForTimeout(1200);
  const b = await page.screenshot();
  results.push(`${vp.name} paused frame stable: ${Buffer.compare(a, b) === 0}`);
  results.push(`${vp.name} horizontal overflow: ${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`);
  results.push(`${vp.name} errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await ctx.close();
}
await browser.close();
console.log(results.join('\n'));

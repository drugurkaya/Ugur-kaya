// Deterministic in-game screenshots at specific animation frames (visual QA).
// Usage: node scripts/fightshots.mjs <outDir> [quality]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] ?? 'shots';
const quality = process.argv[3] ?? 'high';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('shadow-warriors-settings-v1', JSON.stringify({ quality: q, ...(q === 'high' ? {} : {}) })), quality);
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game?.screenName === 'main', null, { timeout: 180000 });
const run = (fn, arg) => page.evaluate(fn, arg);
const settle = () => page.waitForTimeout(1500);
const scenarios = JSON.parse(process.argv[4] ?? 'null') ?? [
  { name: 'p-jab', p1: 'phantom', p2: 'ironfang', dist: 1.0, buttons: ['lp'], frames: 6 },
  { name: 'p-round', p1: 'phantom', p2: 'ironfang', dist: 1.1, buttons: ['hk'], frames: 15 },
  { name: 'f-haymaker', p1: 'ironfang', p2: 'phantom', dist: 1.1, buttons: ['hp'], frames: 18 },
  { name: 'f-special', p1: 'ironfang', p2: 'phantom', dist: 1.5, buttons: ['special'], frames: 27, meter: 100 },
  { name: 'p-special', p1: 'phantom', p2: 'ironfang', dist: 1.6, buttons: ['special'], frames: 25, meter: 100 },
  { name: 'block', p1: 'phantom', p2: 'ironfang', dist: 1.2, buttons: [], frames: 6, hold: { block: true } },
];
for (const sc of scenarios) {
  await run((sc) => {
    const g = window.__game;
    g.quickMatch(sc.p1, sc.p2, 'normal', true);
    g.manualSim = true;
    const m = g.match;
    m.phase = 'fight';
    const [a, b] = m.fighters;
    a.resetForRound({ x: -sc.dist / 2, z: 0 }, Math.PI / 2, true);
    b.resetForRound({ x: sc.dist / 2, z: 0 }, -Math.PI / 2, true);
    if (sc.meter) a.meter = sc.meter;
    g.debugStep(2);
  }, sc);
  await page.waitForTimeout(600);
  await run((sc) => window.__game.debugStep(sc.frames, sc.buttons, sc.hold ?? {}), sc);
  await settle();
  await page.screenshot({ path: `${out}/${sc.name}.png` });
  console.log('shot', sc.name);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();

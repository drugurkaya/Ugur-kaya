// Generates README screenshots (high preset) into docs/.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('shadow-warriors-settings-v1', JSON.stringify({ quality: 'high' })));
await page.goto(process.argv[2] ?? 'http://localhost:5173/');
await page.waitForFunction(() => window.__game?.screenName === 'main', null, { timeout: 180000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'docs/menu.jpg', type: 'jpeg', quality: 85 });
const scene = async (name, sc, wait = 2500) => {
  await page.evaluate((sc) => {
    const g = window.__game;
    g.quickMatch(sc.p1, sc.p2, 'normal', true);
    g.manualSim = true;
    const m = g.match;
    m.phase = 'fight';
    const [a, b] = m.fighters;
    a.resetForRound({ x: -sc.dist / 2, z: 0 }, Math.PI / 2, true);
    b.resetForRound({ x: sc.dist / 2, z: 0 }, -Math.PI / 2, true);
    if (sc.meter) a.meter = sc.meter;
    b.meter = 55;
    a.health = Math.round(a.def.maxHealth * 0.72);
    b.health = Math.round(b.def.maxHealth * 0.48);
    g.debugStep(2);
  }, sc);
  await page.waitForTimeout(3000);
  await page.evaluate((sc) => {
    const g = window.__game;
    g.debugStep(sc.frames, sc.buttons, {});
    // Software rendering draws very few frames; settle camera and flashes as a real-time run would.
    for (let i = 0; i < (sc.camFrames ?? 60); i++) g.cam.update(1 / 60, ...g.camSubjects(), 0, 0);
    for (const v of g.active) v.flash = 1e-6;
  }, sc);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `docs/${name}.jpg`, type: 'jpeg', quality: 85 });
};
await scene('combat', { p1: 'phantom', p2: 'ironfang', dist: 1.1, buttons: ['hk'], frames: 15 }, 1200);
await scene('special', { p1: 'phantom', p2: 'ironfang', dist: 1.8, buttons: ['special'], frames: 18, meter: 100, camFrames: 28 }, 600);
await browser.close();

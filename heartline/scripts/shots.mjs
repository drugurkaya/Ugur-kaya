// Documentation screenshots. Usage: node scripts/shots.mjs [baseUrl] [outDir] [quality]
// Uses the debug API to jump between scenes quickly; the e2e test covers real input.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'docs';
const quality = process.argv[4] ?? 'quality';
fs.mkdirSync(out, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function session(viewport, extra = {}) {
  const page = await browser.newPage({ viewport, ...extra });
  await page.addInitScript((q) => localStorage.setItem('heartline-settings-v1', JSON.stringify({ quality: q, lang: 'tr', textSpeed: 3, v: 2 })), quality);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__game && window.__game.inMenu, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  return page;
}
const g = (page, fn, arg) => page.evaluate(fn, arg);
async function lines(page, n) {
  for (let i = 0; i < n; i++) {
    await g(page, () => {
      const G = window.__game;
      if (G.engine?.active && !G.engine.choosing) {
        G.ui.advance();
        G.ui.advance();
      }
    });
    await page.waitForTimeout(400);
  }
}
async function settle(page, ms = 2500) {
  await page.waitForTimeout(ms);
}

// ---- Desktop ----
const page = await session({ width: 1280, height: 720 });
await page.screenshot({ path: `${out}/menu.jpg`, quality: 85 });
await g(page, () => window.__game.newGame(20261022));
await page.waitForFunction(() => window.__game.ui.phoneView === 'ring', null, { timeout: 180000 });
await settle(page, 1500);
await page.screenshot({ path: `${out}/ringing.jpg`, quality: 85 });
await g(page, () => window.__game.answerCall());
await settle(page, 2500);
await lines(page, 3);
await settle(page, 2500);
await page.screenshot({ path: `${out}/call.jpg`, quality: 85 });
await lines(page, 2);
await page.waitForFunction(() => window.__game.engine.choosing, null, { timeout: 180000 });
await settle(page, 1500);
await page.screenshot({ path: `${out}/decision.jpg`, quality: 85 });
// jump ahead to the hospital
await g(page, () => {
  const G = window.__game;
  G.engine.choose('both');
  G.engine.reset();
  G.state.apply({ flags: { outOfBed: true, dressed: true, outfit: 'shirt', inCall: false } });
  G.player.setOutfit('shirt');
  G.story.toScene('car');
});
await page.waitForFunction(() => window.__game.state.data.scene === 'car' && !window.__game.busy, null, { timeout: 180000 });
await settle(page, 3000);
await page.screenshot({ path: `${out}/commute.jpg`, quality: 85 });
await g(page, () => {
  const G = window.__game;
  G.engine.reset();
  G.story.toScene('hospital');
});
await page.waitForFunction(() => window.__game.state.data.scene === 'hospital' && !window.__game.busy, null, { timeout: 180000 });
await g(page, () => window.__game.debugTeleport('icu'));
await page.waitForFunction(() => window.__game.engine.active, null, { timeout: 180000 });
await lines(page, 3);
await settle(page, 3000);
await page.screenshot({ path: `${out}/icu.jpg`, quality: 85 });
await g(page, () => {
  const G = window.__game;
  G.engine.reset();
  G.story.toScene('or');
});
await page.waitForFunction(() => window.__game.state.data.scene === 'or' && window.__game.engine.active, null, { timeout: 180000 });
await settle(page, 3500);
await page.screenshot({ path: `${out}/or.jpg`, quality: 85 });
await g(page, () => {
  const G = window.__game;
  G.engine.reset();
  G.story.toScene('family');
});
await page.waitForFunction(() => window.__game.state.data.scene === 'family' && window.__game.engine.active, null, { timeout: 180000 });
await settle(page, 3500);
await page.screenshot({ path: `${out}/family.jpg`, quality: 85 });
await g(page, () => window.__game.ui.openJournal('patient'));
await settle(page, 800);
await page.screenshot({ path: `${out}/journal.jpg`, quality: 85 });
await page.close();

// ---- Phone-sized, touch ----
const m = await session({ width: 844, height: 390 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await m.screenshot({ path: `${out}/mobile-menu.jpg`, quality: 80 });
await g(m, () => window.__game.newGame(5));
await m.waitForFunction(() => window.__game.ui.phoneView === 'ring', null, { timeout: 180000 });
await settle(m, 1200);
await m.screenshot({ path: `${out}/mobile-ringing.jpg`, quality: 80 });
await g(m, () => {
  const G = window.__game;
  G.answerCall();
});
await lines(m, 5);
await m.waitForFunction(() => window.__game.engine.choosing, null, { timeout: 180000 });
await settle(m, 1200);
await m.screenshot({ path: `${out}/mobile-decision.jpg`, quality: 80 });
await g(m, () => {
  const G = window.__game;
  G.engine.choose('products');
  G.engine.reset();
  G.state.apply({ flags: { outOfBed: true, inCall: false } });
  G.player.pose = 'idle';
  G.player.root.position.set(-1.6, 0, -0.9);
  G.player.root.rotation.set(0, Math.PI / 2, 0);
  G.player.setGear({ phone: false });
});
await settle(m, 2000);
await m.screenshot({ path: `${out}/mobile-explore.jpg`, quality: 80 });
await browser.close();
console.log('screenshots written to', out);

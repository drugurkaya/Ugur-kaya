// End-to-end playthrough in headless Chromium (software WebGL).
// Usage: node scripts/e2e.mjs [baseUrl] [outDir] [quality]
// Drives the real UI: menu buttons, phone buttons, decision cards, keyboard movement, pause menu
// save, page reload + Continue. Prints PASS/FAIL per check and exits non-zero on failure.
import { finish, openGame } from './lib.mjs';

const base = (process.argv[2] ?? 'http://localhost:5173/') + '?truth=surgical';
const out = process.argv[3] ?? 'test-results';
const quality = process.argv[4] ?? 'performance';
const T = await openGame(base, out, quality);
const { page, check, shot, g, st, waitFor, untilChoice, finishDialogue, choose, chooseAny } = T;

const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.__game && window.__game.inMenu, null, { timeout: 120000 });
check('game loads to main menu', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForTimeout(1500);
await shot('menu');

// --- New game: the 05:12 bedroom ---
await page.click('[data-testid="new-game"]');
await waitFor((s) => s.phone === 'ring', 30000, 'phone ring');
check('opening: phone rings in the bedroom', true);
await page.waitForTimeout(800);
await shot('ringing');
await page.click('[data-testid="answer"]');
let s = await waitFor((x) => x.active, 10000, 'call dialogue');
check('answering starts the ICU call', s.dialogue === 'call');
await page.waitForTimeout(1300);
await shot('call-face');
s = await untilChoice();
check('first decision card appears', s.choosing && s.node === 'decide', JSON.stringify({ ch: s.choosing, n: s.node, d: s.dialogue }));
await shot('decision-card');
await choose('ask');
s = await untilChoice();
await choose('both');
s = await untilChoice();
check('read-back step', s.node === 'readback');
await choose('confirm');
s = await finishDialogue();
// Ayla wakes up
s = await waitFor((x) => x.active && x.dialogue === 'aylaWake', 8000, 'ayla wake');
s = await untilChoice();
await shot('ayla');
await choose('honest');
s = await untilChoice();
await choose('promise');
s = await finishDialogue();
const flags1 = (await st()).flags;
check('choices changed the game state', flags1.orMobilised === true && flags1.productsOrdered === true && flags1.promisedConcert === true);

// --- Get up and move with the keyboard ---
await page.waitForTimeout(600);
await page.keyboard.press('KeyE');
s = await waitFor((x) => x.active && x.dialogue === 'getUp', 5000, 'getUp');
await finishDialogue();
await page.waitForFunction(() => !window.__game.tween && window.__game.input.enabled, null, { timeout: 30000 });
const before = (await st()).pos;
// Software WebGL runs at a few frames per second; hold the key long enough for several frames.
await page.keyboard.down('KeyW');
await page.waitForTimeout(4000);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyA');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyA');
const after = (await st()).pos;
const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
check('protagonist moves with WASD', moved > 0.3, `moved ${moved.toFixed(2)} m`);
await shot('walking');

// wash face, get dressed, coffee
async function useAt(id, dlg, pick) {
  await page.waitForFunction(() => !window.__game.engine.active, null, { timeout: 15000 });
  await g((i) => window.__game.debugTeleport(i), id);
  await page.waitForFunction((i) => window.__game.nearestInteractable()?.id === i, id, { timeout: 15000 });
  await page.keyboard.press('KeyE');
  await waitFor((x) => x.active && x.dialogue === dlg, 15000, dlg);
  const r = await untilChoice();
  if (r.choosing && pick) await chooseAny(pick);
  await finishDialogue();
}
await useAt('sink', 'washFace', ['go']);
await shot('bathroom');
await useAt('wardrobe', 'dress', ['shirt']);
check('getting dressed sets the outfit flag', (await st()).flags.dressed === true);
await useAt('coffee', 'coffee', ['thermos']);
await shot('kitchen');

// --- Save through the pause menu, reload, continue ---
const clockBeforeSave = (await st()).clock;
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('.modal-box.pause .btn:nth-child(2)');
await page.waitForSelector('[data-slot="slot1"]');
await page.click('[data-slot="slot1"]');
await page.waitForTimeout(300);
const saved = await g(() => !!localStorage.getItem('heartline-save-v1-slot1'));
check('manual save to slot 1', saved);
await page.keyboard.press('Escape');
await page.reload();
await page.waitForFunction(() => window.__game && window.__game.inMenu, null, { timeout: 120000 });
await page.waitForSelector('[data-testid="continue"]');
await page.click('[data-testid="continue"]');
s = await waitFor((x) => !x.menu && x.scene === 'bedroom', 20000, 'continue');
await page.waitForTimeout(1500);
s = await st();
check('continue restores progress after reload', Math.abs(s.clock - clockBeforeSave) < 1 && s.flags.dressed === true && s.flags.orMobilised === true, `clock ${s.clock.toFixed(1)} vs ${clockBeforeSave.toFixed(1)}`);

// --- Leave home ---
await g(() => window.__game.debugTeleport('door'));
await page.waitForTimeout(300);
await page.keyboard.press('KeyE');
await waitFor((x) => x.active && x.dialogue === 'leaveHome', 5000, 'leave');
await untilChoice();
await choose('go');
s = await waitFor((x) => x.scene === 'car' && x.active, 20000, 'car');
check('leaving home starts the commute', s.dialogue === 'commute');
await page.waitForTimeout(1500);
await shot('car');
await untilChoice();
await choose('normal');
await untilChoice();
await chooseAny(['icu']);
await untilChoice();
await chooseAny(['ok']);
await untilChoice();
await chooseAny(['drive']);
await finishDialogue();
s = await waitFor((x) => x.scene === 'hospital' && !x.busy, 30000, 'hospital');
check('reaching the hospital (chapter 3)', s.chapter === 'ch3');
await page.waitForTimeout(1200);
await shot('hospital-entrance');
// walk in a little with the keyboard, then to the ICU
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
await g(() => window.__game.debugTeleport('icu'));
s = await waitFor((x) => x.active && x.dialogue === 'icu', 8000, 'icu');
await page.waitForTimeout(1200);
await shot('icu');
s = await untilChoice();
check('first major decision at the bedside', s.choosing);
await chooseAny(['echo']);
await untilChoice();
await shot('icu-echo');
await chooseAny(['decide']);
await untilChoice();
const truth = await g(() => window.__game.state.patient().truth);
check('hidden cause fixed by the test URL', truth === 'surgical', truth);
const picked = await chooseAny(['or', 'bedside']);
s = await untilChoice();
if (s.dialogue === 'icu' && s.choosing) await chooseAny(['call', 'or', 'plan']);
s = await finishDialogue();
s = await waitFor((x) => (x.scene === 'or' || x.scene === 'family') && x.active, 30000, 'or/family');
check('first major event resolves into the next chapter', true, `truth=${truth}, choice=${picked}, scene=${s.scene}`);
check('surgical bleeding leads to the operating room', s.scene === 'or');
if (s.scene === 'or') {
  await page.waitForTimeout(1200);
  await shot('or');
  for (let i = 0; i < 20; i++) {
    s = await untilChoice();
    if (!s.active || s.scene !== 'or') break;
    await chooseAny(['full', 'prime', 'yes', 'repair', 'evacuate', 'coag', 'check', 'close', 'defib', 'self', 'now', 'sbar']);
  }
  check('operating room sequence completes', true);
}
s = await waitFor((x) => x.scene === 'family' && x.active, 30000, 'family');
await page.waitForTimeout(1200);
await shot('family');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active || s.scene !== 'family') break;
  await chooseAny(['honest', 'apology', 'transparent']);
}
s = await waitFor((x) => x.scene === 'evening' && x.active, 30000, 'evening');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active || s.scene !== 'evening') break;
  await chooseAny(['write', 'go', 'calm']);
}
s = await waitFor((x) => x.scene === 'office' && x.active, 40000, 'epilogue');
await page.waitForTimeout(800);
await shot('epilogue');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active) break;
  await chooseAny(['cooperate', 'present', 'balance', 'stay']);
}
await page.waitForSelector('.modal-box.ending', { timeout: 20000 });
const endingTitle = await page.textContent('.modal-box.ending h2');
check('an ending is reached', !!endingTitle, endingTitle ?? '');
const hist = await g(() => window.__game.state.data.history.length);
check('decision history recorded', hist > 5, `${hist} entries`);
await shot('ending');

// --- English UI sanity ---
await page.click('.modal-box.ending .btn:nth-child(2)');
await page.waitForTimeout(500);
await page.click('[data-testid="lang-en"]');
const newGameLabel = await page.textContent('[data-testid="new-game"]');
check('language switch to English', newGameLabel?.trim() === 'New game');

await finish(T);

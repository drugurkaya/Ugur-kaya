// Second end-to-end playthrough on a different branch: decline the call, call back from the
// phone's contact list, rush the read-back, try to leave in pyjamas, drive fast, and mislead
// the family. Usage: node scripts/e2e-alt.mjs [baseUrl] [outDir]
import { finish, openGame } from './lib.mjs';

const base = (process.argv[2] ?? 'http://localhost:5173/') + '?truth=tamponade';
const out = process.argv[3] ?? 'test-results-alt';
const T = await openGame(base, out, 'performance');
const { page, check, shot, g, st, waitFor, untilChoice, finishDialogue, choose, chooseAny } = T;

await page.goto(base);
await page.waitForFunction(() => window.__game && window.__game.inMenu, null, { timeout: 120000 });
// English this time
await page.click('[data-testid="lang-en"]');
await page.click('[data-testid="new-game"]');
await waitFor((s) => s.phone === 'ring', 30000, 'ring');
await page.click('[data-testid="decline"]');
let s = await waitFor((x) => x.active && x.dialogue === 'declined', 10000, 'declined');
await finishDialogue();
check('declining shows the nurse’s message', (await g(() => window.__game.state.data.messages.length)) > 0);

// Call back through the phone UI: phone button → contacts → ICU
await page.click('[data-testid="phone-btn"]');
await page.waitForSelector('.phone .tab');
await page.click('.phone .tab:nth-child(2)');
await page.click('[data-contact="icu"]');
s = await waitFor((x) => x.active && x.dialogue === 'call', 10000, 'call back');
check('calling the ICU back from the contact list', true);
await untilChoice();
await choose('resident');
await untilChoice();
await choose('rush');
await finishDialogue();
s = await waitFor((x) => x.active && x.dialogue === 'aylaWake', 10000, 'ayla');
await untilChoice();
await choose('silent');
await finishDialogue();
check('rushing the read-back is recorded as a deviation', (await g(() => window.__game.state.data.deviations)).includes('noReadBack'));

// Ece calls back later; get up and try to leave in pyjamas
await page.keyboard.press('KeyE');
await waitFor((x) => x.active && x.dialogue === 'getUp', 10000, 'getUp');
await finishDialogue();
await page.waitForFunction(() => !window.__game.tween && window.__game.input.enabled, null, { timeout: 30000 });
await g(() => window.__game.debugTeleport('door'));
await page.waitForFunction(() => window.__game.nearestInteractable()?.id === 'door', null, { timeout: 15000 });
await page.keyboard.press('KeyE');
s = await waitFor((x) => x.active && x.dialogue === 'leaveHome', 10000, 'leave');
check('cannot leave in pyjamas', s.node === 'pajamas');
await finishDialogue();
await g(() => window.__game.debugTeleport('wardrobe'));
await page.waitForFunction(() => window.__game.nearestInteractable()?.id === 'wardrobe', null, { timeout: 15000 });
await page.keyboard.press('KeyE');
await waitFor((x) => x.active && x.dialogue === 'dress', 10000, 'dress');
await untilChoice();
await choose('quick');
await finishDialogue();
// Ece's message may have arrived by now; if so, call her from the phone
const eceWants = await g(() => !!window.__game.state.flag('eceWantsCall'));
if (eceWants) {
  await g(() => window.__game.callContact('ece'));
  await waitFor((x) => x.active && x.dialogue === 'phoneEce', 10000, 'ece');
  await untilChoice();
  await chooseAny(['teach', 'orders']);
  await untilChoice();
  await chooseAny(['orders']);
  await finishDialogue();
}
check('resident path reaches a clinical plan', eceWants ? !!(await g(() => window.__game.state.flag('orMobilised'))) : true, eceWants ? 'called Ece' : 'Ece had not called yet');
await g(() => window.__game.debugTeleport('door'));
await page.waitForFunction(() => window.__game.nearestInteractable()?.id === 'door', null, { timeout: 15000 });
await page.keyboard.press('KeyE');
await waitFor((x) => x.active && x.dialogue === 'leaveHome', 10000, 'leave2');
await untilChoice();
await choose('go');
s = await waitFor((x) => x.scene === 'car' && x.active, 30000, 'car');
await untilChoice();
await choose('fast');
s = await untilChoice();
check('fast driving leads to a timed junction card', s.node === 'fast');
await shot('junction');
await choose('brake');
await untilChoice();
await chooseAny(['drive']);
await finishDialogue();
s = await waitFor((x) => x.scene === 'hospital' && !x.busy, 30000, 'hospital');
await g(() => window.__game.debugTeleport('icu'));
s = await waitFor((x) => x.active && x.dialogue === 'icu', 15000, 'icu');
for (let i = 0; i < 12; i++) {
  s = await untilChoice();
  if (!s.active || s.dialogue !== 'icu') break;
  await chooseAny(['decide', 'or', 'bedside', 'open', 'skip']);
}
for (let i = 0; i < 25; i++) {
  s = await untilChoice();
  if (s.scene === 'family' || s.scene === 'evening' || s.scene === 'office') break;
  if (!s.active) {
    await page.waitForTimeout(500);
    continue;
  }
  await chooseAny(['skip', 'standby', 'no', 'repair', 'evacuate', 'coag', 'close', 'adrenaline', 'leave', 'later', 'none']);
}
s = await waitFor((x) => x.scene === 'family' && x.active, 40000, 'family');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active || s.scene !== 'family') break;
  await chooseAny(['minimise', 'go', 'defensive']);
}
s = await waitFor((x) => x.scene === 'evening' && x.active, 40000, 'evening');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active || s.scene !== 'evening') break;
  await chooseAny(['tomorrow', 'stay', 'curt']);
}
s = await waitFor((x) => x.scene === 'office' && x.active, 40000, 'office');
for (let i = 0; i < 10; i++) {
  s = await untilChoice();
  if (!s.active) break;
  await chooseAny(['blameTeam', 'decline', 'stay']);
}
await page.waitForSelector('.modal-box.ending', { timeout: 20000 });
const title = await page.textContent('.modal-box.ending h2');
const devs = await g(() => window.__game.state.data.deviations);
check('alternative branch reaches an ending', !!title, `${title} · deviations: ${devs.join(', ')}`);
check('ending screen is in English', /Ending/.test(title ?? ''));
await shot('ending-alt');
await finish(T);

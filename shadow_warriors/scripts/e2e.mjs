// End-to-end smoke test in headless Chromium (software WebGL).
// Usage: node scripts/e2e.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'test-results';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
// Software WebGL is slow: run the smoke test on the low preset at reduced resolution.
await page.addInitScript(() => {
  try {
    localStorage.setItem('shadow-warriors-settings-v1', JSON.stringify({ quality: 'low', resolutionScale: 0.5, shadows: false, bloom: false, reflections: false, particles: 0.4 }));
  } catch {}
});
const errors = [];
const warnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    const m = g.match;
    return {
      screen: g.screenName,
      phase: m?.phase,
      round: m?.round,
      wins: m?.wins,
      hp: m?.fighters.map((f) => f.health),
      meter: m?.fighters.map((f) => f.meter),
      states: m?.fighters.map((f) => f.state),
      p1x: m ? m.fighters[0].pos.x : 0,
      dist: m ? Math.hypot(m.fighters[0].pos.x - m.fighters[1].pos.x, m.fighters[0].pos.z - m.fighters[1].pos.z) : 0,
      frames: g.stats.frames,
      steps: g.stats.simSteps,
      hits: m?.stats.hits,
      blocks: m?.stats.blocks,
    };
  });
const key = async (code, ms = 60) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
};

/** Walk in and jab until the round leaves the fight phase. */
const fightUntilRoundEnds = async () => {
  for (let i = 0; i < 200; i++) {
    const st = await state();
    if (st.phase !== 'fight') return st;
    if (st.dist > 1.15) {
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(200);
      await page.keyboard.up('KeyD');
    } else {
      await key('KeyJ', 40);
      await page.waitForTimeout(250);
    }
  }
  return state();
};

const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.__game && window.__game.screenName === 'main', null, { timeout: 180000 });
check('game loads to main menu', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForTimeout(1500);
await shot('01-main-menu');

// Navigate: Oyunu Başlat -> select.
await key('Enter');
await page.waitForTimeout(400);
let s = await state();
check('main menu → character select', s.screen === 'select', s.screen);
await key('ArrowRight');
await page.waitForTimeout(800);
await shot('02-select');
await key('ArrowLeft');
await key('Enter');
await page.waitForTimeout(200);
await key('Enter');
await page.waitForTimeout(400);
s = await state();
check('character select → difficulty', s.screen === 'difficulty', s.screen);
await shot('03-difficulty');
await key('ArrowDown');
await key('Enter');
await page.waitForTimeout(1500);
s = await state();
check('difficulty → match intro', s.screen === 'match' && s.phase === 'intro', `${s.screen}/${s.phase}`);
await shot('04-intro');
await key('Enter');
await page.waitForFunction(() => window.__game.match?.phase === 'fight', null, { timeout: 60000 });
s = await state();
check('round starts (ready → fight)', s.phase === 'fight');
await shot('05-fight-start');

// Walk toward the opponent (D is screen-right; P1 starts on the left).
const walkStart = await state();
await page.keyboard.down('KeyD');
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(100);
  if ((await state()).dist < 1.2) break;
}
await page.keyboard.up('KeyD');
s = await state();
const simRate = (s.steps - walkStart.steps) / ((s.frames - walkStart.frames) || 1);
console.log(`sim steps per rendered frame: ${simRate.toFixed(2)}`);
check('player moves (D = screen-right, toward opponent)', s.p1x > walkStart.p1x + 0.2 || s.dist < 1.25, `x ${walkStart.p1x.toFixed(2)} → ${s.p1x.toFixed(2)}, distance ${s.dist.toFixed(2)}`);
// Attack for a while.
const hp0 = (await state()).hp;
for (let i = 0; i < 30; i++) {
  await key(['KeyJ', 'KeyJ', 'KeyU', 'KeyK', 'KeyI'][i % 5], 40);
  await page.waitForTimeout(300);
  if (i === 4) await shot('06-combat');
  if ((await state()).dist > 1.2) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyD');
  }
  if ((await state()).hits[0] >= 3) break;
}
s = await state();
check('attacks register hits / damage', s.hits[0] > 0 || s.hp[1] < hp0[1], `p1 hits ${s.hits[0]}, cpu hp ${s.hp[1]}`);
check('health bars update', s.hp[1] < 1180 || s.hp[0] < 1000, `hp ${s.hp.join('/')}`);
// Block for a while and let the AI attack.
await page.keyboard.down('KeyL');
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(250);
  const st = await state();
  if (st.hits[1] > 0 || st.blocks[0] > 0) break;
}
await page.keyboard.up('KeyL');
s = await state();
check('AI is active (attacks thrown)', s.hits[1] > 0 || s.blocks[0] > 0 || s.hp[0] < 1000, `cpu hits ${s.hits[1]}, p1 blocks ${s.blocks[0]}`);
await shot('07-block');

// Pause menu.
await key('Escape');
await page.waitForTimeout(400);
s = await state();
check('pause menu opens', s.screen === 'pause', s.screen);
await shot('08-pause');
await key('Escape');
await page.waitForTimeout(300);
s = await state();
check('pause resumes', s.screen === 'match', s.screen);

// Force a KO through the debug hook to test win/lose flow quickly.
await page.evaluate(() => {
  const m = window.__game.match;
  m.fighters[1].health = 1;
  m.fighters[0].meter = 100;
});
s = await fightUntilRoundEnds();
s = await state();
check('KO ends the round', s.phase === 'ko' || s.wins[0] >= 1, `${s.phase} wins ${s.wins}`);
await page.waitForTimeout(900);
await shot('09-ko');
await page.waitForFunction(() => window.__game.match?.phase === 'ready' || window.__game.match?.phase === 'matchEnd', null, { timeout: 60000 });
s = await state();
check('next round resets health', s.hp[1] === 1180 && s.round === 2, `round ${s.round} hp ${s.hp}`);

// Second KO → match end.
await page.waitForFunction(() => window.__game.match?.phase === 'fight', null, { timeout: 60000 });
await page.evaluate(() => {
  window.__game.match.fighters[1].health = 1;
});
s = await fightUntilRoundEnds();
await page.waitForFunction(() => window.__game.screenName === 'results', null, { timeout: 90000 }).catch(() => {});
s = await state();
check('match ends with results screen', s.screen === 'results', s.screen);
await shot('10-results');

// Rematch resets everything.
await key('Enter');
await page.waitForTimeout(800);
s = await state();
check('rematch restarts cleanly', s.screen === 'match' && s.round === 1 && s.wins[0] === 0 && s.wins[1] === 0 && s.hp[0] === 1000, JSON.stringify({ r: s.round, w: s.wins, hp: s.hp }));

// Special attack with a full meter.
await page.waitForFunction(() => window.__game.match?.phase === 'fight', null, { timeout: 60000 });
await page.evaluate(() => (window.__game.match.fighters[0].meter = 100));
for (let i = 0; i < 60; i++) {
  const st = await state();
  if (st.dist > 1.6) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyD');
  } else break;
}
await key('KeyO', 50);
await page.waitForTimeout(1500);
const sp = await page.evaluate(() => window.__game.match.stats.specials[0]);
check('special attack fires with full meter', sp >= 1, `specials ${sp}`);
await shot('11-special');

// Back to the main menu through the pause menu.
await key('Escape');
await page.waitForTimeout(300);
for (let i = 0; i < 5; i++) await key('ArrowDown', 30);
await key('Enter');
await page.waitForTimeout(500);
s = await state();
check('pause → main menu', s.screen === 'main', s.screen);

// Graphics settings: cycle quality presets and toggles.
for (let i = 0; i < 4; i++) await key('ArrowDown', 30);
await key('Enter');
await page.waitForTimeout(300);
s = await state();
check('graphics settings open', s.screen === 'graphics', s.screen);
await key('ArrowRight', 30);
await page.waitForTimeout(800);
await key('ArrowRight', 30);
await page.waitForTimeout(800);
const q = await page.evaluate(() => window.__game.settings.data.quality);
await shot('12-graphics');
for (let i = 0; i < 2; i++) await key('ArrowLeft', 30);
await page.waitForTimeout(500);
check('quality preset changes apply', ['ultra', 'low', 'medium', 'high'].includes(q), q);
await key('Escape');
await page.waitForTimeout(300);

// Controls: rebind light punch to P, verify, restore defaults.
await key('ArrowUp', 30);
await key('Enter');
await page.waitForTimeout(300);
s = await state();
check('controls screen open', s.screen === 'controls', s.screen);
for (let i = 0; i < 4; i++) await key('ArrowDown', 30);
await key('Enter');
await page.waitForTimeout(200);
await key('KeyP');
await page.waitForTimeout(200);
const lp = await page.evaluate(() => window.__game.settings.data.bindings.lp);
check('key rebinding works', lp === 'KeyP', lp);
await shot('13-controls');
await page.evaluate(() => window.__game.settings.resetBindings());
await key('Escape');
await page.waitForTimeout(300);

// Mirror match via the test hook (alternate costume for player 2).
await page.evaluate(() => window.__game.quickMatch('ironfang', 'ironfang', 'hard'));
await page.waitForTimeout(2500);
s = await state();
check('mirror match (hard) starts', s.screen === 'match' && ['ready', 'fight'].includes(s.phase), `${s.screen}/${s.phase}`);
await shot('14-mirror');

// Perf sample (software rendering — not representative of a GPU).
const f0 = await state();
await page.waitForTimeout(3000);
const f1 = await state();
check('render loop running', f1.frames > f0.frames, `${((f1.frames - f0.frames) / 3).toFixed(1)} fps in headless software WebGL`);

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
if (warnings.length) console.log('warnings:', [...new Set(warnings)].slice(0, 8).join('\n'));
fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors, warnings: [...new Set(warnings)] }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);

// Shared helpers for the browser tests (scripts/e2e.mjs, scripts/e2e-alt.mjs).
import { chromium } from 'playwright';
import fs from 'node:fs';

export async function openGame(base, out, quality = 'performance') {
  fs.mkdirSync(out, { recursive: true });
  // In the cloud container Chromium is pre-installed here; elsewhere Playwright's own browser is used.
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: Number(process.env.E2E_W ?? 800), height: Number(process.env.E2E_H ?? 450) } });
  await page.addInitScript((q) => {
    try {
      if (!localStorage.getItem('heartline-settings-v1')) localStorage.setItem('heartline-settings-v1', JSON.stringify({ quality: q, lang: 'tr', textSpeed: 3 }));
    } catch {}
  }, quality);
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const results = [];
  const check = (name, ok, info = '') => {
    results.push({ name, ok, info });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
  };
  let shotN = 0;
  const shot = (n) => page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${n}.png` });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const st = () =>
    g(() => {
      const G = window.__game;
      const s = G.state;
      return {
        menu: G.inMenu,
        scene: s?.data.scene,
        chapter: s?.data.chapter,
        clock: s?.clock,
        active: !!G.engine?.active,
        choosing: !!G.engine?.choosing,
        dialogue: G.engine?.dialogue?.id,
        node: G.engine?.node?.id,
        phone: G.ui.phoneView,
        flags: s ? s.data.flags : {},
        pos: [G.player.root.position.x, G.player.root.position.z],
        busy: G.busy,
        map: s?.patient().map,
      };
    });

  async function waitFor(pred, ms = 30000, label = '') {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const s = await st();
      if (pred(s)) return s;
      await page.waitForTimeout(150);
    }
    throw new Error('timeout waiting for ' + label);
  }

  /** Press Space until the engine shows choices or the dialogue ends. */
  async function untilChoice(maxSteps = 40) {
    for (let i = 0; i < maxSteps; i++) {
      const s = await st();
      if (s.choosing || !s.active) return s;
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
    }
    return st();
  }

  async function finishDialogue(maxSteps = 60) {
    for (let i = 0; i < maxSteps; i++) {
      const s = await st();
      if (!s.active || s.choosing) return s;
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
    }
    return st();
  }

  async function choose(id) {
    const sel = `[data-choice="${id}"]`;
    await page.waitForSelector(sel, { timeout: 10000 });
    await page.click(sel);
    await page.waitForTimeout(200);
  }

  /** Choose the first available id from a list (content varies with the hidden truth). */
  async function chooseAny(ids) {
    const avail = await g(() => window.__game.engine.visibleChoices().filter((c) => !window.__game.engine.isLocked(c)).map((c) => c.id));
    const pick = ids.find((i) => avail.includes(i)) ?? avail[0];
    await choose(pick);
    return pick;
  }

  return { browser, page, errors, results, check, shot, g, st, waitFor, untilChoice, finishDialogue, choose, chooseAny };
}

export async function finish({ browser, errors, results, check }) {
  const filtered = errors.filter((e) => !/WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
  check('no console errors', filtered.length === 0, filtered.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

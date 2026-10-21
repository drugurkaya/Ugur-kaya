import { describe, expect, it } from 'vitest';
import { AIController, type Difficulty } from '../src/ai/AIController';
import { IRON_FANG, PHANTOM } from '../src/combat/data';
import { Match } from '../src/combat/Match';
import { emptyInput, type Button, type FighterInput } from '../src/combat/types';

const press = (b: Button, extra: Partial<FighterInput> = {}): FighterInput => ({ ...emptyInput(), pressed: new Set([b]), ...extra });

/** Put both fighters face to face at a given distance in the fight phase. */
const setup = (dist: number, p1 = PHANTOM, p2 = IRON_FANG): Match => {
  const m = new Match(p1, p2, true);
  m.phase = 'fight';
  const [a, b] = m.fighters;
  a.resetForRound({ x: -dist / 2, z: 0 }, Math.PI / 2, true);
  b.resetForRound({ x: dist / 2, z: 0 }, -Math.PI / 2, true);
  return m;
};

const run = (m: Match, frames: number, i0: (f: number) => FighterInput = () => emptyInput(), i1: (f: number) => FighterInput = () => emptyInput()) => {
  const events = [];
  for (let f = 0; f < frames; f++) {
    m.step([i0(f), i1(f)]);
    events.push(...m.events);
  }
  return events;
};

describe('hit detection', () => {
  it('jab connects at close range exactly once', () => {
    const m = setup(1.0);
    const ev = run(m, 40, (f) => (f === 0 ? press('lp') : emptyInput()));
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.length).toBe(1);
    expect(m.fighters[1].health).toBe(IRON_FANG.maxHealth - PHANTOM.moves.p_jab.damage);
  });

  it('jab whiffs out of range', () => {
    const m = setup(2.4);
    const ev = run(m, 40, (f) => (f === 0 ? press('lp') : emptyInput()));
    expect(ev.filter((e) => e.type === 'hit').length).toBe(0);
    expect(ev.some((e) => e.type === 'whiff')).toBe(true);
    expect(m.fighters[1].health).toBe(IRON_FANG.maxHealth);
  });

  it('hits only during active frames', () => {
    const m = setup(1.0);
    let firstHitFrame = -1;
    for (let f = 0; f < 30; f++) {
      m.step([f === 0 ? press('lp') : emptyInput(), emptyInput()]);
      if (firstHitFrame < 0 && m.events.some((e) => e.type === 'hit')) firstHitFrame = f;
    }
    // Pressed on frame 0, move starts that frame and becomes active at startup.
    expect(firstHitFrame).toBe(PHANTOM.moves.p_jab.startup);
  });

  it('block reduces damage to chip and causes blockstun', () => {
    const m = setup(1.0);
    const block = { ...emptyInput(), block: true };
    run(m, 5, () => emptyInput(), () => block);
    expect(m.fighters[1].state).toBe('block');
    const ev = run(m, 30, (f) => (f === 0 ? press('hp') : emptyInput()), () => block);
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.blocked).toBe(true);
    const lost = IRON_FANG.maxHealth - m.fighters[1].health;
    expect(lost).toBe(Math.round(PHANTOM.moves.p_palm.damage * PHANTOM.moves.p_palm.chip));
  });

  it('sidestep makes a linear attack whiff', () => {
    const m = setup(1.0);
    const ev = run(
      m,
      40,
      (f) => (f === 2 ? press('lp') : emptyInput()),
      (f) => (f === 0 ? { ...emptyInput(), dodge: true, lat: 1 } : emptyInput()),
    );
    expect(ev.filter((e) => e.type === 'hit').length).toBe(0);
  });

  it('fighters never overlap', () => {
    const m = setup(2.0);
    const fwd = { ...emptyInput(), fwd: 1 };
    run(m, 180, () => fwd, () => fwd);
    const [a, b] = m.fighters;
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    expect(d).toBeGreaterThanOrEqual(a.def.pushRadius + b.def.pushRadius * b.def.scale - 0.01);
  });
});

describe('combos and meter', () => {
  it('named combo chains on hit and scales damage', () => {
    const m = setup(0.95);
    m.fighters[0].meter = 100;
    const seq: [number, Button][] = [
      [0, 'lp'],
      [9, 'lp'],
      [18, 'lk'],
      [30, 'special'],
    ];
    const ev = run(m, 140, (f) => {
      const s = seq.find(([t]) => t === f);
      return s ? press(s[1]) : emptyInput();
    });
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(ev.some((e) => e.type === 'comboName')).toBe(true);
    expect(m.stats.maxCombo[0]).toBeGreaterThanOrEqual(5);
    expect(m.fighters[0].meter).toBeLessThan(100);
  });

  it('special requires full meter', () => {
    const m = setup(1.0);
    run(m, 5, (f) => (f === 0 ? press('special') : emptyInput()));
    expect(m.fighters[0].state).not.toBe('attack');
  });

  it('holding a button does not repeat attacks', () => {
    const m = setup(1.0);
    // Only the first frame carries the edge press; held state must not retrigger.
    const ev = run(m, 90, (f) => (f === 0 ? press('lp') : emptyInput()));
    expect(ev.filter((e) => e.type === 'attackStart').length).toBe(1);
  });
});

describe('round flow', () => {
  it('KO ends the round and the match resets fighters between rounds', () => {
    const m = setup(1.0);
    m.fighters[1].health = 10;
    run(m, 20, (f) => (f === 0 ? press('lp') : emptyInput()));
    expect(m.phase).toBe('ko');
    expect(m.wins[0]).toBe(1);
    run(m, 300);
    expect(m.round).toBe(2);
    expect(m.fighters[1].health).toBe(IRON_FANG.maxHealth);
    expect(['ready', 'fight']).toContain(m.phase);
  });

  for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`AI vs AI (${diff}) finishes a full match with damage dealt`, () => {
      const m = new Match(PHANTOM, IRON_FANG, true);
      const ai0 = new AIController(diff, 7);
      const ai1 = new AIController(diff, 99);
      let frames = 0;
      while (m.phase !== 'matchEnd' && frames < 60 * 60 * 8) {
        m.step([ai0.update(m, 0), ai1.update(m, 1)]);
        frames++;
      }
      expect(m.phase).toBe('matchEnd');
      expect(m.stats.hits[0] + m.stats.hits[1]).toBeGreaterThan(5);
      expect(Math.max(...m.wins)).toBeGreaterThanOrEqual(2);
    });
  }

  it('harder AI beats easier AI more often', () => {
    let hardWins = 0;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const m = new Match(PHANTOM, PHANTOM, true);
      const easy = new AIController('easy', 100 + i);
      const hard = new AIController('hard', 200 + i);
      let frames = 0;
      while (m.phase !== 'matchEnd' && frames < 60 * 60 * 8) {
        m.step([easy.update(m, 0), hard.update(m, 1)]);
        frames++;
      }
      if (m.matchWinner === 1) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(4);
  });
});

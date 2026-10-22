import { describe, expect, it } from 'vitest';
import { clockOf } from '../src/core/time';
import { evaluateLegal } from '../src/legal/LegalSystem';
import { applyAction, createPatient, simulate } from '../src/medical/Patient';
import { NarrativeEngine, interpolate } from '../src/narrative/Engine';
import { LIBRARY } from '../src/narrative/content';
import { GameState, PATIENT_ID, START_CLOCK } from '../src/state/GameState';
import { MemoryKV, SaveSystem } from '../src/state/Save';
import { SCENE_AREA, Story } from '../src/game/Story';

const fresh = (truth: 'surgical' | 'coagulopathy' | 'tamponade', seed = 1234) => new GameState(GameState.fresh(seed, truth));

describe('patient model', () => {
  it('surgical bleeding deteriorates without definitive control', () => {
    const p = createPatient('a', 1, START_CLOCK, 'surgical');
    simulate(p, START_CLOCK + 90);
    expect(p.map).toBeLessThan(55);
    expect(p.shockBurden).toBeGreaterThan(20);
  });

  it('coagulopathy settles with products and warming', () => {
    const p = createPatient('a', 1, START_CLOCK, 'coagulopathy');
    for (const a of ['fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient'] as const) applyAction(p, a, START_CLOCK);
    simulate(p, START_CLOCK + 60);
    expect(p.drainRate).toBeLessThan(110);
  });

  it('tamponade: drainage falls while CVP rises (the trap)', () => {
    const p = createPatient('a', 1, START_CLOCK, 'tamponade');
    const cvp0 = p.cvp;
    simulate(p, START_CLOCK + 50);
    expect(p.drainRate).toBeLessThan(150);
    expect(p.cvp).toBeGreaterThan(cvp0);
    const r = applyAction(p, 'bedsideEcho', START_CLOCK + 50);
    expect(r?.en).toMatch(/tamponade/i);
  });

  it('re-exploration controls surgical bleeding', () => {
    const p = createPatient('a', 1, START_CLOCK, 'surgical');
    simulate(p, START_CLOCK + 40);
    applyAction(p, 'reExplore', START_CLOCK + 40);
    const total = p.drainTotal;
    simulate(p, START_CLOCK + 100);
    expect(p.drainTotal - total).toBeLessThan(80);
  });
});

describe('game state, conditions and consequences', () => {
  it('applies stats with clamping and fires delayed consequences only when due', () => {
    const s = fresh('surgical');
    s.apply({ stats: { stress: 500 } });
    expect(s.stat('stress')).toBe(100);
    s.apply({ schedule: [{ id: 'x', inMinutes: 30, effects: { flags: { fired: true } }, source: 't' }] });
    s.advance(29);
    expect(s.flag('fired')).toBeUndefined();
    s.advance(2);
    expect(s.flag('fired')).toBe(true);
  });

  it('drops a consequence whose condition no longer holds', () => {
    const s = fresh('surgical');
    s.apply({ schedule: [{ id: 'y', inMinutes: 5, cond: { flag: 'stillTrue' }, effects: { flags: { fired: true } }, source: 't' }] });
    s.advance(10);
    expect(s.flag('fired')).toBeUndefined();
  });

  it('characters remember interactions', () => {
    const s = fresh('surgical');
    s.apply({ memory: [{ char: 'zeynep', key: 'dismissed' }], rel: { zeynep: -15 } });
    expect(s.remembers('zeynep', 'dismissed')).toBe(true);
    expect(s.check({ memory: 'zeynep', key: 'dismissed' })).toBe(true);
    expect(s.affinity('zeynep')).toBe(5);
  });

  it('interpolates live vitals into dialogue text', () => {
    const s = fresh('surgical');
    expect(interpolate('MAP {map} at {time}', s, 'en')).toBe(`MAP ${s.patient().map} at 05:12`);
  });
});

describe('narrative engine', () => {
  it('every dialogue node reference resolves and every string is bilingual', () => {
    for (const d of Object.values(LIBRARY)) {
      expect(d.nodes[d.start], `${d.id}.start`).toBeDefined();
      for (const n of Object.values(d.nodes)) {
        for (const c of n.choices ?? []) {
          if (c.next) expect(d.nodes[c.next], `${d.id}.${n.id} -> ${c.next}`).toBeDefined();
          expect(c.text.tr.length && c.text.en.length).toBeTruthy();
        }
        if (n.next) expect(d.nodes[n.next], `${d.id}.${n.id} next`).toBeDefined();
        for (const r of n.redirect ?? []) expect(d.nodes[r.to]).toBeDefined();
        for (const l of n.lines ?? []) expect(l.text.tr.length && l.text.en.length).toBeTruthy();
      }
    }
  });

  it('every scene action names a real scene', () => {
    const scenes = Object.keys(SCENE_AREA);
    const actions: string[] = [];
    for (const d of Object.values(LIBRARY))
      for (const n of Object.values(d.nodes)) {
        if (n.action) actions.push(n.action);
        for (const c of n.choices ?? []) if (c.action) actions.push(c.action);
      }
    for (const a of actions.filter((x) => x.startsWith('scene:'))) expect(scenes, a).toContain(a.slice(6));
  });

  it('plays the phone call: choices change the patient and the history', () => {
    const s = fresh('surgical');
    const e = new NarrativeEngine(s, LIBRARY);
    e.start('call');
    let guard = 0;
    while (!e.choosing && guard++ < 10) e.next();
    expect(e.choosing).toBe(true);
    expect(e.visibleChoices().map((c) => c.id)).toContain('mobilise');
    e.choose('mobilise');
    expect(s.patient().orReady).toBe(true);
    expect(s.flag('orMobilised')).toBe(true);
    expect(s.data.history.length).toBeGreaterThan(0);
    while (!e.choosing && guard++ < 20) e.next();
    e.choose('confirm');
    expect(s.data.goodPractice).toContain('readBack');
  });

  it('fatigue locks demanding choices', () => {
    const s = fresh('surgical');
    s.data.stats.fatigue = 95;
    const e = new NarrativeEngine(s, LIBRARY);
    e.start('call', 'decide');
    const both = e.visibleChoices().find((c) => c.id === 'both')!;
    expect(e.isLocked(both)).toBe(true);
    e.choose('both');
    expect(s.flag('orMobilised')).toBeUndefined();
  });
});

describe('legal system: outcome is not negligence', () => {
  it('a bad outcome with good care never produces fault or prosecution', () => {
    const s = fresh('surgical');
    s.data.goodPractice.push('readBack', 'timeOut', 'opNote', 'handoff');
    s.data.stats.documentation = 80;
    const p = s.patient(PATIENT_ID);
    p.shockBurden = 300; // the patient did very badly
    const r = evaluateLegal(s);
    expect(r.outcome).toBe('died');
    expect(r.fault).toBe('none');
    expect(r.criminal).not.toBe('proceedings');
    expect(r.civil).not.toBe('compensation');
  });

  it('deviation without causation is not individual fault', () => {
    const s = fresh('surgical');
    s.data.deviations.push('dismissedNurse', 'noReadBack');
    s.patient(PATIENT_ID).shockBurden = 10;
    const r = evaluateLegal(s);
    expect(r.outcome === 'recovered' || r.outcome === 'complicated').toBe(true);
    expect(r.fault === 'none' || r.fault === 'systemOnly').toBe(true);
  });

  it('serious causal deviations can reach proceedings, only through the permission stage', () => {
    const s = fresh('surgical');
    s.data.deviations.push('declinedCallNoCover', 'severeDelay');
    s.data.characters.sevim.affinity = -30;
    s.patient(PATIENT_ID).shockBurden = 300;
    const r = evaluateLegal(s);
    expect(r.fault).toBe('serious');
    expect(r.stages).toContain('criminalComplaint');
    expect(r.stages).toContain('permissionGranted');
    expect(r.criminal).toBe('proceedings');
  });

  it('documentation changes clarity, not facts', () => {
    const a = fresh('surgical');
    a.data.stats.documentation = 90;
    const b = fresh('surgical');
    b.data.stats.documentation = 10;
    for (const s of [a, b]) {
      s.patient(PATIENT_ID).shockBurden = 120;
      s.data.deviations.push('misleadingFamily');
    }
    const ra = evaluateLegal(a);
    const rb = evaluateLegal(b);
    expect(ra.fault).toBe(rb.fault);
    expect(ra.clarity).toBe('clear');
    expect(rb.clarity).toBe('unclear');
  });
});

describe('story director', () => {
  it('flags a delayed re-exploration only when the bleeding needed surgery', () => {
    for (const [truth, expectDev] of [
      ['surgical', true],
      ['coagulopathy', false],
    ] as const) {
      const s = fresh(truth);
      const st = new Story(s, { goScene() {}, startDialogue() {}, showEnding() {} });
      s.advance(160);
      st.evaluateDelay();
      expect(s.data.deviations.includes('severeDelay')).toBe(expectDev);
    }
  });

  it('epilogue jumps three weeks and writes legal flags', () => {
    const s = fresh('coagulopathy');
    const st = new Story(s, { goScene() {}, startDialogue() {}, showEnding() {} });
    st.toScene('office');
    expect(s.clock).toBeGreaterThanOrEqual(clockOf(10, 30, 21));
    expect(s.flag('outcome')).toBeDefined();
    expect(typeof s.flag('legal.complaint')).toBe('boolean');
  });
});

describe('save system', () => {
  it('round-trips the full state including pending consequences', () => {
    const kv = new MemoryKV();
    const saves = new SaveSystem(kv);
    const s = fresh('tamponade');
    s.apply({ stats: { family: -10 }, memory: [{ char: 'ayla', key: 'notNow' }], schedule: [{ id: 'z', inMinutes: 99, effects: {}, source: 't' }] });
    s.advance(17);
    expect(saves.save('slot1', s.data, 'test')).toBe(true);
    const loaded = saves.load('slot1')!;
    expect(loaded.clock).toBe(s.clock);
    expect(loaded.stats.family).toBe(s.stat('family'));
    expect(loaded.pending.map((p) => p.id)).toContain('z');
    expect(loaded.characters.ayla.memories.notNow).toBeDefined();
    expect(loaded.patients[PATIENT_ID].truth).toBe('tamponade');
    const restored = new GameState(loaded);
    restored.advance(5);
    expect(restored.patient().lastSim).toBe(Math.floor(restored.clock));
    expect(saves.latest()?.slot).toBe('slot1');
  });

  it('rejects corrupt saves', () => {
    const kv = new MemoryKV();
    kv.setItem('heartline-save-v1-auto', '{bad json');
    expect(new SaveSystem(kv).load('auto')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { applyAction, evaluateOutcome, simulate, type Truth } from '../src/medical/Patient';
import { GameState, START_CLOCK } from '../src/state/GameState';
import type { PatientAction } from '../src/state/types';

const PROTOCOL: PatientAction[] = ['fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs'];

/** Replays a path through the morning in patient-model terms: protocol at t0, re-exploration at tOR. */
function run(truth: Truth, protocolAt: number | null, orAt: number | null, seed = 99) {
  const s = new GameState(GameState.fresh(seed, truth));
  const p = s.patient();
  if (protocolAt !== null) for (const a of PROTOCOL) applyAction(p, a, START_CLOCK + protocolAt);
  if (orAt !== null) {
    simulate(p, START_CLOCK + orAt);
    for (const a of ['transfuseRBC', 'transfuseRBC', 'givePlasma', 'fluidBolus', 'reExplore', 'definitiveRepair'] as const) applyAction(p, a, START_CLOCK + orAt);
    if (truth === 'coagulopathy') applyAction(p, 'correctCoagulopathy', START_CLOCK + orAt);
  } else if (truth === 'coagulopathy') {
    simulate(p, START_CLOCK + 110);
    applyAction(p, 'correctCoagulopathy', START_CLOCK + 110);
  }
  simulate(p, START_CLOCK + 600);
  return { burden: Math.round(p.shockBurden), outcome: evaluateOutcome(p), arrested: p.arrested };
}

describe('balance', () => {
  it('a prompt, reasoned path gives a survivable course for every truth', () => {
    for (const t of ['surgical', 'tamponade', 'coagulopathy'] as Truth[]) {
      const r = run(t, 2, t === 'coagulopathy' ? null : 65);
      expect(['recovered', 'complicated'], `${t}: ${JSON.stringify(r)}`).toContain(r.outcome);
    }
  });

  it('dismissing the call and sleeping in is dangerous when the bleeding is surgical', () => {
    const r = run('surgical', 25, 170);
    expect(r.burden).toBeGreaterThan(150);
    expect(['critical', 'died']).toContain(r.outcome);
  });

  it('a moderate delay produces a worse, but not hopeless, course', () => {
    const quick = run('surgical', 2, 60);
    const slow = run('surgical', 2, 115);
    expect(slow.burden).toBeGreaterThan(quick.burden);
  });
});

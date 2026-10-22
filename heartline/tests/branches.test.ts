import { describe, expect, it } from 'vitest';
import { Story } from '../src/game/Story';
import { evaluateLegal } from '../src/legal/LegalSystem';
import { LIBRARY } from '../src/narrative/content';
import { NarrativeEngine } from '../src/narrative/Engine';
import { GameState } from '../src/state/GameState';

type Truth = 'surgical' | 'coagulopathy' | 'tamponade';

/** Plays a dialogue with a scripted list of choice ids (lines are skipped). */
function play(s: GameState, id: string, picks: string[], start?: string) {
  const e = new NarrativeEngine(s, LIBRARY, {});
  e.start(id, start);
  for (let guard = 0; guard < 200 && e.active; guard++) {
    if (e.choosing) {
      const want = picks.shift();
      const avail = e.visibleChoices().filter((c) => !e.isLocked(c));
      const c = avail.find((x) => x.id === want) ?? avail[0];
      e.choose(c.id);
    } else e.next();
  }
  return e;
}

const fresh = (truth: Truth) => new GameState(GameState.fresh(77, truth));
const noopHooks = { goScene() {}, startDialogue() {}, showEnding() {} };

describe('branching and delayed consequences', () => {
  it('declining without calling back becomes a recorded deviation 25 minutes later', () => {
    const s = fresh('surgical');
    play(s, 'declined', []);
    expect(s.data.deviations).not.toContain('declinedCallNoCover');
    s.advance(26);
    expect(s.data.deviations).toContain('declinedCallNoCover');
    expect(s.remembers('zeynep', 'ignored')).toBe(true);
  });

  it('calling back after declining cancels that consequence', () => {
    const s = fresh('surgical');
    play(s, 'declined', []);
    s.advance(5);
    s.apply({ flags: { callingBack: true } });
    play(s, 'call', ['mobilise', 'confirm']);
    s.apply({ flags: { calledBack: true } });
    s.advance(30);
    expect(s.data.deviations).not.toContain('declinedCallNoCover');
  });

  it('dismissing the nurse: she remembers, and escalates through the resident', () => {
    const s = fresh('surgical');
    play(s, 'call', ['dismiss']);
    expect(s.data.deviations).toContain('dismissedNurse');
    expect(s.remembers('zeynep', 'dismissed')).toBe(true);
    s.advance(23);
    expect(s.data.messages.some((m) => m.id === 'escalation')).toBe(true);
    expect(s.flag('eceWantsCall')).toBe(true);
  });

  it('the ICU greeting changes with what Zeynep remembers', () => {
    const a = fresh('surgical');
    a.apply({ memory: [{ char: 'zeynep', key: 'dismissed' }] });
    const e = new NarrativeEngine(a, LIBRARY, {});
    e.start('icu');
    expect(e.line?.text.en).toMatch(/You came/);
    const b = fresh('surgical');
    const e2 = new NarrativeEngine(b, LIBRARY, {});
    e2.start('icu');
    expect(e2.line?.text.en).toMatch(/Welcome/);
  });

  it('an unpaid card becomes a late fee two days later', () => {
    const s = fresh('coagulopathy');
    play(s, 'msgBank', ['later']);
    const f0 = s.stat('finance');
    s.skipTo(s.clock + 60 * 24 * 2 + 1);
    expect(s.stat('finance')).toBeLessThan(f0);
    expect(s.data.messages.some((m) => m.id === 'lateFeeSms')).toBe(true);
  });

  it('a missed concert is remembered by Deniz and changes the epilogue', () => {
    const s = fresh('coagulopathy');
    play(s, 'evening', ['stay', 'calm']);
    expect(s.remembers('deniz', 'missedConcert')).toBe(true);
    const e = new NarrativeEngine(s, LIBRARY, {});
    e.start('epilogue', 'career');
    expect(e.line?.text.en).toMatch(/Deniz has not been talking/);
  });

  it('fatigue locks the systematic check in theatre', () => {
    const s = fresh('surgical');
    s.data.stats.fatigue = 90;
    const e = new NarrativeEngine(s, LIBRARY, {});
    e.start('or', 'systematic');
    while (!e.choosing) e.next();
    const check = e.visibleChoices().find((c) => c.id === 'check')!;
    expect(e.isLocked(check)).toBe(true);
  });

  it('sleeping in after dismissing the call lets the team start care and costs the patient', () => {
    const s = fresh('surgical');
    play(s, 'call', ['dismiss']);
    const story = new Story(s, noopHooks);
    story.action('sleepUntilAlarm');
    expect(s.clock).toBeGreaterThanOrEqual(6 * 60 + 45);
    expect(s.flag('productsOrdered')).toBe(true);
    expect(s.patient().shockBurden).toBeGreaterThan(0);
  });

  it('a coagulopathy corrected without surgery avoids re-exploration and is not a delay', () => {
    const s = fresh('coagulopathy');
    play(s, 'call', ['products', 'confirm']);
    s.advance(45);
    play(s, 'icu', ['decide', 'medical', 'plan']);
    expect(s.flag('avoidedSurgery')).toBe(true);
    expect(s.patient().reExplored).toBe(false);
    const story = new Story(s, noopHooks);
    story.evaluateDelay();
    expect(s.data.deviations).toEqual([]);
  });

  it('a poor but honest course ends in review without fault; misleading the family adds a duty deviation', () => {
    const honest = fresh('tamponade');
    honest.patient().shockBurden = 120;
    play(honest, 'family', ['honest', 'apology', 'transparent']);
    const misled = fresh('tamponade');
    misled.patient().shockBurden = 120;
    play(misled, 'family', ['minimise', 'go', 'defensive']);
    const a = evaluateLegal(honest);
    const b = evaluateLegal(misled);
    expect(a.fault).toBe('none');
    expect(b.deviations).toContain('misleadingFamily');
    expect(b.grievance).toBeGreaterThan(a.grievance);
  });
});

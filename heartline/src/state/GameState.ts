import { clamp } from '../core/rng';
import { clockOf } from '../core/time';
import { applyAction, createPatient, metric, simulate, type Truth } from '../medical/Patient';
import type {
  CharacterMemory,
  Condition,
  Effect,
  FlagValue,
  LText,
  PatientSnapshot,
  SaveData,
  StatKey,
  Stats,
} from './types';
import { STAT_KEYS } from './types';

export const SAVE_VERSION = 1;
export const START_CLOCK = clockOf(5, 12);
export const PATIENT_ID = 'ahmet';

export const DEFAULT_STATS: Stats = {
  stress: 35,
  fatigue: 40,
  reputation: 62,
  teamTrust: 55,
  family: 58,
  finance: 50,
  documentation: 50,
  career: 45,
};

/** Characters whose relationship with the protagonist is tracked. */
export const TRACKED_CHARACTERS = [
  'ayla',
  'deniz',
  'zeynep',
  'ece',
  'murat',
  'serkan',
  'hulya',
  'ergin',
  'sevim',
  'burak',
] as const;

type Listener = (kind: string, data?: unknown) => void;

/**
 * The single source of truth for persistent game data. Gameplay systems mutate it only through
 * `apply(effect)` so that every change is visible to consequences, history and saving.
 */
export class GameState {
  data: SaveData;
  private listeners: Listener[] = [];

  constructor(data?: SaveData) {
    this.data = data ?? GameState.fresh(Date.now() & 0x7fffffff);
  }

  static fresh(seed: number, truth?: Truth): SaveData {
    const characters: Record<string, CharacterMemory> = {};
    for (const c of TRACKED_CHARACTERS) characters[c] = { affinity: 0, memories: {} };
    characters.ayla.affinity = 35;
    characters.deniz.affinity = 25;
    characters.zeynep.affinity = 20;
    characters.ece.affinity = 10;
    characters.murat.affinity = 15;
    characters.ergin.affinity = 5;
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      label: '',
      chapter: 'ch1',
      scene: 'bedroom',
      node: null,
      clock: START_CLOCK,
      day: 0,
      stats: { ...DEFAULT_STATS },
      flags: {},
      characters,
      patients: { [PATIENT_ID]: createPatient(PATIENT_ID, seed, START_CLOCK, truth) },
      history: [],
      pending: [],
      completed: [],
      messages: [],
      objective: 'answerPhone',
      pose: { area: 'home', x: 0, z: 0, yaw: 0 },
      deviations: [],
      goodPractice: [],
      seed,
    };
  }

  on(l: Listener) {
    this.listeners.push(l);
    return () => (this.listeners = this.listeners.filter((x) => x !== l));
  }
  emit(kind: string, data?: unknown) {
    for (const l of this.listeners) l(kind, data);
  }

  get clock() {
    return this.data.clock;
  }
  stat(k: StatKey) {
    return this.data.stats[k];
  }
  flag(k: string): FlagValue | undefined {
    return this.data.flags[k];
  }
  patient(id = PATIENT_ID): PatientSnapshot {
    return this.data.patients[id];
  }
  affinity(c: string) {
    return this.data.characters[c]?.affinity ?? 0;
  }
  remembers(c: string, key: string) {
    return !!this.data.characters[c]?.memories[key];
  }

  /** Advance the clock; runs the patient simulation and fires due consequences. */
  advance(minutes: number) {
    if (minutes <= 0) return;
    const before = Math.floor(this.data.clock);
    this.data.clock += minutes;
    const now = Math.floor(this.data.clock);
    if (now !== before) {
      for (const p of Object.values(this.data.patients)) simulate(p, now);
      // Long hours slowly wear the protagonist down. Stress feeds fatigue.
      const mins = now - before;
      this.data.stats.fatigue = clamp(this.data.stats.fatigue + mins * (0.02 + this.data.stats.stress * 0.0003), 0, 100);
      this.fireDue();
      this.emit('clock', now);
    }
  }

  /** Jump forward (e.g. "three weeks later"): consequences fire in order, patients stop simulating. */
  skipTo(clock: number) {
    if (clock <= this.data.clock) return;
    this.data.clock = clock;
    this.fireDue();
    this.emit('clock', clock);
  }

  private fireDue() {
    // Consequences may schedule further consequences; loop until stable.
    for (let guard = 0; guard < 20; guard++) {
      const due = this.data.pending.filter((p) => p.due <= this.data.clock).sort((a, b) => a.due - b.due);
      if (!due.length) return;
      this.data.pending = this.data.pending.filter((p) => p.due > this.data.clock);
      for (const c of due) {
        if (c.cond && !this.check(c.cond)) continue;
        this.apply(c.effects, c.source);
        this.data.completed.push('consequence:' + c.id);
        this.emit('consequence', c);
      }
    }
  }

  check(c: Condition | undefined): boolean {
    if (!c) return true;
    if ('all' in c) return c.all.every((x) => this.check(x));
    if ('any' in c) return c.any.some((x) => this.check(x));
    if ('not' in c) return !this.check(c.not);
    if ('flag' in c) {
      const v = this.data.flags[c.flag];
      return c.is === undefined ? !!v : v === c.is;
    }
    if ('stat' in c) return inRange(this.data.stats[c.stat], c.min, c.max);
    if ('rel' in c) return inRange(this.affinity(c.rel), c.min, c.max);
    if ('memory' in c) return this.remembers(c.memory, c.key);
    if ('patient' in c) {
      const p = this.data.patients[c.patient];
      return !!p && inRange(metric(p, c.metric, this.data.clock), c.min, c.max);
    }
    if ('truth' in c) return this.data.patients[c.truth]?.truth === c.is;
    if ('clockAfter' in c) return this.data.clock >= c.clockAfter;
    if ('clockBefore' in c) return this.data.clock < c.clockBefore;
    return true;
  }

  /** Apply an effect. Returns any textual results from medical actions (e.g. echo findings). */
  apply(e: Effect | undefined, source = ''): LText[] {
    if (!e) return [];
    const results: LText[] = [];
    if (e.minutes) this.advance(e.minutes);
    if (e.stats) {
      for (const k of STAT_KEYS) {
        const d = e.stats[k];
        if (d) this.data.stats[k] = clamp(this.data.stats[k] + d, 0, 100);
      }
    }
    if (e.rel) {
      for (const [c, d] of Object.entries(e.rel)) {
        const m = (this.data.characters[c] ??= { affinity: 0, memories: {} });
        m.affinity = clamp(m.affinity + d, -100, 100);
      }
    }
    if (e.flags) Object.assign(this.data.flags, e.flags);
    if (e.add) {
      for (const [k, d] of Object.entries(e.add)) this.data.flags[k] = (Number(this.data.flags[k]) || 0) + d;
    }
    if (e.memory) {
      for (const m of e.memory) {
        const cm = (this.data.characters[m.char] ??= { affinity: 0, memories: {} });
        cm.memories[m.key] = Math.floor(this.data.clock);
      }
    }
    if (e.patient) {
      const p = this.data.patients[e.patient.id];
      if (p) {
        for (const a of e.patient.actions) {
          const r = applyAction(p, a, Math.floor(this.data.clock));
          if (r) results.push(r);
        }
      }
    }
    if (e.deviation && !this.data.deviations.includes(e.deviation)) this.data.deviations.push(e.deviation);
    if (e.goodPractice && !this.data.goodPractice.includes(e.goodPractice)) this.data.goodPractice.push(e.goodPractice);
    if (e.history) {
      this.data.history.push({ at: Math.floor(this.data.clock), chapter: this.data.chapter, text: e.history.text, tag: e.history.tag });
      this.emit('history', e.history);
    }
    if (e.message) this.pushMessage(e.message.id, e.message.from, e.message.text);
    if (e.objective !== undefined) {
      this.data.objective = e.objective;
      this.emit('objective', e.objective);
    }
    if (e.schedule) {
      for (const s of e.schedule) {
        if (this.data.pending.some((p) => p.id === s.id) || this.data.completed.includes('consequence:' + s.id)) continue;
        this.data.pending.push({ id: s.id, due: Math.floor(this.data.clock) + s.inMinutes, cond: s.cond, effects: s.effects, source: s.source || source });
      }
    }
    this.emit('changed', e);
    return results;
  }

  pushMessage(id: string, from: string, text: LText) {
    if (this.data.messages.some((m) => m.id === id)) return;
    this.data.messages.push({ id, from, at: Math.floor(this.data.clock), text, read: false });
    this.emit('message', id);
  }

  unreadMessages() {
    return this.data.messages.filter((m) => !m.read).length;
  }

  markDone(id: string) {
    if (!this.data.completed.includes(id)) this.data.completed.push(id);
  }
  done(id: string) {
    return this.data.completed.includes(id);
  }

  snapshot(): SaveData {
    return JSON.parse(JSON.stringify(this.data)) as SaveData;
  }
}

function inRange(v: number, min?: number, max?: number) {
  return (min === undefined || v >= min) && (max === undefined || v <= max);
}

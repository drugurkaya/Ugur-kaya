/** Shared data types for the persistent game state. Everything here must stay JSON-serialisable. */

export type Lang = 'tr' | 'en';

/** A localised string. Every player-facing narrative string carries both languages. */
export interface LText {
  tr: string;
  en: string;
}

export const STAT_KEYS = [
  'stress',
  'fatigue',
  'reputation',
  'teamTrust',
  'family',
  'finance',
  'documentation',
  'career',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type FlagValue = boolean | number | string;

export interface HistoryEntry {
  /** Game clock in minutes since day 0 00:00 when the decision happened. */
  at: number;
  chapter: string;
  text: LText;
  /** Tag used for filtering in the journal: 'clinical' | 'team' | 'family' | 'legal' | 'career' | 'self'. */
  tag: string;
}

/** A consequence waiting to fire later in the story. */
export interface PendingConsequence {
  id: string;
  /** Absolute game minute when it becomes due. */
  due: number;
  /** Optional condition re-checked when it becomes due; if false it is dropped silently. */
  cond?: Condition;
  effects: Effect;
  /** Where it came from (shown in history). */
  source: string;
}

export interface CharacterMemory {
  /** -100..100 relationship towards the protagonist. */
  affinity: number;
  /** Things this character remembers; keys are referenced by dialogue conditions. */
  memories: Record<string, number>;
}

export interface PhoneMessage {
  id: string;
  from: string;
  at: number;
  text: LText;
  read: boolean;
}

export interface PlayerPose {
  area: string;
  x: number;
  z: number;
  yaw: number;
}

// ---------------------------------------------------------------------------
// Conditions and effects (used by narrative data)
// ---------------------------------------------------------------------------

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { flag: string; is?: FlagValue }
  | { stat: StatKey; min?: number; max?: number }
  | { rel: string; min?: number; max?: number }
  | { memory: string; key: string }
  | { patient: string; metric: PatientMetric; min?: number; max?: number }
  | { truth: string; is: string }
  | { clockAfter: number }
  | { clockBefore: number };

export type PatientMetric =
  | 'map'
  | 'hr'
  | 'cvp'
  | 'drainRate'
  | 'drainTotal'
  | 'hb'
  | 'lactate'
  | 'shockBurden'
  | 'minutesSinceCall';

/** A medical action applied to the simulated patient. */
export type PatientAction =
  | 'fluidBolus'
  | 'transfuseRBC'
  | 'givePlasma'
  | 'givePlatelets'
  | 'giveProtamine'
  | 'giveTranexamic'
  | 'warmPatient'
  | 'startVasopressor'
  | 'stripDrains'
  | 'bedsideEcho'
  | 'sendLabs'
  | 'orTeamMobilised'
  | 'reExplore'
  | 'definitiveRepair'
  | 'correctCoagulopathy'
  | 'minorInsult'
  | 'majorInsult';

export interface Effect {
  stats?: Partial<Record<StatKey, number>>;
  rel?: Record<string, number>;
  flags?: Record<string, FlagValue>;
  /** Increment numeric flags. */
  add?: Record<string, number>;
  /** Game minutes consumed by the action. */
  minutes?: number;
  patient?: { id: string; actions: PatientAction[] };
  memory?: { char: string; key: string }[];
  history?: { text: LText; tag: string };
  message?: { id: string; from: string; text: LText };
  schedule?: { id: string; inMinutes: number; cond?: Condition; effects: Effect; source: string }[];
  objective?: string | null;
  /** A standard-of-care deviation recorded as evidence (see legal/LegalSystem.ts). */
  deviation?: string;
  /** Something done well that later review can see (e.g. 'readBack', 'timeOut'). */
  goodPractice?: string;
}

export interface PatientSnapshot {
  id: string;
  truth: string;
  map: number;
  hr: number;
  cvp: number;
  drainRate: number;
  drainTotal: number;
  hb: number;
  lactate: number;
  temp: number;
  inr: number;
  platelets: number;
  shockBurden: number;
  bleedingControlled: boolean;
  coagCorrected: boolean;
  reExplored: boolean;
  reExploredAt: number | null;
  callAt: number;
  echoDone: boolean;
  labsSent: boolean;
  orReady: boolean;
  arrested: boolean;
  interventions: string[];
  lastSim: number;
  outcome: string | null;
  seed: number;
  /** Model internals the player never sees directly (blood deficit, retained clot, ...). */
  hidden: PatientHidden;
}

export interface PatientHidden {
  deficit: number;
  retained: number;
  hypoMinutes: number;
  productsAt: number | null;
  drainEma: number;
  clotted: boolean;
  stripAt: number | null;
  pressorOn: boolean;
  hbNadir: number;
}

export interface SaveData {
  version: number;
  savedAt: string;
  label: string;
  chapter: string;
  scene: string;
  node: string | null;
  clock: number;
  day: number;
  stats: Stats;
  flags: Record<string, FlagValue>;
  characters: Record<string, CharacterMemory>;
  patients: Record<string, PatientSnapshot>;
  history: HistoryEntry[];
  pending: PendingConsequence[];
  completed: string[];
  messages: PhoneMessage[];
  objective: string | null;
  pose: PlayerPose;
  deviations: string[];
  goodPractice: string[];
  seed: number;
}

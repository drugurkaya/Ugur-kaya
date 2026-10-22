import type { Condition, Effect, LText, PatientAction } from '../../state/types';

export const L = (tr: string, en: string): LText => ({ tr, en });

export const P = (...actions: PatientAction[]): Effect['patient'] => ({ id: 'ahmet', actions });

export const hist = (tag: string, tr: string, en: string): Effect['history'] => ({ tag, text: L(tr, en) });

export const isTruth = (t: string): Condition => ({ truth: 'ahmet', is: t });
export const flag = (f: string, is?: boolean | number | string): Condition => (is === undefined ? { flag: f } : { flag: f, is });
export const notFlag = (f: string): Condition => ({ not: { flag: f } });
export const mapBelow = (v: number): Condition => ({ patient: 'ahmet', metric: 'map', max: v - 1 });
export const mapAtLeast = (v: number): Condition => ({ patient: 'ahmet', metric: 'map', min: v });

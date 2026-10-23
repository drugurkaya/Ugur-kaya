import type { Lang } from '../state/types';

export type Quality = 'performance' | 'balanced' | 'quality';

export interface SettingsData {
  lang: Lang;
  quality: Quality;
  master: number;
  sfx: number;
  ambience: number;
  voice: boolean;
  textSize: number;
  textSpeed: number;
  lookSensitivity: number;
  invertY: boolean;
  reduceMotion: boolean;
  autosave: boolean;
}

const KEY = 'heartline-settings-v1';

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
}

export function defaultSettings(): SettingsData {
  const lang: Lang = typeof navigator !== 'undefined' && !/^tr/i.test(navigator.language || '') ? 'en' : 'tr';
  return {
    lang,
    quality: 'balanced',
    master: 0.8,
    sfx: 0.9,
    ambience: 0.7,
    voice: false,
    textSize: 1,
    textSpeed: 1,
    lookSensitivity: 1,
    invertY: false,
    reduceMotion: false,
    autosave: true,
  };
}

/** Quality presets: what each one switches on. */
export const PRESETS: Record<
  Quality,
  { pixelRatio: number; shadows: boolean; shadowSize: number; post: boolean; bloom: boolean; reflections: boolean; lights: number; dof: boolean; ao: boolean; atmosphere: boolean }
> = {
  performance: { pixelRatio: 1.25, shadows: false, shadowSize: 512, post: false, bloom: false, reflections: false, lights: 0, dof: false, ao: false, atmosphere: false },
  // Balanced is the default on phones: a recent iPhone handles shadows, depth of field and the grade.
  balanced: { pixelRatio: 1.75, shadows: true, shadowSize: 1024, post: true, bloom: true, reflections: false, lights: 1, dof: true, ao: false, atmosphere: true },
  quality: { pixelRatio: 2, shadows: true, shadowSize: 2048, post: true, bloom: true, reflections: true, lights: 2, dof: true, ao: true, atmosphere: true },
};

export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    this.data = defaultSettings();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<SettingsData> & { v?: number };
        // v2: phones used to default to Performance; move them up once to the new default.
        if ((stored.v ?? 1) < 2 && stored.quality === 'performance') delete stored.quality;
        this.data = { ...this.data, ...stored };
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
  }

  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    this.data[k] = v;
    this.save();
    for (const l of this.listeners) l(this.data);
  }

  onChange(l: (s: SettingsData) => void) {
    this.listeners.push(l);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...this.data, v: 2 }));
    } catch {
      /* ignore */
    }
  }
}

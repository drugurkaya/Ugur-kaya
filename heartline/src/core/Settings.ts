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
    quality: typeof window !== 'undefined' && isTouchDevice() ? 'performance' : 'balanced',
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
export const PRESETS: Record<Quality, { pixelRatio: number; shadows: boolean; shadowSize: number; post: boolean; bloom: boolean; reflections: boolean; lights: number }> = {
  performance: { pixelRatio: 1, shadows: false, shadowSize: 512, post: false, bloom: false, reflections: false, lights: 0 },
  balanced: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, post: true, bloom: false, reflections: false, lights: 1 },
  quality: { pixelRatio: 2, shadows: true, shadowSize: 2048, post: true, bloom: true, reflections: true, lights: 2 },
};

export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    this.data = defaultSettings();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...this.data, ...(JSON.parse(raw) as Partial<SettingsData>) };
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
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}

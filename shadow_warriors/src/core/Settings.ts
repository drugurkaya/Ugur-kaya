import type { Difficulty } from '../ai/AIController';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'lp'
  | 'hp'
  | 'lk'
  | 'hk'
  | 'block'
  | 'dodge'
  | 'special'
  | 'pause';

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Yukarı (derinlik)',
  down: 'Aşağı (derinlik)',
  left: 'Sol',
  right: 'Sağ',
  lp: 'Hafif Yumruk',
  hp: 'Güçlü Yumruk',
  lk: 'Hafif Tekme',
  hk: 'Güçlü Tekme',
  block: 'Blok',
  dodge: 'Kaçınma / Hamle',
  special: 'Özel Saldırı',
  pause: 'Duraklat',
};

export const DEFAULT_BINDINGS: Record<Action, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  lp: 'KeyJ',
  hp: 'KeyK',
  lk: 'KeyU',
  hk: 'KeyI',
  block: 'KeyL',
  dodge: 'Space',
  special: 'KeyO',
  pause: 'Escape',
};

export interface SettingsData {
  quality: Quality;
  resolutionScale: number;
  shadows: boolean;
  bloom: boolean;
  reflections: boolean;
  particles: number;
  showFps: boolean;
  cameraShake: number;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  musicVolume: number;
  difficulty: Difficulty;
  bindings: Record<Action, string>;
  debugHitboxes: boolean;
}

export const QUALITY_PRESETS: Record<Quality, Partial<SettingsData>> = {
  low: { resolutionScale: 0.7, shadows: false, bloom: false, reflections: false, particles: 0.4 },
  medium: { resolutionScale: 0.85, shadows: true, bloom: true, reflections: false, particles: 0.7 },
  high: { resolutionScale: 1, shadows: true, bloom: true, reflections: true, particles: 1 },
  ultra: { resolutionScale: 1, shadows: true, bloom: true, reflections: true, particles: 1 },
};

const KEY = 'shadow-warriors-settings-v1';

const defaults = (): SettingsData => ({
  quality: 'high',
  resolutionScale: 1,
  shadows: true,
  bloom: true,
  reflections: true,
  particles: 1,
  showFps: false,
  cameraShake: 1,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.6,
  musicVolume: 0.5,
  difficulty: 'normal',
  bindings: { ...DEFAULT_BINDINGS },
  debugHitboxes: false,
});

/** Persisted user settings; storage failures (private mode etc.) fall back to defaults. */
export class Settings {
  data: SettingsData;
  private listeners: ((s: SettingsData) => void)[] = [];

  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        this.data = { ...this.data, ...parsed, bindings: { ...DEFAULT_BINDINGS, ...(parsed.bindings ?? {}) } };
      }
    } catch {
      /* storage unavailable */
    }
  }

  onChange(fn: (s: SettingsData) => void): void {
    this.listeners.push(fn);
  }

  update(patch: Partial<SettingsData>): void {
    this.data = { ...this.data, ...patch };
    this.save();
    for (const l of this.listeners) l(this.data);
  }

  applyQuality(q: Quality): void {
    this.update({ quality: q, ...QUALITY_PRESETS[q] });
  }

  resetBindings(): void {
    this.update({ bindings: { ...DEFAULT_BINDINGS } });
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}

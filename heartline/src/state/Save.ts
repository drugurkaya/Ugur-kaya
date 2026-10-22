import { SAVE_VERSION } from './GameState';
import type { SaveData } from './types';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

/** Minimal storage interface so tests can use an in-memory map. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const PREFIX = 'heartline-save-v1-';

export class SaveSystem {
  constructor(private kv: KV | null = safeLocalStorage()) {}

  get available() {
    return !!this.kv;
  }

  save(slot: SlotId, data: SaveData, label: string): boolean {
    if (!this.kv) return false;
    const copy: SaveData = { ...JSON.parse(JSON.stringify(data)), savedAt: new Date().toISOString(), label };
    try {
      this.kv.setItem(PREFIX + slot, JSON.stringify(copy));
      return true;
    } catch {
      return false;
    }
  }

  load(slot: SlotId): SaveData | null {
    if (!this.kv) return null;
    try {
      const raw = this.kv.getItem(PREFIX + slot);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (!isValid(d)) return null;
      return d;
    } catch {
      return null;
    }
  }

  delete(slot: SlotId) {
    this.kv?.removeItem(PREFIX + slot);
  }

  /** The most recent save of any slot, used by "Continue". */
  latest(): { slot: SlotId; data: SaveData } | null {
    let best: { slot: SlotId; data: SaveData } | null = null;
    for (const s of SLOTS) {
      const d = this.load(s);
      if (d && (!best || d.savedAt > best.data.savedAt)) best = { slot: s, data: d };
    }
    return best;
  }
}

function isValid(d: SaveData): boolean {
  return (
    !!d &&
    d.version === SAVE_VERSION &&
    typeof d.clock === 'number' &&
    !!d.stats &&
    !!d.patients &&
    Array.isArray(d.history) &&
    Array.isArray(d.pending) &&
    !!d.pose
  );
}

function safeLocalStorage(): KV | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const k = '__heartline_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

export class MemoryKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

import type { CharacterDef, MoveDef } from './types';

type MoveSpec = Omit<MoveDef, 'id'>;

const defineMoves = (spec: Record<string, MoveSpec>): Record<string, MoveDef> => {
  const out: Record<string, MoveDef> = {};
  for (const [id, m] of Object.entries(spec)) out[id] = { id, ...m };
  return out;
};

/*
 * Frame data is authored at 60 fps. Hitboxes are authored in fighter-local
 * space and the animation clips are keyed to land on the same frames, so the
 * simulation never depends on the rendered mesh.
 */

export const PHANTOM: CharacterDef = {
  id: 'phantom',
  name: 'THE PHANTOM',
  title: 'Gölgelerin Son Öğrencisi',
  description: 'Çevik bir suikastçı. Hızlı yumruklar, keskin tekmeler ve uzun kombolar.',
  maxHealth: 1000,
  scale: 1.0,
  pushRadius: 0.4,
  walkFwd: 2.7,
  walkBack: 2.3,
  walkLat: 2.1,
  dashDist: 2.1,
  backdashDist: 1.7,
  sidestepDist: 1.25,
  weight: 1.0,
  stats: { power: 3, speed: 5, defense: 3, range: 3 },
  normals: { lp: 'p_jab', hp: 'p_palm', lk: 'p_snap', hk: 'p_round', special: 'p_special' },
  chains: {
    p_jab: { lp: 'p_cross', lk: 'p_snap', hp: 'p_palm', special: 'p_special' },
    p_cross: { lk: 'p_snap', hp: 'p_palm', hk: 'p_round', special: 'p_special' },
    p_snap: { hk: 'p_round', lp: 'p_cross', special: 'p_special' },
    p_palm: { hk: 'p_round', special: 'p_special' },
    p_round: { special: 'p_special' },
  },
  namedCombos: [
    { name: 'SHADOW CHAIN', seq: ['p_jab', 'p_cross', 'p_snap', 'p_special'] },
    { name: 'NIGHTFALL', seq: ['p_jab', 'p_cross', 'p_snap', 'p_round'] },
    { name: 'GHOST PALM', seq: ['p_jab', 'p_cross', 'p_palm'] },
  ],
  moves: defineMoves({
    p_jab: {
      name: 'Jab', anim: 'p_jab', startup: 5, active: 3, recovery: 9,
      damage: 32, chip: 0.12, guardDamage: 8, hitstun: 17, blockstun: 11,
      pushHit: 1.2, pushBlock: 1.5, hitbox: { fwd: 0.72, up: 1.42, lat: 0.06, r: 0.2 },
      lunge: 0.14, effect: 'normal', cancelWindow: [6, 18], hitStop: 5, shake: 0.12,
      meterGain: 5, limb: 'handL', sfx: 'light',
    },
    p_cross: {
      name: 'Cross', anim: 'p_cross', startup: 6, active: 3, recovery: 11,
      damage: 38, chip: 0.12, guardDamage: 9, hitstun: 18, blockstun: 12,
      pushHit: 1.4, pushBlock: 1.7, hitbox: { fwd: 0.8, up: 1.4, lat: -0.04, r: 0.21 },
      lunge: 0.2, effect: 'normal', cancelWindow: [7, 21], hitStop: 6, shake: 0.15,
      meterGain: 6, limb: 'handR', sfx: 'light',
    },
    p_palm: {
      name: 'Shadow Palm', anim: 'p_palm', startup: 11, active: 4, recovery: 16,
      damage: 78, chip: 0.15, guardDamage: 18, hitstun: 22, blockstun: 16,
      pushHit: 3.2, pushBlock: 2.4, hitbox: { fwd: 0.88, up: 1.3, lat: 0, r: 0.25 },
      lunge: 0.38, effect: 'push', cancelWindow: [12, 27], hitStop: 8, shake: 0.32,
      meterGain: 9, limb: 'handR', sfx: 'medium',
    },
    p_snap: {
      name: 'Snap Kick', anim: 'p_snap', startup: 8, active: 3, recovery: 12,
      damage: 48, chip: 0.12, guardDamage: 12, hitstun: 19, blockstun: 13,
      pushHit: 1.7, pushBlock: 1.8, hitbox: { fwd: 0.95, up: 0.98, lat: -0.05, r: 0.22 },
      lunge: 0.16, effect: 'normal', cancelWindow: [9, 23], hitStop: 6, shake: 0.18,
      meterGain: 7, limb: 'footR', sfx: 'medium',
    },
    p_round: {
      name: 'Crescent Roundhouse', anim: 'p_round', startup: 14, active: 4, recovery: 20,
      damage: 98, chip: 0.15, guardDamage: 22, hitstun: 26, blockstun: 17,
      pushHit: 3.8, pushBlock: 2.8, hitbox: { fwd: 0.85, up: 1.45, lat: -0.35, r: 0.27 },
      hitboxEnd: { fwd: 1.0, lat: 0.25 },
      lunge: 0.22, effect: 'push', cancelWindow: [15, 32], hitStop: 10, shake: 0.42,
      meterGain: 11, limb: 'footR', sfx: 'heavy',
    },
    p_special: {
      name: 'Phantom Rush', anim: 'p_special', startup: 10, active: 30, recovery: 24,
      damage: 260, chip: 0.2, guardDamage: 45, hitstun: 16, blockstun: 12,
      pushHit: 4.5, pushBlock: 2.5, hitbox: { fwd: 0.85, up: 1.3, lat: 0, r: 0.45 },
      lunge: 2.6, effect: 'knockdown', multiHit: [10, 17, 24, 34], multiDamage: [42, 42, 52, 124],
      invuln: [0, 12], cancelWindow: [999, 999], hitStop: 6, shake: 0.5,
      meterGain: 0, limb: 'footR', sfx: 'special',
    },
  }),
};

export const IRON_FANG: CharacterDef = {
  id: 'ironfang',
  name: 'IRON FANG',
  title: 'Zırhlı Tapınak Muhafızı',
  description: 'Ağır zırhlı bir dev. Yavaş ama yıkıcı; darbeleri rakibi geriye savurur.',
  maxHealth: 1150,
  scale: 1.1,
  pushRadius: 0.5,
  walkFwd: 2.0,
  walkBack: 1.7,
  walkLat: 1.5,
  dashDist: 1.7,
  backdashDist: 1.3,
  sidestepDist: 1.0,
  weight: 1.35,
  stats: { power: 5, speed: 2, defense: 5, range: 4 },
  normals: { lp: 'f_jab', hp: 'f_haymaker', lk: 'f_push', hk: 'f_axe', special: 'f_special' },
  chains: {
    f_jab: { lp: 'f_hook', lk: 'f_push', hp: 'f_haymaker', special: 'f_special' },
    f_hook: { hp: 'f_haymaker', hk: 'f_axe', special: 'f_special' },
    f_push: { hk: 'f_axe', special: 'f_special' },
    f_haymaker: { special: 'f_special' },
    f_axe: { special: 'f_special' },
  },
  namedCombos: [
    { name: 'IRON AVALANCHE', seq: ['f_jab', 'f_hook', 'f_haymaker'] },
    { name: 'FANG CRUSHER', seq: ['f_jab', 'f_push', 'f_axe'] },
    { name: 'TEMPLE FALL', seq: ['f_jab', 'f_hook', 'f_axe'] },
  ],
  moves: defineMoves({
    f_jab: {
      name: 'Iron Jab', anim: 'f_jab', startup: 7, active: 3, recovery: 11,
      damage: 44, chip: 0.14, guardDamage: 11, hitstun: 18, blockstun: 12,
      pushHit: 1.6, pushBlock: 1.9, hitbox: { fwd: 0.82, up: 1.5, lat: 0.06, r: 0.22 },
      lunge: 0.15, effect: 'normal', cancelWindow: [8, 22], hitStop: 6, shake: 0.18,
      meterGain: 6, limb: 'handL', sfx: 'light',
    },
    f_hook: {
      name: 'Body Hook', anim: 'f_hook', startup: 9, active: 3, recovery: 14,
      damage: 56, chip: 0.14, guardDamage: 14, hitstun: 20, blockstun: 13,
      pushHit: 2.0, pushBlock: 2.0, hitbox: { fwd: 0.78, up: 1.2, lat: -0.12, r: 0.24 },
      lunge: 0.2, effect: 'normal', cancelWindow: [10, 26], hitStop: 7, shake: 0.22,
      meterGain: 7, limb: 'handR', sfx: 'medium',
    },
    f_haymaker: {
      name: 'Fang Haymaker', anim: 'f_haymaker', startup: 17, active: 4, recovery: 22,
      damage: 125, chip: 0.18, guardDamage: 34, hitstun: 26, blockstun: 19,
      pushHit: 5.2, pushBlock: 3.6, hitbox: { fwd: 0.95, up: 1.5, lat: -0.3, r: 0.28 },
      hitboxEnd: { fwd: 1.05, lat: 0.15 },
      lunge: 0.35, effect: 'push', armor: [3, 17], cancelWindow: [18, 36], hitStop: 11, shake: 0.6,
      meterGain: 13, limb: 'handR', sfx: 'heavy',
    },
    f_push: {
      name: 'Breaker Kick', anim: 'f_push', startup: 11, active: 4, recovery: 16,
      damage: 62, chip: 0.14, guardDamage: 20, hitstun: 21, blockstun: 15,
      pushHit: 4.6, pushBlock: 3.8, hitbox: { fwd: 1.05, up: 1.02, lat: -0.05, r: 0.26 },
      lunge: 0.2, effect: 'push', cancelWindow: [12, 28], hitStop: 8, shake: 0.35,
      meterGain: 8, limb: 'footR', sfx: 'medium',
    },
    f_axe: {
      name: 'Mountain Crusher', anim: 'f_axe', startup: 21, active: 4, recovery: 24,
      damage: 140, chip: 0.18, guardDamage: 40, hitstun: 28, blockstun: 20,
      pushHit: 3.0, pushBlock: 3.0, hitbox: { fwd: 1.0, up: 1.55, lat: 0, r: 0.3 },
      hitboxEnd: { up: 0.9 },
      lunge: 0.3, effect: 'knockdown', cancelWindow: [22, 40], hitStop: 13, shake: 0.75,
      meterGain: 14, limb: 'footR', sfx: 'heavy',
    },
    f_special: {
      name: 'Fang Breaker', anim: 'f_special', startup: 26, active: 6, recovery: 30,
      damage: 290, chip: 0.2, guardDamage: 70, hitstun: 30, blockstun: 24,
      pushHit: 6.0, pushBlock: 4.0, hitbox: { fwd: 1.0, up: 0.5, lat: 0, r: 0.6 },
      lunge: 1.7, effect: 'knockdown', armor: [0, 26], areaRadius: 2.1,
      cancelWindow: [999, 999], hitStop: 16, shake: 1.2,
      meterGain: 0, limb: 'body', sfx: 'special',
    },
  }),
};

export const CHARACTERS = { phantom: PHANTOM, ironfang: IRON_FANG } as const;
export type CharacterId = keyof typeof CHARACTERS;

export const ARENA_RADIUS = 7.2;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;

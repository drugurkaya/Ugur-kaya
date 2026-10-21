export type Button = 'lp' | 'hp' | 'lk' | 'hk' | 'special';

export const BUTTONS: readonly Button[] = ['lp', 'hp', 'lk', 'hk', 'special'];

/**
 * Per-frame input in fighter-relative axes. The player controller converts
 * screen-relative keys into this; the AI produces it directly, so both sides
 * drive the exact same fighter logic.
 */
export interface FighterInput {
  /** +1 toward the opponent, -1 away. */
  fwd: number;
  /** +1 sidestep to the fighter's left, -1 to the right. */
  lat: number;
  block: boolean;
  /** Edge-triggered presses for this frame only. */
  pressed: Set<Button>;
  dodge: boolean; // edge-triggered
}

export const emptyInput = (): FighterInput => ({ fwd: 0, lat: 0, block: false, pressed: new Set(), dodge: false });

export type FighterState =
  | 'intro'
  | 'idle'
  | 'walk'
  | 'dash'
  | 'backdash'
  | 'sidestep'
  | 'attack'
  | 'block'
  | 'blockstun'
  | 'hitstun'
  | 'stagger'
  | 'guardbreak'
  | 'launch'
  | 'down'
  | 'getup'
  | 'ko'
  | 'victory'
  | 'defeat';

export type HitEffect = 'normal' | 'push' | 'stagger' | 'knockdown';

export type Limb = 'handL' | 'handR' | 'footL' | 'footR' | 'body';

/** Hit sphere in fighter-local space (fwd along facing, up from ground, lat to the left). */
export interface HitSphere {
  fwd: number;
  up: number;
  lat: number;
  r: number;
}

export interface MoveDef {
  id: string;
  name: string;
  /** Animation clip id the view layer plays. */
  anim: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Fraction of damage taken through block. */
  chip: number;
  guardDamage: number;
  hitstun: number;
  blockstun: number;
  /** Knockback speed (m/s) applied to the defender. */
  pushHit: number;
  pushBlock: number;
  hitbox: HitSphere;
  /** Optional sweep: the hitbox lerps toward this over the active frames. */
  hitboxEnd?: Partial<HitSphere>;
  /** Forward distance travelled during startup+active (root motion). */
  lunge: number;
  effect: HitEffect;
  /** Frames (relative to move start) at which an additional hit may land. */
  multiHit?: number[];
  /** Per-hit damage for multi-hit moves, overrides `damage` for that index. */
  multiDamage?: number[];
  /** Frames during which incoming hits do not interrupt (armor). */
  armor?: [number, number];
  /** Frames during which the fighter cannot be hit at all. */
  invuln?: [number, number];
  /** Frame window (relative to move start) in which a chained move may begin. */
  cancelWindow: [number, number];
  hitStop: number;
  shake: number;
  meterGain: number;
  limb: Limb;
  sfx: 'light' | 'medium' | 'heavy' | 'special';
  /** For specials: radius of an area hit (shockwave) instead of a sphere. */
  areaRadius?: number;
}

export interface CharacterDef {
  id: 'phantom' | 'ironfang';
  name: string;
  title: string;
  description: string;
  maxHealth: number;
  /** Visual + collision scale. */
  scale: number;
  pushRadius: number;
  walkFwd: number;
  walkBack: number;
  walkLat: number;
  dashDist: number;
  backdashDist: number;
  sidestepDist: number;
  /** Mass factor: higher = less knockback received. */
  weight: number;
  moves: Record<string, MoveDef>;
  /** Which move a button starts from neutral. */
  normals: Record<Button, string>;
  /** Chains: from move id -> button -> next move id (only on hit/block). */
  chains: Record<string, Partial<Record<Button, string>>>;
  /** Named target combos for UI flavour (sequence of move ids). */
  namedCombos: { name: string; seq: string[] }[];
  stats: { power: number; speed: number; defense: number; range: number };
}

export type MatchEvent =
  | {
      type: 'hit';
      attacker: number;
      defender: number;
      x: number;
      y: number;
      z: number;
      damage: number;
      blocked: boolean;
      counter: boolean;
      back: boolean;
      armored: boolean;
      combo: number;
      move: MoveDef;
      effect: HitEffect;
      ko: boolean;
    }
  | { type: 'whiff'; fighter: number; move: MoveDef }
  | { type: 'attackStart'; fighter: number; move: MoveDef }
  | { type: 'specialStart'; fighter: number; move: MoveDef }
  | { type: 'guardbreak'; fighter: number }
  | { type: 'land'; fighter: number; x: number; z: number; heavy: boolean }
  | { type: 'dodge'; fighter: number; kind: 'dash' | 'backdash' | 'sidestep' }
  | { type: 'shockwave'; fighter: number; x: number; z: number; radius: number }
  | { type: 'comboName'; fighter: number; name: string }
  | { type: 'ko'; loser: number; winner: number }
  | { type: 'timeUp' };

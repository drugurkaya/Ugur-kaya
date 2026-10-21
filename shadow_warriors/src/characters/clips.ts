import { easeIn, easeInOut, easeOut } from '../core/math';
import type { CharacterId } from '../combat/data';
import { IRON_FANG, PHANTOM } from '../combat/data';
import type { MoveDef } from '../combat/types';
import { blendPose, buildPose, createPose, mergeSpec, type Pose, type PoseSpec } from './Pose';

/*
 * Hand-keyed procedural animation clips (frames at 60 fps). These are
 * authored in code: they are NOT motion-capture data. Attack clips are keyed
 * against each move's startup/active/recovery so the visual strike lands on
 * exactly the frames the simulation's hitbox is live.
 *
 * Conventions (local bone rotations in degrees, XYZ order):
 *  spine/chest  X+ bend forward, Y+ twist left, Z+ lean right
 *  head/neck    X+ look down,    Y+ turn left
 *  upperArm     X- raise forward, Z+ (L) / Z- (R) raise sideways
 *  foreArm      X- bend elbow
 *  thigh        X- lift knee forward, Z+ (L) / Z- (R) open sideways
 *  shin         X+ bend knee;  foot X+ point toe
 */

export type Ease = 'linear' | 'in' | 'out' | 'inOut';
const EASE: Record<Ease, (t: number) => number> = { linear: (t) => t, in: easeIn, out: easeOut, inOut: easeInOut };

export interface Clip {
  length: number;
  loop: boolean;
  keys: { f: number; pose: Pose; ease: Ease }[];
}

type Key = [frame: number, spec: PoseSpec, ease?: Ease];

const clip = (base: PoseSpec, length: number, keys: Key[], loop = false): Clip => ({
  length,
  loop,
  keys: keys.map(([f, spec, ease]) => ({ f, pose: buildPose(mergeSpec(base, spec)), ease: ease ?? 'inOut' })),
});

export const sampleClip = (c: Clip, frame: number, out: Pose): Pose => {
  let f = frame;
  if (c.loop) f = ((f % c.length) + c.length) % c.length;
  const k = c.keys;
  if (f <= k[0].f) return blendPose(k[0].pose, k[0].pose, 0, out);
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (f <= b.f) {
      const t = (f - a.f) / Math.max(1e-6, b.f - a.f);
      return blendPose(a.pose, b.pose, EASE[b.ease](t), out);
    }
  }
  if (c.loop) {
    const a = k[k.length - 1];
    const b = k[0];
    const t = (f - a.f) / Math.max(1e-6, c.length - a.f);
    return blendPose(a.pose, b.pose, EASE[b.ease](t), out);
  }
  return blendPose(k[k.length - 1].pose, k[k.length - 1].pose, 0, out);
};

/* ------------------------------------------------------------------------ */
/* Stances                                                                   */
/* ------------------------------------------------------------------------ */

const PHANTOM_STANCE: PoseSpec = {
  bones: {
    hips: [0, -28, 0],
    spine: [5, -4, 0],
    chest: [6, -6, 0],
    neck: [-2, 14, 0],
    head: [-6, 22, 0],
    clavL: [0, 8, 4],
    clavR: [0, 8, -4],
    upperArmL: [-62, 20, 22],
    foreArmL: [-92, 0, 0],
    handL: [-10, 0, 10],
    upperArmR: [-28, -10, -26],
    foreArmR: [-128, 0, 0],
    handR: [-10, 0, -8],
  },
  hips: [0, -0.09, 0],
  footL: [0.12, 0, 0.2],
  footR: [-0.15, 0, -0.24],
  footYawL: -14,
  footYawR: -48,
};

const IRONFANG_STANCE: PoseSpec = {
  bones: {
    hips: [0, -20, 0],
    spine: [4, -4, 0],
    chest: [4, -6, 0],
    neck: [0, 10, 0],
    head: [-4, 18, 0],
    clavL: [0, 6, 2],
    clavR: [0, 6, -2],
    upperArmL: [-48, 18, 24],
    foreArmL: [-96, 0, 0],
    handL: [-8, 0, 10],
    upperArmR: [-26, -8, -28],
    foreArmR: [-118, 0, 0],
    handR: [-8, 0, -8],
  },
  hips: [0, -0.08, 0],
  footL: [0.16, 0, 0.2],
  footR: [-0.17, 0, -0.22],
  footYawL: -10,
  footYawR: -40,
};

/** Arms-up blocking guard (shared shape, applied on top of a stance). */
const GUARD: PoseSpec = {
  bones: {
    spine: [10, -2, 0],
    chest: [8, -2, 0],
    head: [8, 10, 0],
    upperArmL: [-58, 30, 6],
    foreArmL: [-132, 0, 0],
    handL: [-20, 0, 0],
    upperArmR: [-54, -30, -6],
    foreArmR: [-134, 0, 0],
    handR: [-20, 0, 0],
  },
  hips: [0, -0.13, -0.02],
};

/* ------------------------------------------------------------------------ */
/* Clip library                                                              */
/* ------------------------------------------------------------------------ */

/** Build a strike clip keyed to frame data: wind-up, impact (held through active), recovery. */
const strike = (base: PoseSpec, m: MoveDef, wind: PoseSpec, hit: PoseSpec, follow: PoseSpec = {}): Clip => {
  const s = m.startup;
  const a = m.active;
  const total = s + a + m.recovery;
  return clip(base, total, [
    [0, {}],
    [Math.max(1, Math.round(s * 0.55)), wind, 'out'],
    [s, hit, 'in'],
    [s + a, mergeSpec(hit, follow)],
    [s + a + Math.round(m.recovery * 0.45), mergeSpec(wind, follow), 'inOut'],
    [total, {}, 'inOut'],
  ]);
};

function sharedClips(id: CharacterId, base: PoseSpec): Record<string, Clip> {
  const heavy = id === 'ironfang';
  const g = mergeSpec(base, GUARD);
  return {
    idle: clip(
      base,
      heavy ? 96 : 72,
      [
        [0, {}],
        [heavy ? 48 : 36, { hips: [0, heavy ? -0.095 : -0.11, 0.0], bones: { chest: [heavy ? 6 : 9, -6, 0], head: [-4, 22, 0] } }],
      ],
      true,
    ),
    block: clip(g, 1, [[0, {}]]),
    blockstun: clip(g, 12, [
      [0, { hips: [0, -0.15, -0.06], bones: { spine: [2, -2, 0], chest: [-4, 0, 0], head: [-6, 10, 0] } }],
      [12, {}],
    ]),
    dash: clip(base, 16, [
      [0, {}],
      [5, { hips: [0, -0.14, 0.05], bones: { spine: [16, -4, 0], chest: [10, -6, 0] }, footR: [-0.12, 0.12, -0.1], footPitchR: 30 }, 'out'],
      [11, { hips: [0, -0.12, 0.03], bones: { spine: [12, -4, 0] } }],
      [16, {}],
    ]),
    backdash: clip(base, 18, [
      [0, {}],
      [5, { hips: [0, -0.12, -0.06], bones: { spine: [-6, -4, 0], chest: [-4, -6, 0] }, footL: [0.12, 0.12, 0.08], footPitchL: 20 }, 'out'],
      [12, { hips: [0, -0.12, -0.03] }],
      [18, {}],
    ]),
    sidestepL: clip(base, 20, [
      [0, {}],
      [6, { hips: [0.06, -0.17, 0], bones: { spine: [10, -4, -12], chest: [6, -6, -6] }, footR: [-0.05, 0.12, -0.1] }, 'out'],
      [14, { hips: [0.02, -0.12, 0] }],
      [20, {}],
    ]),
    sidestepR: clip(base, 20, [
      [0, {}],
      [6, { hips: [-0.06, -0.17, 0], bones: { spine: [10, -4, 12], chest: [6, -6, 6] }, footL: [0.05, 0.12, 0.1] }, 'out'],
      [14, { hips: [-0.02, -0.12, 0] }],
      [20, {}],
    ]),
    hitHigh: clip(base, 18, [
      [0, {}],
      [3, { hips: [0, -0.1, -0.06], bones: { spine: [-8, 8, 0], chest: [-12, 10, 0], neck: [-14, 10, 0], head: [-20, 18, 0], upperArmL: [-30, 20, 40], upperArmR: [-20, -10, -40] } }, 'out'],
      [10, { hips: [0, -0.11, -0.04], bones: { spine: [-2, 4, 0], chest: [-4, 2, 0], head: [-8, 20, 0] } }],
      [18, {}],
    ]),
    hitBody: clip(base, 18, [
      [0, {}],
      [3, { hips: [0, -0.16, -0.08], bones: { spine: [22, 0, 0], chest: [18, -4, 0], head: [10, 14, 0], upperArmL: [-20, 30, 10], upperArmR: [-14, -30, -10], foreArmL: [-110, 0, 0], foreArmR: [-110, 0, 0] } }, 'out'],
      [11, { hips: [0, -0.13, -0.03], bones: { spine: [12, 0, 0] } }],
      [18, {}],
    ]),
    hitBack: clip(base, 18, [
      [0, {}],
      [3, { hips: [0, -0.12, 0.08], bones: { spine: [-16, 0, 0], chest: [-14, 0, 0], head: [-24, 0, 0], upperArmL: [-10, 0, 50], upperArmR: [-10, 0, -50] } }, 'out'],
      [18, {}],
    ]),
    stagger: clip(base, 42, [
      [0, {}],
      [5, { hips: [0.04, -0.18, -0.1], bones: { hips: [6, -20, 8], spine: [-14, 12, 8], chest: [-12, 10, 6], head: [-18, 30, 10], upperArmL: [-10, 0, 55], foreArmL: [-40, 0, 0], upperArmR: [-10, 0, -40], foreArmR: [-50, 0, 0] }, footL: [0.16, 0.0, 0.05] }, 'out'],
      [16, { hips: [-0.02, -0.24, -0.04], bones: { hips: [10, -30, -6], spine: [24, -6, -8], chest: [16, 0, -4], head: [20, 10, 0], upperArmL: [-30, 10, 30], upperArmR: [-30, -10, -30], foreArmL: [-60, 0, 0], foreArmR: [-60, 0, 0] } }],
      [30, { hips: [0, -0.2, -0.02], bones: { spine: [16, -4, 0], chest: [10, -4, 0], head: [6, 16, 0] } }],
      [42, {}],
    ]),
    guardbreak: clip(base, 46, [
      [0, {}],
      [5, { hips: [0, -0.1, -0.1], bones: { spine: [-16, 0, 0], chest: [-14, 0, 0], head: [-16, 16, 0], upperArmL: [-60, 0, 80], foreArmL: [-30, 0, 0], upperArmR: [-60, 0, -80], foreArmR: [-30, 0, 0] } }, 'out'],
      [26, { hips: [0, -0.2, -0.05], bones: { spine: [20, 0, 0], chest: [10, 0, 0], head: [16, 10, 0], upperArmL: [-10, 0, 20], upperArmR: [-10, 0, -20], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0] } }],
      [46, {}],
    ]),
    // Airborne knockback: body arcs back, limbs trail.
    launch: clip(base, 40, [
      [0, { hips: [0, -0.05, -0.05], bones: { hips: [-30, 0, 0], spine: [-20, 0, 0], chest: [-20, 0, 0], head: [-20, 0, 0], upperArmL: [-40, 0, 70], upperArmR: [-40, 0, -70], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0], thighL: [-40, 0, 6], shinL: [60, 0, 0], thighR: [-10, 0, -6], shinR: [30, 0, 0] }, ikL: 0, ikR: 0 }],
      [16, { hips: [0, -0.3, -0.1], bones: { hips: [-75, 0, 0], spine: [-10, 0, 0], chest: [-10, 0, 0], head: [10, 0, 0], upperArmL: [-130, 0, 60], upperArmR: [-120, 0, -60], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], thighL: [-70, 0, 8], shinL: [50, 0, 0], thighR: [-40, 0, -8], shinR: [70, 0, 0] }, ikL: 0, ikR: 0 }, 'inOut'],
      [40, { hips: [0, -0.62, -0.2], bones: { hips: [-90, 0, 0], spine: [4, 0, 0], chest: [4, 0, 0], head: [16, 0, 0], upperArmL: [-150, 0, 50], upperArmR: [-150, 0, -50], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0], thighL: [-30, 0, 8], shinL: [30, 0, 0], thighR: [-10, 0, -6], shinR: [20, 0, 0] }, ikL: 0, ikR: 0 }],
    ]),
    down: clip(base, 38, [
      [0, LYING],
      [38, mergeSpec(LYING, { bones: { head: [6, 20, 0] } })],
    ]),
    ko: clip(base, 60, [
      [0, LYING],
      [30, mergeSpec(LYING, { bones: { head: [0, 40, 0], upperArmR: [-170, 0, -70] } })],
      [60, mergeSpec(LYING, { bones: { head: [0, 45, 0], upperArmR: [-175, 0, -75] } })],
    ]),
    getup: clip(base, 30, [
      [0, LYING],
      [9, { hips: [0, -0.62, -0.1], bones: { hips: [-60, 0, 0], spine: [40, 0, 0], chest: [20, 0, 0], head: [10, 0, 0], upperArmL: [30, 0, 30], upperArmR: [30, 0, -30], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], thighL: [-110, 0, 10], shinL: [140, 0, 0], thighR: [-60, 0, -10], shinR: [100, 0, 0] }, ikL: 0, ikR: 0 }, 'out'],
      [18, { hips: [0, -0.42, 0], bones: { hips: [10, -20, 0], spine: [30, 0, 0], chest: [10, 0, 0], head: [-10, 20, 0], upperArmL: [-40, 10, 30], upperArmR: [-30, -10, -30], foreArmL: [-60, 0, 0], foreArmR: [-60, 0, 0] }, footL: [0.12, 0, 0.18], footR: [-0.14, 0, -0.3] }, 'inOut'],
      [30, {}],
    ]),
    defeat: clip(base, 80, [
      [0, {}],
      [30, { hips: [0, -0.48, 0], bones: { hips: [6, -10, 0], spine: [28, 0, 0], chest: [16, 0, 0], neck: [10, 0, 0], head: [24, 6, 0], upperArmL: [-14, 0, 12], foreArmL: [-30, 0, 0], upperArmR: [-20, 0, -12], foreArmR: [-60, 0, 0] }, footL: [0.14, 0, 0.3], footR: [-0.14, 0.04, -0.3], footPitchR: 50 }],
      [80, { hips: [0, -0.5, 0], bones: { hips: [6, -10, 0], spine: [32, 0, 0], chest: [18, 0, 0], neck: [12, 0, 0], head: [28, 6, 0], upperArmL: [-14, 0, 12], foreArmL: [-30, 0, 0], upperArmR: [-20, 0, -12], foreArmR: [-60, 0, 0] }, footL: [0.14, 0, 0.3], footR: [-0.14, 0.04, -0.3], footPitchR: 50 }],
    ]),
  };
}

/** Lying on the back (hips rotated to horizontal, legs FK). */
const LYING: PoseSpec = {
  hips: [0, -0.84, -0.25],
  bones: {
    hips: [-90, 0, 0],
    spine: [2, 0, 0],
    chest: [2, 0, 0],
    neck: [6, 0, 0],
    head: [10, 30, 0],
    upperArmL: [-150, 0, 40],
    foreArmL: [-30, 0, 0],
    upperArmR: [-160, 0, -55],
    foreArmR: [-20, 0, 0],
    thighL: [-8, 0, 8],
    shinL: [20, 0, 0],
    thighR: [-30, 0, -6],
    shinR: [50, 0, 0],
    footL: [40, 0, 0],
    footR: [30, 0, 0],
  },
  ikL: 0,
  ikR: 0,
};

function phantomClips(): Record<string, Clip> {
  const b = PHANTOM_STANCE;
  const M = PHANTOM.moves;
  return {
    ...sharedClips('phantom', b),
    // Lead-hand jab.
    p_jab: strike(
      b,
      M.p_jab,
      { bones: { hips: [0, -34, 0], chest: [8, -12, 0], upperArmL: [-70, 10, 14], foreArmL: [-80, 0, 0] } },
      { hips: [0, -0.1, 0.04], bones: { hips: [0, -38, 0], spine: [6, -8, 0], chest: [6, -16, 0], neck: [-2, 20, 0], head: [-4, 30, 0], clavL: [0, -10, 4], upperArmL: [-88, 4, 6], foreArmL: [-4, 0, 0], handL: [0, 0, 4] } },
    ),
    // Rear-hand cross with hip rotation.
    p_cross: strike(
      b,
      M.p_cross,
      { bones: { hips: [0, -32, 0], chest: [8, -10, 0] } },
      { hips: [0, -0.1, 0.06], bones: { hips: [0, 6, 0], spine: [8, 8, 0], chest: [6, 16, 0], neck: [-2, -10, 0], head: [-4, -8, 0], clavR: [0, -14, -4], upperArmR: [-88, -4, -6], foreArmR: [-4, 0, 0], upperArmL: [-40, 30, 20], foreArmL: [-120, 0, 0] }, footYawR: -20 },
    ),
    // Step-in palm strike (rear hand, open palm).
    p_palm: strike(
      b,
      M.p_palm,
      { hips: [0, -0.12, -0.05], bones: { hips: [0, -40, 0], spine: [4, -10, 0], chest: [4, -16, 0], upperArmR: [-20, -20, -40], foreArmR: [-140, 0, 0], handR: [-60, 0, 0] } },
      { hips: [0, -0.17, 0.1], bones: { hips: [0, 10, 0], spine: [12, 10, 0], chest: [6, 16, 0], neck: [0, -12, 0], head: [-6, -10, 0], clavR: [0, -16, -2], upperArmR: [-80, -6, -4], foreArmR: [-6, 0, 0], handR: [-70, 0, 0], upperArmL: [-30, 20, 30], foreArmL: [-110, 0, 0] }, footL: [0.12, 0, 0.32], footR: [-0.13, 0, -0.16], footYawR: -16 },
    ),
    // Rear-leg front snap kick to the body.
    p_snap: strike(
      b,
      M.p_snap,
      { hips: [0, -0.08, 0], bones: { hips: [0, -14, 0], spine: [-4, -4, 0], thighR: [-80, 0, 0], shinR: [110, 0, 0], footR: [30, 0, 0] }, ikR: 0 },
      { hips: [0, -0.07, -0.03], bones: { hips: [-8, -6, 0], spine: [-12, -4, 0], chest: [-4, -6, 0], head: [6, 18, 0], thighR: [-88, 0, 0], shinR: [6, 0, 0], footR: [40, 0, 0], upperArmR: [-20, -10, -30], foreArmR: [-120, 0, 0] }, ikR: 0 },
    ),
    // High crescent roundhouse (right leg) with pivot on the lead foot.
    p_round: strike(
      b,
      M.p_round,
      { hips: [0, -0.06, 0], bones: { hips: [0, 40, 0], spine: [0, -20, 4], chest: [0, -16, 0], head: [0, -26, 0], thighR: [-60, 0, -40], shinR: [100, 0, 0] }, ikR: 0, footYawL: 60 },
      { hips: [0.04, -0.04, -0.02], bones: { hips: [0, 72, -16], spine: [-10, -26, 18], chest: [-6, -20, 10], neck: [0, -16, 0], head: [-6, -30, -10], thighR: [-20, 0, -102], shinR: [8, 0, 0], footR: [40, 0, 0], upperArmL: [-40, 20, 50], foreArmL: [-100, 0, 0], upperArmR: [-10, 0, -40], foreArmR: [-60, 0, 0] }, ikR: 0, footYawL: 90 },
      { bones: { hips: [0, 95, -10], thighR: [-30, 0, -80], shinR: [60, 0, 0] } },
    ),
    // Phantom Rush: vanishing dash + 4-hit flurry ending in a rising spin kick.
    p_special: clip(b, 64, [
      [0, {}],
      [6, mergeSpec(GUARD, { hips: [0, -0.26, -0.04], bones: { spine: [26, -8, 0], chest: [16, -8, 0] } }), 'out'],
      [10, { hips: [0, -0.12, 0.05], bones: { hips: [0, -38, 0], chest: [6, -16, 0], upperArmL: [-90, 4, 6], foreArmL: [-4, 0, 0] } }, 'out'],
      [13, {}],
      [17, { hips: [0, -0.12, 0.06], bones: { hips: [0, 8, 0], spine: [8, 8, 0], chest: [6, 16, 0], upperArmR: [-90, -4, -6], foreArmR: [-4, 0, 0] } }, 'out'],
      [20, {}],
      [24, { hips: [0, -0.06, 0], bones: { hips: [-6, -10, 0], spine: [-10, -4, 0], thighR: [-110, 0, 0], shinR: [120, 0, 0], footR: [20, 0, 0] }, ikR: 0 }, 'out'],
      [29, { hips: [0, -0.18, 0], bones: { spine: [20, -10, 0] } }],
      [34, { hips: [0, 0.1, 0], bones: { hips: [0, 90, -20], spine: [-14, -30, 20], chest: [-8, -20, 10], head: [-10, -30, -10], thighR: [-40, 0, -110], shinR: [4, 0, 0], footR: [40, 0, 0], upperArmL: [-60, 20, 60], upperArmR: [-10, 0, -60], thighL: [-20, 0, 0], shinL: [30, 0, 0] }, ikR: 0, ikL: 0.6, footYawL: 90 }, 'out'],
      [42, { hips: [0, 0, 0], bones: { hips: [0, 150, -6], thighR: [-30, 0, -60], shinR: [70, 0, 0] }, ikR: 0, footYawL: 120 }],
      [52, { hips: [0, -0.2, 0], bones: { hips: [0, -20, 0], spine: [14, -6, 0] } }],
      [64, {}],
    ]),
    victory: clip(b, 140, [
      [0, {}],
      [24, { hips: [0, -0.02, 0], bones: { hips: [0, 0, 0], spine: [0, 0, 0], chest: [-2, 0, 0], neck: [0, 0, 0], head: [-6, 0, 0], upperArmL: [-60, 50, 30], foreArmL: [-100, 0, 0], handL: [0, 0, 0], upperArmR: [-62, -50, -30], foreArmR: [-90, 0, 0], handR: [-10, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02], footYawL: 6, footYawR: -6 }],
      [60, { hips: [0, -0.05, 0], bones: { spine: [20, 0, 0], chest: [10, 0, 0], head: [20, 0, 0], upperArmL: [-60, 50, 30], foreArmL: [-100, 0, 0], upperArmR: [-62, -50, -30], foreArmR: [-90, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02], footYawL: 6, footYawR: -6 }],
      [90, { hips: [0, -0.01, 0], bones: { spine: [-2, 0, 0], chest: [-4, 0, 0], head: [-10, 10, 0], upperArmL: [-10, 0, 10], foreArmL: [-20, 0, 0], upperArmR: [-150, -10, -20], foreArmR: [-20, 0, 0], handR: [0, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02], footYawL: 6, footYawR: -6 }],
      [140, { hips: [0, -0.01, 0], bones: { spine: [-2, 0, 0], chest: [-4, 0, 0], head: [-12, 14, 0], upperArmL: [-10, 0, 10], foreArmL: [-20, 0, 0], upperArmR: [-155, -10, -20], foreArmR: [-15, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02], footYawL: 6, footYawR: -6 }],
    ]),
    intro: clip(b, 240, [
      [0, { hips: [0, -0.5, 0], bones: { hips: [0, 0, 0], spine: [30, 0, 0], chest: [10, 0, 0], head: [30, 0, 0], upperArmL: [-20, 0, 20], foreArmL: [-40, 0, 0], upperArmR: [-70, 0, -10], foreArmR: [-20, 0, 0] }, footL: [0.13, 0, 0.3], footR: [-0.13, 0.03, -0.35], footPitchR: 50 }],
      [70, { hips: [0, -0.5, 0], bones: { hips: [0, 0, 0], spine: [26, 0, 0], chest: [8, 0, 0], head: [10, 0, 0], upperArmL: [-20, 0, 20], foreArmL: [-40, 0, 0], upperArmR: [-70, 0, -10], foreArmR: [-20, 0, 0] }, footL: [0.13, 0, 0.3], footR: [-0.13, 0.03, -0.35], footPitchR: 50 }],
      [110, { hips: [0, -0.02, 0], bones: { hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], upperArmL: [-60, 50, 30], foreArmL: [-100, 0, 0], upperArmR: [-62, -50, -30], foreArmR: [-90, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02] }],
      [150, { hips: [0, -0.04, 0], bones: { spine: [24, 0, 0], chest: [8, 0, 0], head: [16, 0, 0], upperArmL: [-60, 50, 30], foreArmL: [-100, 0, 0], upperArmR: [-62, -50, -30], foreArmR: [-90, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02] }],
      [185, { hips: [0, -0.02, 0], bones: { hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [-4, 0, 0], upperArmL: [-60, 50, 30], foreArmL: [-100, 0, 0], upperArmR: [-62, -50, -30], foreArmR: [-90, 0, 0] }, footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02] }],
      [215, {}],
      [240, {}],
    ]),
  };
}

function ironFangClips(): Record<string, Clip> {
  const b = IRONFANG_STANCE;
  const M = IRON_FANG.moves;
  return {
    ...sharedClips('ironfang', b),
    f_jab: strike(
      b,
      M.f_jab,
      { bones: { hips: [0, -26, 0], chest: [6, -10, 0], upperArmL: [-60, 10, 16], foreArmL: [-90, 0, 0] } },
      { hips: [0, -0.09, 0.04], bones: { hips: [0, -30, 0], spine: [6, -8, 0], chest: [6, -14, 0], neck: [0, 16, 0], head: [-4, 26, 0], clavL: [0, -10, 2], upperArmL: [-86, 4, 6], foreArmL: [-6, 0, 0] } },
    ),
    // Body hook: rear hand, elbow bent, hips whip around.
    f_hook: strike(
      b,
      M.f_hook,
      { hips: [0, -0.12, 0], bones: { hips: [0, -32, 0], spine: [10, -16, 4], chest: [6, -14, 0], upperArmR: [-30, -20, -60], foreArmR: [-90, 0, 0] } },
      { hips: [0, -0.15, 0.05], bones: { hips: [0, 10, 0], spine: [14, 14, -6], chest: [8, 20, 0], neck: [0, -14, 0], head: [-6, -10, 0], upperArmR: [-62, -40, -66], foreArmR: [-96, 0, 0], handR: [0, 0, 0], upperArmL: [-40, 30, 24], foreArmL: [-120, 0, 0] }, footYawR: -20 },
    ),
    // Big looping haymaker with super armour.
    f_haymaker: strike(
      b,
      M.f_haymaker,
      { hips: [0, -0.1, -0.06], bones: { hips: [0, -46, 0], spine: [0, -20, -6], chest: [-4, -24, 0], head: [0, 40, 0], upperArmR: [-30, -40, -90], foreArmR: [-80, 0, 0], upperArmL: [-60, 20, 20], foreArmL: [-110, 0, 0] } },
      { hips: [0, -0.15, 0.12], bones: { hips: [0, 16, 0], spine: [16, 18, -4], chest: [10, 24, 0], neck: [0, -16, 0], head: [-6, -18, 0], upperArmR: [-86, -16, -30], foreArmR: [-20, 0, 0], upperArmL: [-20, 30, 30], foreArmL: [-100, 0, 0] }, footL: [0.15, 0, 0.32], footR: [-0.16, 0, -0.18], footYawR: -10 },
      { bones: { hips: [0, 30, 0], chest: [10, 34, 0], upperArmR: [-70, 10, -20], foreArmR: [-40, 0, 0] } },
    ),
    // Heavy push kick (Breaker Kick).
    f_push: strike(
      b,
      M.f_push,
      { hips: [0, -0.08, -0.02], bones: { hips: [0, -10, 0], spine: [-6, -4, 0], thighR: [-95, 0, 0], shinR: [120, 0, 0], footR: [-10, 0, 0] }, ikR: 0 },
      { hips: [0, -0.07, -0.06], bones: { hips: [-10, -4, 0], spine: [-16, -4, 0], chest: [-6, -6, 0], head: [10, 18, 0], thighR: [-86, 0, 0], shinR: [4, 0, 0], footR: [-20, 0, 0] }, ikR: 0 },
    ),
    // Axe kick: leg raised high and slammed down.
    f_axe: strike(
      b,
      M.f_axe,
      { hips: [0, -0.04, -0.04], bones: { hips: [-10, -10, 0], spine: [-18, -6, 0], chest: [-8, -6, 0], head: [10, 18, 0], thighR: [-150, 0, -10], shinR: [10, 0, 0], footR: [20, 0, 0], upperArmL: [-40, 30, 40], upperArmR: [-40, -30, -40] }, ikR: 0 },
      { hips: [0, -0.16, 0.06], bones: { hips: [6, -10, 0], spine: [18, -6, 0], chest: [10, -6, 0], head: [-10, 18, 0], thighR: [-60, 0, 0], shinR: [10, 0, 0], footR: [20, 0, 0] }, ikR: 0 },
      { hips: [0, -0.2, 0.08], bones: { thighR: [-20, 0, 0], shinR: [30, 0, 0] }, ikR: 0.4, footR: [-0.12, 0, 0.3] },
    ),
    // Fang Breaker: crouch, leap, double-fist ground slam.
    f_special: clip(b, 62, [
      [0, {}],
      [10, { hips: [0, -0.32, -0.04], bones: { hips: [0, 0, 0], spine: [30, 0, 0], chest: [14, 0, 0], head: [-20, 0, 0], upperArmL: [30, 0, 30], foreArmL: [-30, 0, 0], upperArmR: [30, 0, -30], foreArmR: [-30, 0, 0] }, footL: [0.16, 0, 0.1], footR: [-0.16, 0, -0.1], footYawL: 0, footYawR: 0 }, 'out'],
      [20, { hips: [0, 0.75, 0.2], bones: { hips: [-10, 0, 0], spine: [-14, 0, 0], chest: [-10, 0, 0], head: [-14, 0, 0], upperArmL: [-170, 0, 10], foreArmL: [-40, 0, 0], upperArmR: [-170, 0, -10], foreArmR: [-40, 0, 0], thighL: [-60, 0, 10], shinL: [90, 0, 0], thighR: [-30, 0, -10], shinR: [100, 0, 0] }, ikL: 0, ikR: 0 }, 'out'],
      [24, { hips: [0, 0.8, 0.35], bones: { hips: [-10, 0, 0], spine: [-20, 0, 0], chest: [-12, 0, 0], head: [-10, 0, 0], upperArmL: [-185, 0, 4], foreArmL: [-10, 0, 0], upperArmR: [-185, 0, -4], foreArmR: [-10, 0, 0], thighL: [-70, 0, 10], shinL: [80, 0, 0], thighR: [-40, 0, -10], shinR: [90, 0, 0] }, ikL: 0, ikR: 0 }, 'linear'],
      [26, { hips: [0, -0.42, 0.5], bones: { hips: [10, 0, 0], spine: [50, 0, 0], chest: [20, 0, 0], head: [-30, 0, 0], upperArmL: [-60, 0, 6], foreArmL: [-10, 0, 0], upperArmR: [-60, 0, -6], foreArmR: [-10, 0, 0] }, footL: [0.2, 0, 0.6], footR: [-0.18, 0.02, 0.05], footPitchR: 40 }, 'in'],
      [44, { hips: [0, -0.42, 0.5], bones: { hips: [10, 0, 0], spine: [46, 0, 0], chest: [18, 0, 0], head: [-28, 0, 0], upperArmL: [-58, 0, 6], foreArmL: [-12, 0, 0], upperArmR: [-58, 0, -6], foreArmR: [-12, 0, 0] }, footL: [0.2, 0, 0.6], footR: [-0.18, 0.02, 0.05], footPitchR: 40 }],
      [62, {}],
    ]),
    victory: clip(b, 140, [
      [0, {}],
      [20, { hips: [0, -0.14, 0], bones: { hips: [0, 0, 0], spine: [16, 0, 0], chest: [10, 0, 0], head: [10, 0, 0], upperArmL: [-40, 40, 40], foreArmL: [-120, 0, 0], upperArmR: [-40, -40, -40], foreArmR: [-120, 0, 0] }, footL: [0.2, 0, 0.05], footR: [-0.2, 0, -0.05], footYawL: 15, footYawR: -15 }],
      [40, { hips: [0, -0.02, 0], bones: { hips: [0, 0, 0], spine: [-8, 0, 0], chest: [-12, 0, 0], neck: [-10, 0, 0], head: [-20, 0, 0], upperArmL: [-10, -20, 120], foreArmL: [-100, 0, 0], upperArmR: [-10, 20, -120], foreArmR: [-100, 0, 0] }, footL: [0.2, 0, 0.05], footR: [-0.2, 0, -0.05], footYawL: 15, footYawR: -15 }, 'out'],
      [100, { hips: [0, -0.03, 0], bones: { hips: [0, 0, 0], spine: [-10, 0, 0], chest: [-14, 0, 0], neck: [-12, 0, 0], head: [-24, 0, 0], upperArmL: [-10, -20, 125], foreArmL: [-105, 0, 0], upperArmR: [-10, 20, -125], foreArmR: [-105, 0, 0] }, footL: [0.2, 0, 0.05], footR: [-0.2, 0, -0.05], footYawL: 15, footYawR: -15 }],
      [140, { hips: [0, -0.06, 0], bones: { hips: [0, 0, 0], spine: [6, 0, 0], chest: [2, 0, 0], head: [-4, 0, 0], upperArmL: [-20, 0, 20], foreArmL: [-90, 0, 0], upperArmR: [-20, 0, -20], foreArmR: [-90, 0, 0] }, footL: [0.2, 0, 0.05], footR: [-0.2, 0, -0.05], footYawL: 15, footYawR: -15 }],
    ]),
    intro: clip(b, 240, [
      [0, { hips: [0, -0.03, 0], bones: { hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [10, 0, 0], upperArmL: [-6, 0, 14], foreArmL: [-10, 0, 0], upperArmR: [-6, 0, -14], foreArmR: [-10, 0, 0] }, footL: [0.17, 0, 0.0], footR: [-0.17, 0, 0.0], footYawL: 12, footYawR: -12 }],
      [60, { hips: [0, -0.03, 0], bones: { hips: [0, 0, 0], spine: [0, 0, 0], chest: [-2, 0, 0], head: [-4, 0, 0], upperArmL: [-6, 0, 14], foreArmL: [-10, 0, 0], upperArmR: [-6, 0, -14], foreArmR: [-10, 0, 0] }, footL: [0.17, 0, 0.0], footR: [-0.17, 0, 0.0], footYawL: 12, footYawR: -12 }],
      [90, { hips: [0, -0.1, 0], bones: { hips: [0, 0, 0], spine: [10, 0, 0], chest: [6, 0, 0], head: [-4, 0, 0], upperArmL: [-80, 60, 10], foreArmL: [-100, 0, 0], upperArmR: [-80, -60, -10], foreArmR: [-100, 0, 0] }, footL: [0.2, 0, 0.0], footR: [-0.2, 0, 0.0], footYawL: 12, footYawR: -12 }, 'in'],
      [100, { hips: [0, -0.16, 0], bones: { hips: [0, 0, 0], spine: [16, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0], upperArmL: [-80, 78, 0], foreArmL: [-104, 0, 0], upperArmR: [-80, -78, 0], foreArmR: [-104, 0, 0] }, footL: [0.2, 0, 0.0], footR: [-0.2, 0, 0.0], footYawL: 12, footYawR: -12 }, 'out'],
      [140, { hips: [0, -0.16, 0], bones: { hips: [0, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], head: [-10, 0, 0], upperArmL: [-80, 78, 0], foreArmL: [-104, 0, 0], upperArmR: [-80, -78, 0], foreArmR: [-104, 0, 0] }, footL: [0.2, 0, 0.0], footR: [-0.2, 0, 0.0], footYawL: 12, footYawR: -12 }],
      [175, { hips: [0, -0.04, 0], bones: { hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-10, 0, 0], head: [-16, 0, 0], upperArmL: [-10, -20, 110], foreArmL: [-100, 0, 0], upperArmR: [-10, 20, -110], foreArmR: [-100, 0, 0] }, footL: [0.2, 0, 0.0], footR: [-0.2, 0, 0.0], footYawL: 12, footYawR: -12 }, 'out'],
      [210, {}],
      [240, {}],
    ]),
  };
}

const LIBS: Partial<Record<CharacterId, Record<string, Clip>>> = {};

export function getClips(id: CharacterId): Record<string, Clip> {
  if (!LIBS[id]) LIBS[id] = id === 'phantom' ? phantomClips() : ironFangClips();
  return LIBS[id]!;
}

export const STANCES: Record<CharacterId, PoseSpec> = { phantom: PHANTOM_STANCE, ironfang: IRONFANG_STANCE };

export const scratchPose = createPose;

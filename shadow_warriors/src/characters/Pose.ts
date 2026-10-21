import * as THREE from 'three';
import { DEG } from '../core/math';
import { BONE_NAMES, type BoneName, type Skeleton } from './Rig';

/**
 * A full-body pose: local bone rotations, hips offset, and leg IK targets.
 * Legs are usually driven by IK (feet planted on the ground, no sliding);
 * kicks fade IK out for the kicking leg and use the authored FK angles.
 */
export interface Pose {
  q: Record<BoneName, THREE.Quaternion>;
  hips: THREE.Vector3;
  footL: THREE.Vector3;
  footR: THREE.Vector3;
  /** Foot yaw/pitch (radians) in character space when IK-driven. */
  footYawL: number;
  footYawR: number;
  footPitchL: number;
  footPitchR: number;
  ikL: number;
  ikR: number;
}

export type Euler3 = [number, number, number];

/** Authoring format: degrees, sparse. */
export interface PoseSpec {
  bones?: Partial<Record<BoneName, Euler3>>;
  hips?: Euler3; // position offset from bind
  footL?: Euler3;
  footR?: Euler3;
  footYawL?: number;
  footYawR?: number;
  footPitchL?: number;
  footPitchR?: number;
  ikL?: number;
  ikR?: number;
}

export const createPose = (): Pose => {
  const q = {} as Record<BoneName, THREE.Quaternion>;
  for (const b of BONE_NAMES) q[b] = new THREE.Quaternion();
  return {
    q,
    hips: new THREE.Vector3(),
    footL: new THREE.Vector3(),
    footR: new THREE.Vector3(),
    footYawL: 0,
    footYawR: 0,
    footPitchL: 0,
    footPitchR: 0,
    ikL: 1,
    ikR: 1,
  };
};

const tmpE = new THREE.Euler();

export const eulerQuat = (e: Euler3, out = new THREE.Quaternion()): THREE.Quaternion =>
  out.setFromEuler(tmpE.set(e[0] * DEG, e[1] * DEG, e[2] * DEG, 'XYZ'));

/** Resolve a spec on top of a base spec into a concrete pose. */
export const buildPose = (base: PoseSpec, over: PoseSpec = {}): Pose => {
  const p = createPose();
  const bones = { ...(base.bones ?? {}), ...(over.bones ?? {}) };
  for (const b of BONE_NAMES) {
    const e = bones[b];
    if (e) eulerQuat(e, p.q[b]);
  }
  p.hips.set(...(over.hips ?? base.hips ?? [0, 0, 0]));
  p.footL.set(...(over.footL ?? base.footL ?? [0.1, 0, 0]));
  p.footR.set(...(over.footR ?? base.footR ?? [-0.1, 0, 0]));
  p.footYawL = (over.footYawL ?? base.footYawL ?? 0) * DEG;
  p.footYawR = (over.footYawR ?? base.footYawR ?? 0) * DEG;
  p.footPitchL = (over.footPitchL ?? base.footPitchL ?? 0) * DEG;
  p.footPitchR = (over.footPitchR ?? base.footPitchR ?? 0) * DEG;
  p.ikL = over.ikL ?? base.ikL ?? 1;
  p.ikR = over.ikR ?? base.ikR ?? 1;
  return p;
};

/** Merge specs (later wins, bones merged per key). */
export const mergeSpec = (...specs: PoseSpec[]): PoseSpec => {
  const out: PoseSpec = { bones: {} };
  for (const s of specs) {
    const { bones, ...rest } = s;
    Object.assign(out, rest);
    Object.assign(out.bones!, bones ?? {});
  }
  return out;
};

export const copyPose = (src: Pose, dst: Pose): Pose => {
  for (const b of BONE_NAMES) dst.q[b].copy(src.q[b]);
  dst.hips.copy(src.hips);
  dst.footL.copy(src.footL);
  dst.footR.copy(src.footR);
  dst.footYawL = src.footYawL;
  dst.footYawR = src.footYawR;
  dst.footPitchL = src.footPitchL;
  dst.footPitchR = src.footPitchR;
  dst.ikL = src.ikL;
  dst.ikR = src.ikR;
  return dst;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** out = a·(1-t) + b·t (out may alias a). */
export const blendPose = (a: Pose, b: Pose, t: number, out: Pose): Pose => {
  for (const name of BONE_NAMES) out.q[name].copy(a.q[name]).slerp(b.q[name], t);
  out.hips.copy(a.hips).lerp(b.hips, t);
  out.footL.copy(a.footL).lerp(b.footL, t);
  out.footR.copy(a.footR).lerp(b.footR, t);
  out.footYawL = lerp(a.footYawL, b.footYawL, t);
  out.footYawR = lerp(a.footYawR, b.footYawR, t);
  out.footPitchL = lerp(a.footPitchL, b.footPitchL, t);
  out.footPitchR = lerp(a.footPitchR, b.footPitchR, t);
  out.ikL = lerp(a.ikL, b.ikL, t);
  out.ikR = lerp(a.ikR, b.ikR, t);
  return out;
};

/* ------------------------------------------------------------------------ */
/* Applying poses + two-bone leg IK                                         */
/* ------------------------------------------------------------------------ */

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vPole = new THREE.Vector3();
const mBasis = new THREE.Matrix4();
const mInv = new THREE.Matrix4();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qIk = new THREE.Quaternion();
const qKnee = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class PoseApplier {
  private skel: Skeleton;
  constructor(skel: Skeleton) {
    this.skel = skel;
  }

  apply(p: Pose): void {
    const s = this.skel;
    const B = s.bones;
    for (const name of BONE_NAMES) B[name].quaternion.copy(p.q[name]);
    B.hips.position.copy(s.bindLocal.hips).add(p.hips);
    B.hips.updateMatrix();
    if (p.ikL > 0.001) this.solveLeg('L', p.footL, p.footYawL, p.footPitchL, p.ikL);
    if (p.ikR > 0.001) this.solveLeg('R', p.footR, p.footYawR, p.footPitchR, p.ikR);
  }

  /** Analytic two-bone IK in hips space with the knee pointing forward. */
  private solveLeg(side: 'L' | 'R', target: THREE.Vector3, footYaw: number, footPitch: number, weight: number): void {
    const s = this.skel;
    const thigh = s.bones[`thigh${side}`];
    const shin = s.bones[`shin${side}`];
    const foot = s.bones[`foot${side}`];
    const hips = s.bones.hips;
    const a = s.p.thigh;
    const b = s.p.shin;

    // Target into hips-local space.
    mInv.copy(hips.matrix).invert();
    const t = vA.copy(target).applyMatrix4(mInv);
    const hip = s.bindLocal[`thigh${side}`];
    const dvec = vB.copy(t).sub(hip);
    let len = dvec.length();
    len = Math.min(Math.max(len, 0.05), (a + b) * 0.9995);
    const dir = dvec.normalize();
    // Knee pole: forward and slightly outward, expressed in hips space.
    vPole.set(side === 'L' ? 0.12 : -0.12, 0, 1).applyQuaternion(qA.copy(hips.quaternion).invert()).normalize();
    // Make the pole perpendicular to the leg direction.
    const perp = vC.copy(vPole).addScaledVector(dir, -vPole.dot(dir)).normalize();
    const cosA = (a * a + len * len - b * b) / (2 * a * len);
    const angA = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const cosK = (a * a + b * b - len * len) / (2 * a * b);
    const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosK)));
    // Thigh direction rotated from target direction toward the pole.
    const thighDir = vA.copy(dir).multiplyScalar(Math.cos(angA)).addScaledVector(perp, Math.sin(angA)).normalize();
    // Basis: bone -Y along thighDir, +Z toward the knee pole.
    const yAxis = vB.copy(thighDir).negate();
    const zAxis = vPole.copy(perp).addScaledVector(yAxis, -perp.dot(yAxis)).normalize();
    const xAxis = vC.crossVectors(yAxis, zAxis).normalize();
    mBasis.makeBasis(xAxis, yAxis, zAxis);
    qIk.setFromRotationMatrix(mBasis);
    thigh.quaternion.slerp(qIk, weight);
    qKnee.setFromAxisAngle(X_AXIS, knee);
    shin.quaternion.slerp(qKnee, weight);

    // Foot: flat on the ground in character space (+ yaw and toe pitch).
    const world = qA.copy(hips.quaternion).multiply(thigh.quaternion).multiply(shin.quaternion);
    const desired = qB.setFromAxisAngle(Y_AXIS, footYaw).multiply(qIk.setFromAxisAngle(X_AXIS, footPitch));
    const local = world.invert().multiply(desired);
    foot.quaternion.slerp(local, weight);
  }
}

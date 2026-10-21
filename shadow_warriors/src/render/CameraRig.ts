import * as THREE from 'three';
import { clamp, damp } from '../core/math';

export type CameraMode = 'menu' | 'select' | 'intro' | 'fight' | 'ko' | 'victory' | 'manual';

export interface CamSubject {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const MAX_RADIUS = 11.3;

/**
 * Fighting-game camera: keeps both fighters framed from the side, pulls
 * back with distance, stays on a consistent side of the fighters (no flips),
 * never leaves the ruin ring, and layers trauma-based shake plus short
 * cinematic overrides for intros, specials and KOs.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'menu';
  private pos = new THREE.Vector3(0, 3, 10);
  private target = new THREE.Vector3(0, 1, 0);
  private side = new THREE.Vector3(0, 0, 1);
  private trauma = 0;
  private time = 0;
  private cine: { t: number; dur: number; subject: CamSubject; kind: 'special' | 'counter' } | null = null;
  shakeScale = 1;
  readonly manualPos = new THREE.Vector3(0, 1.4, 4);
  readonly manualTarget = new THREE.Vector3(0, 1.1, 0);
  private fov = 34;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 600);
    this.camera.position.copy(this.pos);
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  cinematic(subject: CamSubject, dur: number, kind: 'special' | 'counter' = 'special'): void {
    this.cine = { t: 0, dur, subject, kind };
  }

  /** Jump straight to the computed framing (round start). */
  cut(): void {
    this.snapNext = true;
  }
  private snapNext = false;

  update(dt: number, a: CamSubject, b: CamSubject, focus: number, phaseT: number): void {
    this.time += dt;
    const wantPos = new THREE.Vector3();
    const wantTarget = new THREE.Vector3();
    let lambda = 5;
    let fov = 34;
    const mid = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);

    switch (this.mode) {
      case 'manual':
        wantPos.copy(this.manualPos);
        wantTarget.copy(this.manualTarget);
        lambda = 3;
        fov = 30;
        break;
      case 'menu': {
        const ang = this.time * 0.06;
        wantPos.set(Math.cos(ang) * 7.5, 2.4 + Math.sin(this.time * 0.13) * 0.4, Math.sin(ang) * 7.5);
        wantTarget.set(0, 1.2, 0);
        lambda = 2;
        break;
      }
      case 'select': {
        const s = focus === 0 ? a : b;
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        wantPos.set(s.x + fx * 3.2 + fz * 0.9, 1.45, s.z + fz * 3.2 - fx * 0.9);
        wantTarget.set(s.x + fz * 0.45, 1.05, s.z - fx * 0.45);
        lambda = 3.5;
        fov = 30;
        break;
      }
      case 'intro': {
        // 0..0.45: P1 close-up, 0.45..0.9: P2 close-up, then pull back to fight framing.
        if (phaseT < 0.9) {
          const s = phaseT < 0.45 ? a : b;
          const local = (phaseT % 0.45) / 0.45;
          const fx = Math.sin(s.yaw);
          const fz = Math.cos(s.yaw);
          const d = 2.6 - local * 0.5;
          const sideSign = phaseT < 0.45 ? 1 : -1;
          wantPos.set(s.x + fx * d + fz * 0.8 * sideSign, 1.0 + local * 0.6, s.z + fz * d - fx * 0.8 * sideSign);
          wantTarget.set(s.x, 1.25, s.z);
          lambda = local < 0.05 ? 50 : 3;
          fov = 30;
          break;
        }
        this.fightFraming(a, b, mid, wantPos, wantTarget);
        lambda = 2.5;
        break;
      }
      case 'fight':
        fov = this.fightFraming(a, b, mid, wantPos, wantTarget);
        lambda = 6;
        break;
      case 'ko': {
        const ang = Math.atan2(this.side.z, this.side.x) + phaseT * 0.9;
        const d = 4.2;
        wantPos.set(mid.x + Math.cos(ang) * d, 1.3, mid.z + Math.sin(ang) * d);
        wantTarget.set(mid.x, 0.8, mid.z);
        lambda = 2.5;
        break;
      }
      case 'victory': {
        const s = focus === 0 ? a : b;
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const orbit = Math.sin(this.time * 0.25) * 0.5;
        wantPos.set(s.x + fx * 3.0 + fz * orbit, 1.5, s.z + fz * 3.0 - fx * orbit);
        wantTarget.set(s.x, 1.15, s.z);
        lambda = 2;
        fov = 32;
        break;
      }
    }

    // Cinematic override (specials): sweep around the attacker, then hand back.
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = c.t / c.dur;
      if (k >= 1) this.cine = null;
      else {
        const s = c.subject;
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const lx = fz;
        const lz = -fx;
        const sweep = -0.6 + k * 1.2;
        const d = 2.6;
        const w = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
        const cp = new THREE.Vector3(s.x + fx * d * Math.cos(sweep) + lx * d * Math.sin(sweep), 1.0 + k * 0.4, s.z + fz * d * Math.cos(sweep) + lz * d * Math.sin(sweep));
        const ct = new THREE.Vector3(s.x + fx * 0.6, 1.2, s.z + fz * 0.6);
        wantPos.lerp(cp, w);
        wantTarget.lerp(ct, w);
        lambda = 7;
        fov = 30;
      }
    }

    this.clampToArena(wantPos);
    if (this.snapNext) {
      this.pos.copy(wantPos);
      this.target.copy(wantTarget);
      this.snapNext = false;
    } else {
      this.pos.set(damp(this.pos.x, wantPos.x, lambda, dt), damp(this.pos.y, wantPos.y, lambda, dt), damp(this.pos.z, wantPos.z, lambda, dt));
      this.target.set(
        damp(this.target.x, wantTarget.x, lambda * 1.3, dt),
        damp(this.target.y, wantTarget.y, lambda * 1.3, dt),
        damp(this.target.z, wantTarget.z, lambda * 1.3, dt),
      );
    }
    this.fov = damp(this.fov, fov, 4, dt);

    // Shake: trauma^2 with smooth pseudo-noise.
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    const t = this.time * 32;
    const ox = (Math.sin(t * 1.3) + Math.sin(t * 2.7 + 1.7)) * 0.5 * s * 0.12;
    const oy = (Math.sin(t * 1.7 + 3.1) + Math.sin(t * 3.3)) * 0.5 * s * 0.09;
    const roll = Math.sin(t * 1.1 + 0.4) * s * 0.025;
    this.camera.position.copy(this.pos);
    this.camera.position.y = Math.max(0.35, this.camera.position.y);
    this.camera.lookAt(this.target);
    this.camera.translateX(ox);
    this.camera.translateY(oy);
    this.camera.rotateZ(roll);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Side-on framing for two fighters; returns the fov to use. */
  private fightFraming(a: CamSubject, b: CamSubject, mid: THREE.Vector3, outPos: THREE.Vector3, outTarget: THREE.Vector3): number {
    const ax = b.x - a.x;
    const az = b.z - a.z;
    const sep = Math.hypot(ax, az) || 0.001;
    // Perpendicular to the fighter axis, kept on the same side as before (no flipping).
    const px = -az / sep;
    const pz = ax / sep;
    let sx = px;
    let sz = pz;
    if (px * this.side.x + pz * this.side.z < 0) {
      sx = -px;
      sz = -pz;
    }
    // Rotate the stored side smoothly (limits sudden swings when fighters circle).
    this.side.set(this.side.x + (sx - this.side.x) * 0.25, 0, this.side.z + (sz - this.side.z) * 0.25).normalize();
    const dist = clamp(2.6 + sep * 1.05, 3.9, 9.5);
    const height = 1.2 + dist * 0.11;
    outPos.set(mid.x + this.side.x * dist, height, mid.z + this.side.z * dist);
    // Pull the camera inward if it would leave the ruin ring; widen fov to compensate.
    const r = Math.hypot(outPos.x, outPos.z);
    let fov = 34;
    if (r > MAX_RADIUS) fov += clamp((r - MAX_RADIUS) * 4, 0, 14);
    const airborne = Math.max(a.y, b.y);
    outTarget.set(mid.x, 1.0 + airborne * 0.3, mid.z);
    return fov;
  }

  private clampToArena(p: THREE.Vector3): void {
    const r = Math.hypot(p.x, p.z);
    if (r > MAX_RADIUS) {
      p.x *= MAX_RADIUS / r;
      p.z *= MAX_RADIUS / r;
    }
  }

  /** Camera-relative ground axes for player input. */
  groundAxes(): { right: THREE.Vector3; forward: THREE.Vector3 } {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    f.y = 0;
    f.normalize();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    return { right, forward: f };
  }
}

import * as THREE from 'three';
import { clamp, DEG } from '../core/math';
import type { Fighter } from '../combat/Fighter';
import type { CharacterModel } from './appearance';
import { getClips, sampleClip, type Clip } from './clips';
import { blendPose, copyPose, createPose, PoseApplier, type Pose } from './Pose';

const BLEND_FRAMES: Record<string, number> = {
  attack: 3,
  hit: 2,
  block: 4,
  blockstun: 2,
  locomotion: 8,
  dodge: 4,
  launch: 3,
  default: 7,
};

/**
 * Drives a character model from the fighter simulation state. Chooses the
 * clip for the current state, cross-fades from the last displayed pose on
 * every transition, adds procedural locomotion (stride matched to actual
 * ground speed so feet don't slide), breathing and hit flinches, then
 * applies the result with leg IK.
 */
export class Animator {
  private clips: Record<string, Clip>;
  private applier: PoseApplier;
  private out = createPose();
  private from = createPose();
  private target = createPose();
  private key = '';
  private blendT = 1;
  private blendDur = 1;
  private phase = 0;
  private flinch = new THREE.Vector2();
  private flinchVel = new THREE.Vector2();
  private qTmp = new THREE.Quaternion();
  private eTmp = new THREE.Euler();
  private time = 0;

  constructor(model: CharacterModel) {
    this.clips = getClips(model.id);
    this.applier = new PoseApplier(model.skel);
  }

  /** Add a hit flinch impulse in fighter-local axes (x = lateral, y = forward). */
  flinchImpulse(localX: number, localZ: number, strength: number): void {
    this.flinchVel.x += localX * strength * 6;
    this.flinchVel.y += localZ * strength * 6;
  }

  /** Resolve the clip key and time (in frames) for the fighter's state. */
  private select(f: Fighter, alpha: number): { key: string; t: number; blend: number } {
    const t = f.stateFrame + alpha;
    switch (f.state) {
      case 'idle':
      case 'walk':
        return { key: 'idle', t: this.time * 60, blend: BLEND_FRAMES.locomotion };
      case 'attack':
        return { key: f.move!.anim + '#' + f.chain.length, t: f.moveFrame + alpha, blend: BLEND_FRAMES.attack };
      case 'block':
        return { key: 'block', t: 0, blend: BLEND_FRAMES.block };
      case 'blockstun':
        return { key: 'blockstun', t, blend: BLEND_FRAMES.blockstun };
      case 'hitstun': {
        const k = f.lastHitHeavy ? 'hitBody' : this.hitVariant(f);
        return { key: k + '#' + f.comboHits, t, blend: BLEND_FRAMES.hit };
      }
      case 'stagger':
        return { key: 'stagger', t, blend: BLEND_FRAMES.hit };
      case 'guardbreak':
        return { key: 'guardbreak', t, blend: BLEND_FRAMES.hit };
      case 'dash':
        return { key: 'dash', t, blend: BLEND_FRAMES.dodge };
      case 'backdash':
        return { key: 'backdash', t, blend: BLEND_FRAMES.dodge };
      case 'sidestep':
        return { key: f.dodgeDir > 0 ? 'sidestepL' : 'sidestepR', t, blend: BLEND_FRAMES.dodge };
      case 'launch':
        return { key: 'launch', t, blend: BLEND_FRAMES.launch };
      case 'down':
        return { key: 'down', t, blend: 6 };
      case 'ko':
        return { key: 'ko', t, blend: 8 };
      case 'getup':
        return { key: 'getup', t, blend: 4 };
      case 'victory':
        return { key: 'victory', t, blend: 14 };
      case 'defeat':
        return { key: 'defeat', t, blend: 14 };
      case 'intro':
        return { key: 'intro', t, blend: 1 };
    }
  }

  private hitVariant(f: Fighter): string {
    // Hits from behind make the body lurch forward.
    const fw = f.forward;
    const d = f.lastHitDir;
    if (fw.x * d.x + fw.z * d.z > 0.3) return 'hitBack';
    return f.comboHits % 2 ? 'hitHigh' : 'hitBody';
  }

  /** `localVel` = smoothed locomotion speed in fighter-local axes (m/s). */
  update(f: Fighter, alpha: number, dt: number, localVelFwd: number, localVelLat: number): void {
    this.time += dt;
    const sel = this.select(f, alpha);
    const baseKey = sel.key.split('#')[0];
    if (sel.key !== this.key) {
      copyPose(this.out, this.from);
      this.key = sel.key;
      this.blendT = 0;
      this.blendDur = sel.blend / 60;
    }
    const c = this.clips[baseKey] ?? this.clips.idle;
    sampleClip(c, sel.t, this.target);

    if (baseKey === 'idle') this.addLocomotion(this.target, localVelFwd, localVelLat, dt);
    else this.phase = 0;

    this.blendT = Math.min(1, this.blendT + dt / Math.max(1e-4, this.blendDur));
    const w = this.blendT * this.blendT * (3 - 2 * this.blendT);
    blendPose(this.from, this.target, w, this.out);

    this.applyFlinch(dt);
    this.applier.apply(this.out);
  }

  private addLocomotion(p: Pose, vf: number, vl: number, dt: number): void {
    const speed = Math.hypot(vf, vl);
    if (speed < 0.05) {
      return;
    }
    const stride = clamp(speed * 0.32, 0.12, 0.42);
    // Phase advances so that a planted foot moves exactly with the ground.
    this.phase = (this.phase + (speed / (2 * stride)) * dt) % 1;
    const dirF = vf / speed;
    const dirL = vl / speed;
    const amt = clamp(speed / 0.8, 0, 1);
    const lift = 0.07 * amt;
    const footAt = (ph: number): [number, number] => {
      // Returns [offset along travel (-0.5..0.5), lift].
      if (ph < 0.5) return [0.5 - ph * 2, 0];
      const s = (ph - 0.5) * 2;
      return [-0.5 + (1 - Math.cos(s * Math.PI)) / 2, Math.sin(s * Math.PI)];
    };
    const [oL, hL] = footAt(this.phase);
    const [oR, hR] = footAt((this.phase + 0.5) % 1);
    // Fighter-local: fwd = +Z, lat (left) = +X.
    p.footL.x += dirL * stride * oL * amt;
    p.footL.z += dirF * stride * oL * amt;
    p.footL.y += hL * lift;
    p.footR.x += dirL * stride * oR * amt;
    p.footR.z += dirF * stride * oR * amt;
    p.footR.y += hR * lift;
    p.footPitchL += -hL * 0.3 * amt;
    p.footPitchR += -hR * 0.3 * amt;
    // Body bob and lean into the direction of travel.
    p.hips.y += -Math.abs(Math.sin(this.phase * Math.PI * 2)) * 0.025 * amt;
    p.hips.z += dirF * 0.03 * amt;
    this.qTmp.setFromEuler(this.eTmp.set(dirF * 5 * DEG * amt, 0, -dirL * 4 * DEG * amt));
    p.q.spine.multiply(this.qTmp);
  }

  private applyFlinch(dt: number): void {
    // Critically-damped spring back to rest.
    const k = 140;
    const d = 2 * Math.sqrt(k) * 0.8;
    this.flinchVel.x += (-k * this.flinch.x - d * this.flinchVel.x) * dt;
    this.flinchVel.y += (-k * this.flinch.y - d * this.flinchVel.y) * dt;
    this.flinch.x += this.flinchVel.x * dt;
    this.flinch.y += this.flinchVel.y * dt;
    const fx = clamp(this.flinch.x, -0.6, 0.6);
    const fz = clamp(this.flinch.y, -0.6, 0.6);
    if (Math.abs(fx) + Math.abs(fz) < 1e-4) return;
    // Hit from the front (fz < 0) bends the chest/head back.
    this.qTmp.setFromEuler(this.eTmp.set(fz * 0.5, 0, -fx * 0.4));
    this.out.q.chest.multiply(this.qTmp);
    this.qTmp.setFromEuler(this.eTmp.set(fz * 0.7, fx * 0.4, -fx * 0.3));
    this.out.q.head.multiply(this.qTmp);
  }

  /** Snap to the target pose immediately (e.g. on round reset). */
  snap(): void {
    this.blendT = 1;
    this.key = '';
  }

  get currentKey(): string {
    return this.key;
  }
}

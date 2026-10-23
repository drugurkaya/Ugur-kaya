import * as THREE from 'three';
import { clamp, damp } from '../core/rng';
import type { Shot } from '../world/Area';

/**
 * Third-person orbit camera with wall avoidance, plus cinematic shots that the director blends to.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.22;
  distance = 2.4;
  private ray = new THREE.Raycaster();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shot: Shot | null = null;
  private shotBlend = 0;
  private shotKey = '';
  /** Seconds spent in the current shot; drives the slow cinematic push-in. */
  private shotTime = 0;
  shake = 0;
  private t = 0;
  reduceMotion = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.03, 400);
  }

  /** `key` identifies the shot: re-solving the same shot keeps its push-in going. */
  setShot(s: Shot | null, key = '') {
    if (key !== this.shotKey) this.shotTime = 0;
    this.shotKey = s ? key : '';
    this.shot = s;
  }

  /** How much depth of field to apply (close-ups only) and where to focus. */
  get dof() {
    return this.shot && !this.reduceMotion ? this.shotBlend : 0;
  }
  get focus() {
    return this.camera.position.distanceTo(this.look);
  }

  get inShot() {
    return !!this.shot;
  }

  /** Jump without blending (after loading or scene changes). */
  snap(target: THREE.Vector3, blockers: THREE.Object3D[]) {
    this.update(10, target, blockers);
  }

  update(dt: number, target: THREE.Vector3, blockers: THREE.Object3D[]) {
    this.t += dt;
    if (this.shot) this.shotTime += Math.min(dt, 0.1);
    // Orbit pose
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let dist = this.distance;
    if (blockers.length) {
      this.ray.set(target, off);
      this.ray.far = dist + 0.2;
      const hit = this.ray.intersectObjects(blockers, false)[0];
      if (hit) dist = Math.max(0.6, hit.distance - 0.2);
    }
    const orbitPos = target.clone().addScaledVector(off, dist);
    // Pressed against a wall: rise and look down instead of entering the character.
    if (dist < 1.1) orbitPos.y += (1.1 - dist) * 1.3;
    const orbitLook = target.clone();
    const lam = dt >= 1 ? 100 : 0;
    this.shotBlend = damp(this.shotBlend, this.shot ? 1 : 0, lam || 2.6, Math.min(dt, 1));
    let p = orbitPos;
    let l = orbitLook;
    let fov = 55;
    if (this.shot) {
      // Slow dolly-in towards the subject while a shot holds (up to 9% of the distance).
      const push = this.reduceMotion ? 0 : Math.min(0.09, this.shotTime * 0.01);
      const shotPos = this.shot.pos.clone().lerp(this.shot.target, push);
      p = orbitPos.clone().lerp(shotPos, this.shotBlend);
      l = orbitLook.clone().lerp(this.shot.target, this.shotBlend);
      fov = 55 + ((this.shot.fov ?? 45) - 55) * this.shotBlend - push * 12;
    } else if (this.shotBlend > 0.001) {
      p = orbitPos.clone().lerp(this.pos, this.shotBlend);
      l = orbitLook.clone().lerp(this.look, this.shotBlend);
    }
    // Glide between cinematic shots; follow the player tightly while exploring.
    const k = dt >= 1 ? 1 : 1 - Math.exp(-(this.shot ? 4.5 : 12) * dt);
    this.pos.lerp(p, k);
    this.look.lerp(l, k);
    if (dt >= 1) {
      this.pos.copy(p);
      this.look.copy(l);
    }
    this.camera.position.copy(this.pos);
    // Handheld breathing and stress shake
    const amp = this.reduceMotion ? 0 : 0.004 + this.shake * 0.02;
    this.camera.position.x += Math.sin(this.t * 1.3) * amp;
    this.camera.position.y += Math.sin(this.t * 1.7 + 1) * amp;
    this.camera.lookAt(this.look);
    if (this.shot?.roll && !this.reduceMotion) this.camera.rotateZ(this.shot.roll * this.shotBlend);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  orbit(dx: number, dy: number, sens: number, invert: boolean) {
    this.yaw -= dx * 0.005 * sens;
    this.pitch = clamp(this.pitch + dy * 0.004 * sens * (invert ? -1 : 1), -0.25, 1.1);
  }

  zoomBy(z: number) {
    this.distance = clamp(this.distance + z * 0.25, 1.2, 4.0);
  }
}

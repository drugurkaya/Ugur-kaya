import * as THREE from 'three';
import { Character } from '../characters/Character';
import { CAST } from '../characters/cast';
import type { PRESETS } from '../core/Settings';
import type { Grade } from '../render/Renderer';
import type { GameState } from '../state/GameState';
import type { LText } from '../state/types';
import type { Collider } from './kit';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: LText;
  /** Dialogue to start, or a custom handler id resolved by the game. */
  dialogue?: string;
  handler?: string;
  /** Only available when this returns true. */
  when?: (s: GameState) => boolean;
}

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
  roll?: number;
}

export interface AreaContext {
  preset: (typeof PRESETS)[keyof typeof PRESETS];
  state: GameState;
}

/** A place in the world: geometry, lights, colliders, NPCs, interactables and named camera shots. */
export abstract class Area {
  readonly group = new THREE.Group();
  colliders: Collider[] = [];
  interactables: Interactable[] = [];
  npcs: Record<string, Character> = {};
  spawns: Record<string, { x: number; z: number; yaw: number; y?: number }> = {};
  /** Lights that fade in when the player is inside a region. */
  roomLights: { light: THREE.Light; on: number; region?: { minX: number; maxX: number; minZ: number; maxZ: number }; forced?: boolean }[] = [];
  /** Meshes that block the third-person camera. */
  blockers: THREE.Object3D[] = [];
  /** Whether the protagonist walks freely here. */
  walkable = true;
  /** Ambience id for the audio engine. */
  ambience = 'home';
  env: THREE.Texture | null = null;
  background = new THREE.Color(0x05070c);
  /** Tone-mapping exposure for this place (bright clinical rooms need less). */
  exposure = 1;
  /** Colour grade for this place (applied by the post-processing pass). */
  grade: Grade = { tint: [1, 1, 1] };
  /** Depth haze: colour and density (0 = none). Only on presets with atmosphere. */
  fog: { color: number; density: number } | null = null;

  constructor(protected ctx: AreaContext) {}

  abstract build(): void;

  /** Named shot; return null to let the game use its generic shots. */
  shot(_name: string): Shot | null {
    return null;
  }

  addNpc(id: string, x: number, z: number, yaw: number, pose: Character['pose'] = 'idle', y = 0): Character {
    const c = new Character(CAST[id].look);
    c.root.position.set(x, y, z);
    c.root.rotation.y = yaw;
    c.pose = pose;
    c.snap();
    this.group.add(c.root);
    this.npcs[id] = c;
    return c;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    for (const n of Object.values(this.npcs)) n.update(dt);
    for (const rl of this.roomLights) {
      const inside = rl.forced ?? (!rl.region || (playerPos.x >= rl.region.minX && playerPos.x <= rl.region.maxX && playerPos.z >= rl.region.minZ && playerPos.z <= rl.region.maxZ));
      const target = inside ? rl.on : 0;
      rl.light.intensity += (target - rl.light.intensity) * Math.min(1, dt * 3);
    }
  }

  /**
   * A soft additive beam of light (window moonlight, surgical lamp cones). Only on presets with
   * atmosphere; returns null otherwise.
   */
  protected lightBeam(from: THREE.Vector3, to: THREE.Vector3, radiusTop: number, radiusBottom: number, color: number, opacity: number): THREE.Mesh | null {
    if (!this.ctx.preset.atmosphere) return null;
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, len, 24, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */ `
        varying float vY; varying vec3 vN; varying vec3 vView;
        void main() {
          vY = uv.y;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vY; varying vec3 vN; varying vec3 vView;
        void main() {
          float rim = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
          float fade = smoothstep(0.0, 0.6, vY);
          gl_FragColor = vec4(uColor * uOpacity * rim * fade, 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
    m.renderOrder = 10;
    m.castShadow = false;
    m.receiveShadow = false;
    this.group.add(m);
    return m;
  }

  /** Collect wall meshes as camera blockers after build. */
  protected collectBlockers() {
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.wall) this.blockers.push(o);
    });
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

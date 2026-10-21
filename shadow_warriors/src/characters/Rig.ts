import * as THREE from 'three';
import { smoothstep } from '../core/math';

export const BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'clavL',
  'upperArmL',
  'foreArmL',
  'handL',
  'clavR',
  'upperArmR',
  'foreArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];

const PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  clavL: 'chest',
  upperArmL: 'clavL',
  foreArmL: 'upperArmL',
  handL: 'foreArmL',
  clavR: 'chest',
  upperArmR: 'clavR',
  foreArmR: 'upperArmR',
  handR: 'foreArmR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
};

/** Skeleton proportions (metres, before the character's uniform scale). */
export interface Proportions {
  hipsY: number;
  spine: number;
  chest: number;
  neck: number;
  head: number;
  clavX: number;
  clavY: number;
  shoulderX: number;
  upperArm: number;
  foreArm: number;
  hipX: number;
  hipDrop: number;
  thigh: number;
  shin: number;
}

/**
 * A procedural humanoid skeleton. Bones are oriented so that, in bind pose,
 * every local rotation is identity: the character faces +Z, its left is +X,
 * arms hang along -Y and legs point down. Animation poses are therefore
 * plain local rotations relative to that neutral stance.
 */
export class Skeleton {
  readonly bones = {} as Record<BoneName, THREE.Bone>;
  readonly bindLocal = {} as Record<BoneName, THREE.Vector3>;
  readonly bindWorld = {} as Record<BoneName, THREE.Vector3>;
  readonly list: THREE.Bone[] = [];
  readonly index = {} as Record<BoneName, number>;
  readonly p: Proportions;

  constructor(p: Proportions) {
    this.p = p;
    const local: Record<BoneName, [number, number, number]> = {
      hips: [0, p.hipsY, 0],
      spine: [0, p.spine, 0],
      chest: [0, p.chest, 0],
      neck: [0, p.neck, 0],
      head: [0, p.head, 0],
      clavL: [p.clavX, p.clavY, -0.01],
      upperArmL: [p.shoulderX, 0, 0],
      foreArmL: [0, -p.upperArm, 0],
      handL: [0, -p.foreArm, 0],
      clavR: [-p.clavX, p.clavY, -0.01],
      upperArmR: [-p.shoulderX, 0, 0],
      foreArmR: [0, -p.upperArm, 0],
      handR: [0, -p.foreArm, 0],
      thighL: [p.hipX, -p.hipDrop, 0],
      shinL: [0, -p.thigh, 0],
      footL: [0, -p.shin, 0],
      thighR: [-p.hipX, -p.hipDrop, 0],
      shinR: [0, -p.thigh, 0],
      footR: [0, -p.shin, 0],
    };
    BONE_NAMES.forEach((name, i) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(...local[name]);
      this.bones[name] = b;
      this.bindLocal[name] = b.position.clone();
      this.list.push(b);
      this.index[name] = i;
      const parent = PARENT[name];
      if (parent) this.bones[parent].add(b);
    });
    for (const name of BONE_NAMES) {
      const w = this.bindLocal[name].clone();
      let pa = PARENT[name];
      while (pa) {
        w.add(this.bindLocal[pa]);
        pa = PARENT[pa];
      }
      this.bindWorld[name] = w;
    }
  }

  parentOf(b: BoneName): BoneName | null {
    return PARENT[b];
  }

  get root(): THREE.Bone {
    return this.bones.hips;
  }
}

/* ------------------------------------------------------------------------ */
/* Skinned body builder                                                      */
/* ------------------------------------------------------------------------ */

/** Profile control point: t along the segment, half-width, front depth, back depth. */
export type ProfileKey = [t: number, rx: number, rzFront: number, rzBack: number];

export type WeightFn = (t: number, p: THREE.Vector3) => [BoneName, number][];

export interface TubeSpec {
  material: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  profile: ProfileKey[];
  bone: BoneName;
  /** Blend toward the parent bone near t=0 and the child bone near t=1. */
  parentBlend?: [BoneName, number];
  childBlend?: [BoneName, number];
  weights?: WeightFn;
  radial?: number;
  rings?: number;
  /** Cap rounding at each end (fraction of the end radius). */
  caps?: [number, number];
  /** Rotate the cross-section around the axis (radians). */
  twist?: number;
  /** UV repeat (around, along). */
  uvScale?: [number, number];
}

interface Part {
  positions: number[];
  normals: number[];
  uvs: number[];
  skinIndex: number[];
  skinWeight: number[];
  indices: number[];
}

const sampleProfile = (keys: ProfileKey[], t: number): [number, number, number] => {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0]);
      const s = 0.5 - 0.5 * Math.cos(k * Math.PI);
      return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2], l[3]];
};

/**
 * Builds one multi-material skinned mesh from many sculpted "tubes"
 * (elliptical lathe sections with front/back asymmetry and rounded caps).
 * Vertices are smoothly weighted across joints so elbows, knees and the
 * spine bend organically instead of breaking like rigid parts.
 */
export class BodyBuilder {
  private parts = new Map<string, Part>();
  readonly skel: Skeleton;

  constructor(skel: Skeleton) {
    this.skel = skel;
  }

  private part(material: string): Part {
    let p = this.parts.get(material);
    if (!p) {
      p = { positions: [], normals: [], uvs: [], skinIndex: [], skinWeight: [], indices: [] };
      this.parts.set(material, p);
    }
    return p;
  }

  tube(spec: TubeSpec): void {
    const radial = spec.radial ?? 18;
    const rings = spec.rings ?? 12;
    const [capA, capB] = spec.caps ?? [0.9, 0.9];
    const capRings = 5;
    const axis = new THREE.Vector3().subVectors(spec.to, spec.from);
    const len = axis.length();
    const d = axis.clone().normalize();
    const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    // u: lateral axis, w: "front" axis (toward +Z for vertical segments, toward +Y for horizontal).
    let u = new THREE.Vector3().crossVectors(d, ref).normalize();
    let w = new THREE.Vector3().crossVectors(u, d).normalize();
    if (Math.abs(d.y) > 0.9 && w.z < 0) {
      u.negate();
      w.negate();
    }
    if (spec.twist) {
      const q = new THREE.Quaternion().setFromAxisAngle(d, spec.twist);
      u = u.applyQuaternion(q);
      w = w.applyQuaternion(q);
    }
    const [r0x, r0f, r0b] = sampleProfile(spec.profile, 0);
    const [r1x, r1f, r1b] = sampleProfile(spec.profile, 1);
    const capLenA = Math.max(r0x, r0f, r0b) * capA;
    const capLenB = Math.max(r1x, r1f, r1b) * capB;

    // Ring stations: cap A (from tip to t=0), body, cap B.
    const stations: { pos: number; t: number; k: number }[] = [];
    if (capLenA > 0) {
      for (let i = capRings; i >= 1; i--) {
        const f = i / capRings;
        stations.push({ pos: -capLenA * f, t: 0, k: Math.sqrt(Math.max(0, 1 - f * f)) });
      }
    }
    for (let i = 0; i <= rings; i++) stations.push({ pos: (i / rings) * len, t: i / rings, k: 1 });
    if (capLenB > 0) {
      for (let i = 1; i <= capRings; i++) {
        const f = i / capRings;
        stations.push({ pos: len + capLenB * f, t: 1, k: Math.sqrt(Math.max(0, 1 - f * f)) });
      }
    }

    const part = this.part(spec.material);
    const base = part.positions.length / 3;
    const [uvA, uvB] = spec.uvScale ?? [1, 1];
    const center = new THREE.Vector3();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const totalLen = len + capLenA + capLenB;
    for (const st of stations) {
      const [rx, rf, rb] = sampleProfile(spec.profile, Math.min(1, Math.max(0, st.pos / len)));
      center.copy(spec.from).addScaledVector(d, st.pos);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const rz = s >= 0 ? rf : rb;
        p.copy(center)
          .addScaledVector(u, c * rx * st.k)
          .addScaledVector(w, s * rz * st.k);
        // Approximate ellipse normal (refined later by computeVertexNormals per part).
        n.set(0, 0, 0)
          .addScaledVector(u, c / Math.max(rx, 1e-4))
          .addScaledVector(w, s / Math.max(rz, 1e-4))
          .normalize();
        if (st.k >= 1 && len > 1e-4) {
          // Tilt the normal by the profile slope so tapering limbs shade correctly.
          const e = 0.02;
          const ta = Math.max(0, st.pos / len - e);
          const tb = Math.min(1, st.pos / len + e);
          const ra = sampleProfile(spec.profile, ta);
          const rbb = sampleProfile(spec.profile, tb);
          const avg = (r: [number, number, number]) => Math.abs(c) * r[0] + Math.abs(s) * (s >= 0 ? r[1] : r[2]);
          const slope = (avg(rbb) - avg(ra)) / Math.max(1e-4, (tb - ta) * len);
          n.addScaledVector(d, -slope).normalize();
        }
        if (st.k < 1) {
          const along = st.pos < 0 ? -1 : 1;
          n.multiplyScalar(st.k).addScaledVector(d, along * Math.sqrt(1 - st.k * st.k)).normalize();
        }
        part.positions.push(p.x, p.y, p.z);
        part.normals.push(n.x, n.y, n.z);
        part.uvs.push((j / radial) * uvA, ((st.pos + capLenA) / totalLen) * uvB);
        const ws = spec.weights ? spec.weights(st.t, p) : this.defaultWeights(spec, st.t);
        this.pushWeights(part, ws);
      }
    }
    const cols = radial + 1;
    // Winding: outward normals with (u, w, d) basis is consistent for this order.
    // (d x w) points along +u (outward at angle 0) for the (a, c, b) winding.
    const flip = new THREE.Vector3().crossVectors(d, w).dot(u) < 0;
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const e = c + 1;
        if (!flip) part.indices.push(a, c, b, b, c, e);
        else part.indices.push(a, b, c, b, e, c);
      }
    }
  }

  private defaultWeights(spec: TubeSpec, t: number): [BoneName, number][] {
    const out: [BoneName, number][] = [];
    let wP = 0;
    let wC = 0;
    if (spec.parentBlend) wP = 0.5 * (1 - smoothstep(0, spec.parentBlend[1], t));
    if (spec.childBlend) wC = 0.5 * smoothstep(1 - spec.childBlend[1], 1, t);
    out.push([spec.bone, 1 - wP - wC]);
    if (wP > 0) out.push([spec.parentBlend![0], wP]);
    if (wC > 0) out.push([spec.childBlend![0], wC]);
    return out;
  }

  private pushWeights(part: Part, ws: [BoneName, number][]): void {
    const sorted = ws.filter((x) => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const [, w] of sorted) sum += w;
    for (let i = 0; i < 4; i++) {
      const e = sorted[i];
      part.skinIndex.push(e ? this.skel.index[e[0]] : 0);
      part.skinWeight.push(e ? e[1] / sum : 0);
    }
  }

  /** Arbitrary closed mesh (e.g. a deformed sphere) bound to bones by a weight function. */
  geometry(material: string, geo: THREE.BufferGeometry, weights: WeightFn): void {
    const g = geo.index ? geo : geo;
    const part = this.part(material);
    const base = part.positions.length / 3;
    const pos = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      part.positions.push(v.x, v.y, v.z);
      part.normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      part.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.pushWeights(part, weights(0, v));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) part.indices.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) part.indices.push(base + i);
  }

  build(materials: Record<string, THREE.Material>): THREE.SkinnedMesh {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const indices: number[] = [];
    const mats: THREE.Material[] = [];
    for (const [name, part] of this.parts) {
      const base = positions.length / 3;
      const start = indices.length;
      positions.push(...part.positions);
      normals.push(...part.normals);
      uvs.push(...part.uvs);
      si.push(...part.skinIndex);
      sw.push(...part.skinWeight);
      for (const i of part.indices) indices.push(base + i);
      geo.addGroup(start, part.indices.length, mats.length);
      const m = materials[name];
      if (!m) throw new Error(`Missing material "${name}"`);
      mats.push(m);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, mats);
    mesh.add(this.skel.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.skel.list));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Animated bounds are hard to predict; never cull fighters.
    mesh.frustumCulled = false;
    return mesh;
  }
}

/** Helper: weights interpolated along a chain of (height, bone) anchors (used for the torso). */
export const heightWeights =
  (anchors: [number, BoneName][]): WeightFn =>
  (_t, p) => {
    if (p.y <= anchors[0][0]) return [[anchors[0][1], 1]];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [y0, b0] = anchors[i];
      const [y1, b1] = anchors[i + 1];
      if (p.y <= y1) {
        const k = smoothstep(y0, y1, p.y);
        return [
          [b0, 1 - k],
          [b1, k],
        ];
      }
    }
    return [[anchors[anchors.length - 1][1], 1]];
  };

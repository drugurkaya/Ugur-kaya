import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterId } from '../combat/data';
import { detailSet, type PBRSet } from '../render/textures';
import type { CustomProfile } from './profile';
import { Ribbon } from './Ribbon';
import { BodyBuilder, heightWeights, Skeleton, type BoneName, type ProfileKey, type Proportions } from './Rig';

/*
 * Character art. Both fighters are generated procedurally: a sculpted,
 * smoothly-skinned body (BodyBuilder tubes) plus rigid armour/accessory
 * meshes parented to bones and Verlet cloth ribbons. No external model or
 * motion-capture files are used.
 */

export interface CharacterModel {
  id: CharacterId;
  root: THREE.Group;
  skel: Skeleton;
  mesh: THREE.SkinnedMesh;
  ribbons: Ribbon[];
  /** Signature energy colour (special moves, trails). */
  energy: THREE.Color;
  /** Emissive materials that pulse with meter / special. */
  glowMats: THREE.MeshStandardMaterial[];
  /** All materials (for hit flash). */
  materials: THREE.MeshStandardMaterial[];
}

let detail: Record<'fabric' | 'leather' | 'metal' | 'skin', PBRSet> | null = null;

const getDetail = (size: number) => {
  if (!detail) {
    detail = {
      fabric: detailSet('fabric', size, 4),
      leather: detailSet('leather', size, 9),
      metal: detailSet('metal', size, 13),
      skin: detailSet('skin', size, 2),
    };
  }
  return detail;
};

const withRepeat = (set: PBRSet, r: number, keep = ['normalMap', 'roughnessMap']): Partial<PBRSet> => {
  const out: Partial<PBRSet> = {};
  for (const k of keep as (keyof PBRSet)[]) {
    const t = set[k];
    if (!t) continue;
    const c = t.clone();
    c.repeat.set(r, r);
    c.needsUpdate = true;
    out[k] = c;
  }
  return out;
};

interface MatOpts {
  color: string;
  kind: 'fabric' | 'leather' | 'metal' | 'skin' | 'plain';
  repeat?: number;
  roughness?: number;
  metalness?: number;
  sheen?: string;
  clearcoat?: number;
  emissive?: string;
  emissiveIntensity?: number;
  normalScale?: number;
  side?: THREE.Side;
}

const makeMaterial = (o: MatOpts, size: number): THREE.MeshPhysicalMaterial => {
  const d = getDetail(size);
  const maps = o.kind === 'plain' ? {} : withRepeat(d[o.kind], o.repeat ?? 4);
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color),
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    ...maps,
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    side: o.side ?? THREE.FrontSide,
  });
  if (o.kind === 'fabric') {
    m.sheen = 1;
    m.sheenRoughness = 0.55;
    m.sheenColor = new THREE.Color(o.sheen ?? '#3a3f4a');
  }
  if (o.kind === 'skin') {
    // Cheap subsurface impression: reddish sheen at grazing angles.
    m.sheen = 0.15;
    m.sheenRoughness = 0.5;
    m.sheenColor = new THREE.Color(o.sheen ?? '#c45a44');
  }
  if (o.clearcoat) {
    m.clearcoat = o.clearcoat;
    m.clearcoatRoughness = 0.45;
  }
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  return m;
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Body sculpt parameters shared by both fighters (scaled per character). */
interface BodySculpt {
  torso: ProfileKey[];
  torsoY: [number, number];
  neckR: number;
  upperArm: ProfileKey[];
  foreArm: ProfileKey[];
  thigh: ProfileKey[];
  shin: ProfileKey[];
  hand: [number, number, number];
  foot: [number, number];
}

/** Shared anatomy: torso, neck, limbs, hands and feet, assigned to materials. */
function sculptBody(
  bb: BodyBuilder,
  s: Skeleton,
  sc: BodySculpt,
  mats: { torso: string; neck: string; upperArm: string; foreArm: string; hand: string; thigh: string; shin: string; foot: string },
): void {
  const W = s.bindWorld;
  const torsoW = heightWeights([
    [W.hips.y - 0.04, 'hips'],
    [W.spine.y + 0.04, 'spine'],
    [W.chest.y + 0.02, 'chest'],
  ]);
  bb.tube({
    material: mats.torso,
    from: v(0, sc.torsoY[0], 0),
    to: v(0, sc.torsoY[1], 0),
    profile: sc.torso,
    bone: 'chest',
    weights: torsoW,
    radial: 28,
    rings: 22,
    caps: [0.6, 0.3],
    uvScale: [3, 3],
  });
  // Neck.
  bb.tube({
    material: mats.neck,
    from: v(0, W.neck.y - 0.06, -0.005),
    to: v(0, W.head.y + 0.05, 0.005),
    profile: [
      [0, sc.neckR * 1.25, sc.neckR * 1.1, sc.neckR * 1.2],
      [0.5, sc.neckR, sc.neckR * 1.05, sc.neckR],
      [1, sc.neckR * 0.95, sc.neckR, sc.neckR],
    ],
    bone: 'neck',
    parentBlend: ['chest', 0.4],
    childBlend: ['head', 0.4],
    radial: 16,
    rings: 6,
  });

  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const sh = W[`upperArm${side}`];
    const el = W[`foreArm${side}`];
    const wr = W[`hand${side}`];
    // Shoulder bridge (trapezius into deltoid).
    bb.tube({
      material: mats.torso,
      from: v(sx * 0.05, sh.y + 0.02, -0.01),
      to: v(sh.x - sx * 0.01, sh.y + 0.0, 0),
      profile: [
        [0, 0.075, 0.05, 0.06],
        [1, 0.06, 0.055, 0.06],
      ],
      bone: `clav${side}` as BoneName,
      weights: (t) => [
        ['chest', 1 - t * 0.8],
        [`clav${side}` as BoneName, t * 0.8 * (1 - t * 0.5)],
        [`upperArm${side}` as BoneName, t * 0.4],
      ],
      radial: 14,
      rings: 6,
      caps: [0.5, 0.2],
    });
    bb.tube({
      material: mats.upperArm,
      from: v(sh.x, sh.y + 0.035, sh.z),
      to: v(el.x, el.y, el.z),
      profile: sc.upperArm,
      bone: `upperArm${side}` as BoneName,
      parentBlend: [`clav${side}` as BoneName, 0.18],
      childBlend: [`foreArm${side}` as BoneName, 0.2],
      radial: 18,
      rings: 12,
      uvScale: [2, 2],
    });
    bb.tube({
      material: mats.foreArm,
      from: v(el.x, el.y + 0.01, el.z),
      to: v(wr.x, wr.y, wr.z),
      profile: sc.foreArm,
      bone: `foreArm${side}` as BoneName,
      parentBlend: [`upperArm${side}` as BoneName, 0.2],
      childBlend: [`hand${side}` as BoneName, 0.12],
      radial: 16,
      rings: 10,
      uvScale: [2, 3],
    });
    // Fist: knuckles face forward when the arm is raised to punch.
    const [hw, hd, hl] = sc.hand;
    bb.tube({
      material: mats.hand,
      from: v(wr.x, wr.y - 0.005, wr.z),
      to: v(wr.x, wr.y - hl, wr.z + 0.005),
      profile: [
        [0, hw * 0.8, hd * 0.75, hd * 0.7],
        [0.45, hw, hd, hd * 0.85],
        [1, hw * 0.95, hd * 0.9, hd * 0.8],
      ],
      bone: `hand${side}` as BoneName,
      parentBlend: [`foreArm${side}` as BoneName, 0.15],
      radial: 14,
      rings: 6,
      caps: [0.3, 0.7],
    });
    // Thumb wrapped over the fist.
    bb.tube({
      material: mats.hand,
      from: v(wr.x - sx * 0.01, wr.y - 0.03, wr.z + hd * 0.7),
      to: v(wr.x - sx * hw * 0.6, wr.y - hl * 0.75, wr.z + hd * 0.95),
      profile: [
        [0, 0.017, 0.017, 0.017],
        [1, 0.014, 0.014, 0.014],
      ],
      bone: `hand${side}` as BoneName,
      radial: 8,
      rings: 3,
    });

    const hip = W[`thigh${side}`];
    const knee = W[`shin${side}`];
    const ank = W[`foot${side}`];
    bb.tube({
      material: mats.thigh,
      from: v(hip.x, hip.y + 0.05, hip.z),
      to: v(knee.x, knee.y, knee.z),
      profile: sc.thigh,
      bone: `thigh${side}` as BoneName,
      parentBlend: ['hips', 0.25],
      childBlend: [`shin${side}` as BoneName, 0.18],
      radial: 20,
      rings: 14,
      uvScale: [2, 3],
    });
    bb.tube({
      material: mats.shin,
      from: v(knee.x, knee.y + 0.01, knee.z),
      to: v(ank.x, ank.y - 0.01, ank.z),
      profile: sc.shin,
      bone: `shin${side}` as BoneName,
      parentBlend: [`thigh${side}` as BoneName, 0.18],
      childBlend: [`foot${side}` as BoneName, 0.1],
      radial: 18,
      rings: 14,
      uvScale: [2, 3],
    });
    const [fl, fw] = sc.foot;
    bb.tube({
      material: mats.foot,
      from: v(ank.x, 0.055, ank.z - 0.075),
      to: v(ank.x + sx * 0.008, 0.04, ank.z + fl),
      profile: [
        [0, fw * 0.8, 0.055, 0.045],
        [0.3, fw, 0.055, 0.045],
        [0.75, fw * 1.1, 0.035, 0.035],
        [1, fw * 0.9, 0.025, 0.03],
      ],
      bone: `foot${side}` as BoneName,
      parentBlend: [`shin${side}` as BoneName, 0.1],
      radial: 16,
      rings: 8,
      caps: [0.7, 0.8],
    });
  }
}

/** Head shape: deformed sphere (skull, jaw, brow) weighted to head/neck. */
function headGeometry(r: number, cy: number, phi: [number, number] = [0, Math.PI * 2], theta: [number, number] = [0, Math.PI]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 32, 24, phi[0], phi[1], theta[0], theta[1]);
  const p = g.getAttribute('position');
  const t = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    t.fromBufferAttribute(p, i);
    const y = t.y / r;
    // Narrow jaw, fuller cranium, flatter sides, slight forward face.
    const jaw = y < -0.1 ? 1 - (-0.1 - y) * 0.45 : 1;
    t.x *= 0.86 * jaw;
    t.z *= (t.z > 0 ? 1.02 : 1.08) * (y < -0.2 && t.z < 0 ? 0.85 : 1);
    t.y *= 1.12;
    if (y < -0.3 && t.z > 0) t.z += r * 0.08 * (-0.3 - y); // chin
    if (y > -0.05 && y < 0.25 && t.z > r * 0.5) t.z += r * 0.06 * (1 - Math.abs(y - 0.1) / 0.15); // brow
    p.setXYZ(i, t.x, t.y + cy, t.z + r * 0.05);
  }
  g.computeVertexNormals();
  return g;
}

const addTo = (bone: THREE.Object3D, mesh: THREE.Mesh, shadow = true): THREE.Mesh => {
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  bone.add(mesh);
  return mesh;
};

/** Curved armour shell: a section of an ellipsoid. */
function shell(rx: number, ry: number, rz: number, phi: [number, number], theta: [number, number], seg = 20): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.6)), phi[0], phi[1], theta[0], theta[1]);
  g.scale(rx, ry, rz);
  return g;
}

/** Give an open shell some thickness by merging an inward-offset copy. */
function thick(g: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const inner = g.clone();
  const p = inner.getAttribute('position');
  const n = inner.getAttribute('normal');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * t, p.getY(i) - n.getY(i) * t, p.getZ(i) - n.getZ(i) * t);
  // Flip inner faces.
  const idx = inner.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return mergeGeometries([g, inner]);
}

/* ======================================================================== */
/* THE PHANTOM                                                               */
/* ======================================================================== */

export const PHANTOM_PROPS: Proportions = {
  hipsY: 0.98,
  spine: 0.1,
  chest: 0.2,
  neck: 0.22,
  head: 0.1,
  clavX: 0.03,
  clavY: 0.17,
  shoulderX: 0.165,
  upperArm: 0.285,
  foreArm: 0.26,
  hipX: 0.095,
  hipDrop: 0.06,
  thigh: 0.43,
  shin: 0.42,
};

export const IRONFANG_PROPS: Proportions = {
  hipsY: 0.98,
  spine: 0.1,
  chest: 0.21,
  neck: 0.2,
  head: 0.1,
  clavX: 0.035,
  clavY: 0.16,
  shoulderX: 0.2,
  upperArm: 0.285,
  foreArm: 0.26,
  hipX: 0.11,
  hipDrop: 0.06,
  thigh: 0.43,
  shin: 0.42,
};

export function buildPhantom(texSize: number): CharacterModel {
  const s = new Skeleton(PHANTOM_PROPS);
  const bb = new BodyBuilder(s);
  const W = s.bindWorld;
  const ENERGY = new THREE.Color('#8a6bff');

  const mats = {
    top: makeMaterial({ color: '#22252c', kind: 'fabric', repeat: 6, sheen: '#4a5262' }, texSize),
    pants: makeMaterial({ color: '#16181d', kind: 'fabric', repeat: 6, sheen: '#3e4452' }, texSize),
    wrap: makeMaterial({ color: '#4d4a44', kind: 'fabric', repeat: 8, sheen: '#8a857a' }, texSize),
    leather: makeMaterial({ color: '#2b211c', kind: 'leather', repeat: 4, roughness: 0.75, clearcoat: 0.25 }, texSize),
    hood: makeMaterial({ color: '#121418', kind: 'fabric', repeat: 6, sheen: '#3a3f4c' }, texSize),
    skin: makeMaterial({ color: '#9a7462', kind: 'skin', repeat: 2, roughness: 0.62, normalScale: 0.25 }, texSize),
    sash: makeMaterial({ color: '#4a1420', kind: 'fabric', repeat: 6, sheen: '#7a2a3a', side: THREE.DoubleSide }, texSize),
    metal: makeMaterial({ color: '#5d6168', kind: 'metal', repeat: 2, metalness: 1, roughness: 0.9 }, texSize),
    eye: new THREE.MeshPhysicalMaterial({ color: '#16120f', roughness: 0.1, clearcoat: 1, emissive: ENERGY, emissiveIntensity: 0.04 }),
  };

  for (const [k, m] of Object.entries(mats)) m.name = k;
  sculptBody(
    bb,
    s,
    {
      torsoY: [0.84, 1.52],
      torso: [
        [0, 0.14, 0.1, 0.11],
        [0.12, 0.165, 0.11, 0.13],
        [0.3, 0.14, 0.1, 0.095],
        [0.55, 0.162, 0.118, 0.105],
        [0.74, 0.182, 0.13, 0.115],
        [0.88, 0.18, 0.1, 0.105],
        [1, 0.075, 0.065, 0.07],
      ],
      neckR: 0.052,
      upperArm: [
        [0, 0.058, 0.06, 0.056],
        [0.25, 0.052, 0.058, 0.05],
        [0.85, 0.042, 0.043, 0.042],
        [1, 0.04, 0.04, 0.04],
      ],
      foreArm: [
        [0, 0.042, 0.044, 0.042],
        [0.25, 0.046, 0.046, 0.043],
        [1, 0.032, 0.03, 0.03],
      ],
      thigh: [
        [0, 0.1, 0.1, 0.11],
        [0.3, 0.092, 0.095, 0.095],
        [0.85, 0.07, 0.07, 0.07],
        [1, 0.068, 0.068, 0.068],
      ],
      shin: [
        [0, 0.07, 0.07, 0.07],
        [0.35, 0.078, 0.075, 0.08],
        [0.7, 0.06, 0.055, 0.058],
        [1, 0.04, 0.038, 0.04],
      ],
      hand: [0.043, 0.048, 0.095],
      foot: [0.19, 0.046],
    },
    { torso: 'top', neck: 'hood', upperArm: 'top', foreArm: 'wrap', hand: 'leather', thigh: 'pants', shin: 'pants', foot: 'leather' },
  );

  // Ankle wraps over the gathered trousers.
  for (const side of ['L', 'R'] as const) {
    const ank = W[`foot${side}`];
    bb.tube({
      material: 'wrap',
      from: v(ank.x, ank.y + 0.17, ank.z),
      to: v(ank.x, ank.y + 0.01, ank.z),
      profile: [
        [0, 0.05, 0.048, 0.05],
        [1, 0.041, 0.039, 0.041],
      ],
      bone: `shin${side}` as BoneName,
      childBlend: [`foot${side}` as BoneName, 0.2],
      radial: 16,
      rings: 6,
      caps: [0.3, 0.3],
      uvScale: [2, 2],
    });
  }

  // Head: skin face, hood over skull, cloth mask over the lower face.
  const headCY = W.head.y + 0.1;
  bb.geometry('skin', headGeometry(0.104, headCY), () => [['head', 1]]);
  const hood = thick(shell(0.118, 0.132, 0.124, [Math.PI / 2 + 0.78, Math.PI * 2 - 1.56], [0, Math.PI * 0.74], 28), 0.006);
  hood.translate(0, headCY + 0.006, 0.0);
  bb.geometry('hood', hood, () => [['head', 1]]);
  const mask = thick(shell(0.112, 0.126, 0.122, [Math.PI / 2 - 1.0, 2.0], [Math.PI * 0.53, Math.PI * 0.27], 24), 0.004);
  mask.translate(0, headCY + 0.004, 0.006);
  bb.geometry('hood', mask, () => [['head', 1]]);
  for (const sx of [1, -1]) {
    const e = new THREE.SphereGeometry(0.008, 12, 8);
    e.scale(1.3, 0.65, 0.6);
    e.translate(sx * 0.034, headCY + 0.02, 0.108);
    bb.geometry('eye', e, () => [['head', 1]]);
    const brow = new THREE.BoxGeometry(0.032, 0.007, 0.01);
    brow.rotateZ(sx * -0.18);
    brow.translate(sx * 0.034, headCY + 0.04, 0.112);
    bb.geometry('hood', brow, () => [['head', 1]]);
  }
  // Cowl around the neck and upper chest.
  const cowl = new THREE.LatheGeometry(
    [v(0.16, -0.08, 0), v(0.15, -0.03, 0), v(0.12, 0.02, 0), v(0.085, 0.07, 0), v(0.075, 0.1, 0)].map((p) => new THREE.Vector2(p.x, p.y)),
    24,
  );
  cowl.scale(1.05, 1, 0.9);
  cowl.translate(0, W.neck.y + 0.02, -0.01);
  bb.geometry('hood', cowl, heightWeights([
    [W.neck.y - 0.05, 'chest'],
    [W.neck.y + 0.1, 'neck'],
  ]));

  // Sash (waist) as a thick torus skinned to the pelvis/spine.
  const sash = new THREE.TorusGeometry(0.15, 0.03, 10, 40);
  sash.rotateX(Math.PI / 2);
  sash.scale(1, 1.6, 0.74);
  sash.translate(0, W.hips.y + 0.07, -0.004);
  bb.geometry('sash', sash, heightWeights([
    [W.hips.y, 'hips'],
    [W.spine.y + 0.04, 'spine'],
  ]));

  const mesh = bb.build({
    top: mats.top,
    pants: mats.pants,
    wrap: mats.wrap,
    leather: mats.leather,
    hood: mats.hood,
    skin: mats.skin,
    sash: mats.sash,
    eye: mats.eye,
  });

  const B = s.bones;
  // Crossed leather chest straps.
  for (const sx of [1, -1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.01), mats.leather);
    strap.position.set(0, 0.08, 0.118);
    strap.rotation.set(-0.12, 0, sx * 0.62);
    addTo(B.chest, strap);
    const back = strap.clone();
    back.position.z = -0.108;
    back.rotation.set(0.12, 0, -sx * 0.62);
    addTo(B.chest, back);
  }
  const buckle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), mats.metal);
  buckle.rotation.x = Math.PI / 2;
  buckle.position.set(0, 0.09, 0.133);
  addTo(B.chest, buckle);
  // Single shoulder guard on the lead (left) arm.
  const pad = new THREE.Mesh(thick(shell(0.085, 0.07, 0.08, [0, Math.PI * 2], [0, Math.PI * 0.42]), 0.006), mats.metal);
  pad.position.set(0.015, 0.035, 0);
  pad.rotation.z = -0.25;
  addTo(B.upperArmL, pad);
  const padLeather = new THREE.Mesh(thick(shell(0.075, 0.06, 0.07, [0, Math.PI * 2], [Math.PI * 0.35, Math.PI * 0.2]), 0.004), mats.leather);
  padLeather.position.copy(pad.position);
  padLeather.rotation.copy(pad.rotation);
  addTo(B.upperArmL, padLeather);
  // Knuckle plates on the gloves.
  for (const side of ['L', 'R'] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.018), mats.metal);
    k.position.set(0, -0.075, 0.045);
    addTo(B[`hand${side}`], k);
  }
  // Leg-wrap ties under the knee.
  for (const side of ['L', 'R'] as const) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 20), mats.wrap);
    tie.rotation.x = Math.PI / 2;
    tie.position.y = -0.12;
    addTo(B[`shin${side}`], tie);
  }

  const root = new THREE.Group();
  root.add(mesh);
  const ribbons: Ribbon[] = [];
  // Sash tails at the back-left hip.
  for (const [dx, len, w] of [
    [0.06, 0.55, 0.07],
    [0.11, 0.45, 0.06],
  ] as const) {
    const r = new Ribbon(B.hips, v(dx, 0.06, -0.12), v(1, 0, 0), v(0.1, -1, -0.25), len, w, mats.sash, 9, 0.5, 0.25);
    r.addCollider(B.thighL, v(0, -0.15, 0), 0.1).addCollider(B.hips, v(0, 0, 0), 0.15);
    ribbons.push(r);
  }
  // Hood tails from the back of the head.
  for (const [dx, len] of [
    [0.025, 0.42],
    [-0.025, 0.36],
  ] as const) {
    const r = new Ribbon(B.head, v(dx, 0.1, -0.1), v(1, 0, 0), v(0, -0.6, -1), len, 0.045, mats.hood, 8, 0.6, 0.18);
    r.addCollider(B.chest, v(0, 0.1, -0.02), 0.17).addCollider(B.neck, v(0, 0.05, 0), 0.08);
    ribbons.push(r);
  }

  const all = Object.values(mats) as THREE.MeshStandardMaterial[];
  return { id: 'phantom', root, skel: s, mesh, ribbons, energy: ENERGY, glowMats: [mats.eye], materials: all };
}

/* ======================================================================== */
/* IRON FANG                                                                 */
/* ======================================================================== */

export function buildIronFang(texSize: number): CharacterModel {
  const s = new Skeleton(IRONFANG_PROPS);
  const bb = new BodyBuilder(s);
  const W = s.bindWorld;
  const ENERGY = new THREE.Color('#ff6a1f');

  const mats = {
    armor: makeMaterial({ color: '#7a7e86', kind: 'metal', repeat: 2, metalness: 1, roughness: 1, normalScale: 0.8 }, texSize),
    dark: makeMaterial({ color: '#34363b', kind: 'metal', repeat: 2, metalness: 0.9, roughness: 1 }, texSize),
    trim: makeMaterial({ color: '#c09858', kind: 'metal', repeat: 3, metalness: 1, roughness: 0.7 }, texSize),
    leather: makeMaterial({ color: '#3a2a20', kind: 'leather', repeat: 4, roughness: 0.8, clearcoat: 0.2 }, texSize),
    skin: makeMaterial({ color: '#6e5040', kind: 'skin', repeat: 2, roughness: 0.6, sheen: '#5a3424', normalScale: 0.3 }, texSize),
    cloth: makeMaterial({ color: '#2e100d', kind: 'fabric', repeat: 6, sheen: '#5a2219', side: THREE.DoubleSide }, texSize),
    under: makeMaterial({ color: '#1e1c1b', kind: 'fabric', repeat: 6, sheen: '#4a4440' }, texSize),
    glow: new THREE.MeshStandardMaterial({ color: '#000000', emissive: ENERGY, emissiveIntensity: 3 }),
  };

  for (const [k, m] of Object.entries(mats)) m.name = k;
  sculptBody(
    bb,
    s,
    {
      torsoY: [0.83, 1.53],
      torso: [
        [0, 0.155, 0.11, 0.12],
        [0.12, 0.19, 0.13, 0.14],
        [0.3, 0.175, 0.13, 0.115],
        [0.55, 0.2, 0.15, 0.13],
        [0.74, 0.225, 0.16, 0.14],
        [0.88, 0.22, 0.12, 0.13],
        [1, 0.09, 0.08, 0.085],
      ],
      neckR: 0.07,
      upperArm: [
        [0, 0.075, 0.075, 0.072],
        [0.3, 0.068, 0.078, 0.066],
        [0.85, 0.052, 0.053, 0.05],
        [1, 0.05, 0.05, 0.05],
      ],
      foreArm: [
        [0, 0.06, 0.06, 0.058],
        [0.3, 0.064, 0.064, 0.06],
        [1, 0.05, 0.048, 0.048],
      ],
      thigh: [
        [0, 0.115, 0.115, 0.125],
        [0.3, 0.105, 0.11, 0.11],
        [0.85, 0.078, 0.078, 0.078],
        [1, 0.075, 0.075, 0.075],
      ],
      shin: [
        [0, 0.08, 0.085, 0.08],
        [0.35, 0.088, 0.088, 0.09],
        [0.75, 0.072, 0.072, 0.07],
        [1, 0.06, 0.06, 0.06],
      ],
      hand: [0.054, 0.058, 0.105],
      foot: [0.21, 0.058],
    },
    { torso: 'under', neck: 'skin', upperArm: 'skin', foreArm: 'armor', hand: 'leather', thigh: 'leather', shin: 'armor', foot: 'dark' },
  );

  // Head: helmet shell over a skinned skull.
  const headCY = W.head.y + 0.1;
  bb.geometry('skin', headGeometry(0.112, headCY), () => [['head', 1]]);
  const mesh = bb.build({
    under: mats.under,
    skin: mats.skin,
    armor: mats.armor,
    leather: mats.leather,
    dark: mats.dark,
  });
  const B = s.bones;
  const hc = headCY - W.head.y;

  // Helmet with an open T-shaped face and a fanged lower mask.
  const helm = new THREE.Mesh(thick(shell(0.13, 0.142, 0.138, [Math.PI / 2 + 0.6, Math.PI * 2 - 1.2], [0, Math.PI * 0.68], 28), 0.009), mats.armor);
  helm.position.set(0, hc + 0.012, 0.004);
  addTo(B.head, helm);
  const brim = new THREE.Mesh(thick(shell(0.133, 0.145, 0.142, [Math.PI / 2 - 0.62, 1.24], [Math.PI * 0.12, Math.PI * 0.2], 20), 0.009), mats.armor);
  brim.position.set(0, hc + 0.012, 0.004);
  addTo(B.head, brim);
  const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.075, 0.016), mats.trim);
  nasal.position.set(0, hc + 0.01, 0.138);
  nasal.rotation.x = -0.12;
  addTo(B.head, nasal);
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.26), mats.trim);
  crest.position.set(0, hc + 0.14, -0.01);
  addTo(B.head, crest);
  const guard = new THREE.Mesh(thick(shell(0.122, 0.13, 0.135, [Math.PI / 2 - 0.95, 1.9], [Math.PI * 0.56, Math.PI * 0.26], 22), 0.007), mats.dark);
  guard.position.set(0, hc + 0.004, 0.006);
  addTo(B.head, guard);
  for (let i = -3; i <= 3; i++) {
    const long = i === -2 || i === 2;
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.008, long ? 0.04 : 0.022, 6), mats.trim);
    const a = i * 0.15;
    fang.position.set(Math.sin(a) * 0.128, hc - 0.032 - (long ? 0.01 : 0), Math.cos(a) * 0.13);
    fang.rotation.x = Math.PI;
    addTo(B.head, fang, false);
  }
  for (const sx of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), mats.glow);
    eye.scale.set(1.4, 0.6, 0.6);
    eye.position.set(sx * 0.036, hc + 0.022, 0.108);
    addTo(B.head, eye, false);
  }

  // Breastplate + back plate.
  const chestY = 0.08;
  const breast = new THREE.Mesh(thick(shell(0.245, 0.24, 0.19, [-Math.PI * 0.04, Math.PI * 1.08], [Math.PI * 0.27, Math.PI * 0.46], 28), 0.012), mats.armor);
  breast.position.set(0, chestY, -0.012);
  addTo(B.chest, breast);
  const backPlate = new THREE.Mesh(thick(shell(0.24, 0.21, 0.16, [Math.PI * 1.05, Math.PI * 0.9], [Math.PI * 0.2, Math.PI * 0.5], 24), 0.01), mats.dark);
  backPlate.position.set(0, chestY, -0.01);
  addTo(B.chest, backPlate);
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), mats.trim);
  sternum.position.set(0, chestY - 0.02, 0.172);
  sternum.rotation.x = -0.15;
  addTo(B.chest, sternum);
  // Abdomen lamellar bands.
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(thick(shell(0.2 - i * 0.005, 0.05, 0.15, [Math.PI * 0.05, Math.PI * 0.9], [Math.PI * 0.35, Math.PI * 0.3], 20), 0.006), i % 2 ? mats.dark : mats.armor);
    band.position.set(0, 0.06 - i * 0.055, 0.0);
    addTo(B.spine, band);
  }
  // Belt with bronze buckle.
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 40), mats.leather);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.78, 1.8);
  belt.position.set(0, 0.05, 0);
  addTo(B.hips, belt);
  const buckle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 6), mats.trim);
  buckle.rotation.x = Math.PI / 2;
  buckle.position.set(0, 0.05, 0.155);
  addTo(B.hips, buckle);

  // Pauldrons: three layered plates per shoulder.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(thick(shell(0.13 - i * 0.012, 0.09, 0.12 - i * 0.01, [0, Math.PI * 2], [0, Math.PI * 0.45]), 0.008), i === 0 ? mats.armor : i === 1 ? mats.dark : mats.armor);
      p.position.set(sx * (0.02 + i * 0.012), 0.06 - i * 0.05, 0);
      p.rotation.z = sx * -(0.35 + i * 0.12);
      addTo(B[`upperArm${side}`], p);
    }
    // Gauntlet cuff + knuckle plate.
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.064, 0.07, 16), mats.trim);
    cuff.position.y = -0.03;
    addTo(B[`foreArm${side}`], cuff);
    const cuff2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.056, 0.04, 16), mats.dark);
    cuff2.position.y = -0.235;
    addTo(B[`foreArm${side}`], cuff2);
    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.03), mats.armor);
    knuckles.position.set(0, -0.08, 0.055);
    addTo(B[`hand${side}`], knuckles);
    // Knee guard.
    const kg = new THREE.Mesh(thick(shell(0.08, 0.09, 0.07, [Math.PI * 0.1, Math.PI * 0.8], [0.2, Math.PI * 0.75]), 0.008), mats.armor);
    kg.position.set(0, -0.02, 0.035);
    addTo(B[`shin${side}`], kg);
    // Tasset plates on the thighs.
    const tas = new THREE.Mesh(thick(shell(0.12, 0.14, 0.12, [Math.PI * 0.15, Math.PI * 0.7], [Math.PI * 0.3, Math.PI * 0.25]), 0.008), mats.dark);
    tas.position.set(sx * 0.015, -0.01, 0.0);
    addTo(B[`thigh${side}`], tas);
    // Boot cuffs.
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.07, 0.09, 16), mats.trim);
    boot.position.y = -0.36;
    addTo(B[`shin${side}`], boot);
  }
  // Padded gorget collar.
  const collarMat = makeMaterial({ color: '#2a2420', kind: 'leather', repeat: 3, roughness: 0.85 }, texSize);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 10, 32), collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1.15, 1, 1);
  collar.position.set(0, 0.2, -0.005);
  addTo(B.chest, collar);
  const gorget = new THREE.Mesh(thick(shell(0.17, 0.08, 0.15, [0, Math.PI * 2], [Math.PI * 0.3, Math.PI * 0.2], 24), 0.008), mats.armor);
  gorget.position.set(0, 0.19, -0.005);
  addTo(B.chest, gorget);

  const root = new THREE.Group();
  root.add(mesh);
  const ribbons: Ribbon[] = [];
  // Tabard: front and back cloth hanging from the belt.
  const front = new Ribbon(B.hips, v(0, 0.02, 0.17), v(1, 0, 0), v(0, -1, 0.15), 0.5, 0.17, mats.cloth, 8, 0.75, 0.35);
  front.addCollider(B.thighL, v(0, -0.12, 0.02), 0.12).addCollider(B.thighR, v(0, -0.12, 0.02), 0.12);
  const backT = new Ribbon(B.hips, v(0, 0.02, -0.16), v(1, 0, 0), v(0, -1, -0.15), 0.55, 0.2, mats.cloth, 8, 0.75, 0.35);
  backT.addCollider(B.thighL, v(0, -0.12, -0.02), 0.13).addCollider(B.thighR, v(0, -0.12, -0.02), 0.13);
  ribbons.push(front, backT);

  const all = [...(Object.values(mats) as THREE.MeshStandardMaterial[]), collarMat];
  return { id: 'ironfang', root, skel: s, mesh, ribbons, energy: ENERGY, glowMats: [mats.glow], materials: all };
}

/**
 * Merge rigid accessory meshes that share a bone and material into a single
 * draw call (armour plates, straps, buckles...). Cuts per-pass draw calls a lot.
 */
function mergeAccessories(skel: Skeleton): void {
  for (const bone of skel.list) {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of bone.children) {
      if (!(c instanceof THREE.Mesh) || c instanceof THREE.SkinnedMesh || Array.isArray(c.material)) continue;
      const arr = groups.get(c.material) ?? [];
      arr.push(c);
      groups.set(c.material, arr);
    }
    for (const [mat, meshes] of groups) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => {
        m.updateMatrix();
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        g.deleteAttribute('uv');
        return g;
      });
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      for (const m of meshes) bone.remove(m);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = meshes.some((m) => m.castShadow);
      mesh.receiveShadow = true;
      bone.add(mesh);
    }
  }
}

/** Alternate costume colours (mirror matches use these for player 2). */
const ALT: Record<CharacterId, { energy: string; colors: Record<string, string> }> = {
  phantom: { energy: '#ff3d5e', colors: { sash: '#123247', top: '#262020', hood: '#1a1414' } },
  ironfang: { energy: '#ffcf3a', colors: { cloth: '#18261a', trim: '#9aa0aa', armor: '#5e5a52' } },
};

export function buildCharacter(id: CharacterId, texSize: number, alt = false): CharacterModel {
  const m = id === 'phantom' ? buildPhantom(texSize) : buildIronFang(texSize);
  mergeAccessories(m.skel);
  if (alt) {
    const a = ALT[id];
    m.energy = new THREE.Color(a.energy);
    for (const mat of m.materials) {
      const c = a.colors[mat.name];
      if (c) mat.color.set(c);
    }
    for (const g of m.glowMats) g.emissive.copy(m.energy);
  }
  return m;
}

/* ======================================================================== */
/* CUSTOM FIGHTER ("SEN")                                                    */
/* ======================================================================== */

const scaleProfile = (keys: ProfileKey[], kx: number, kz: number): ProfileKey[] => keys.map(([t, x, f, b]) => [t, x * kx, f * kz, b * kz]);

/**
 * The player's own fighter: a body sculpted from the player's build and height,
 * their photo mapped onto the face, and clothing/skin/hair colours picked from
 * their photo. Uses the chosen fighting style's move set and animations.
 */
export function buildCustom(p: CustomProfile, texSize: number, alt = false): CharacterModel {
  const b = Math.min(1.3, Math.max(0.85, p.build));
  const props: Proportions = { ...PHANTOM_PROPS, shoulderX: 0.165 + (b - 1) * 0.12, hipX: 0.095 + (b - 1) * 0.04 };
  const s = new Skeleton(props);
  const bb = new BodyBuilder(s);
  const W = s.bindWorld;
  const ENERGY = new THREE.Color(p.style === 'ironfang' ? '#ff6a1f' : '#8a6bff');
  if (alt) ENERGY.set(p.style === 'ironfang' ? '#ffcf3a' : '#ff3d5e');

  const faceTex = p.face ? new THREE.TextureLoader().load(p.face) : null;
  if (faceTex) faceTex.colorSpace = THREE.SRGBColorSpace;
  const mats = {
    skin: makeMaterial({ color: p.skin, kind: 'skin', repeat: 2, roughness: 0.6, normalScale: 0.2 }, texSize),
    top: makeMaterial({ color: p.top, kind: 'fabric', repeat: 6, sheen: '#ffffff' }, texSize),
    pants: makeMaterial({ color: p.pants, kind: 'fabric', repeat: 6, sheen: '#ffffff' }, texSize),
    shoes: makeMaterial({ color: p.shoes, kind: 'leather', repeat: 4, roughness: 0.7, clearcoat: 0.2 }, texSize),
    hair: makeMaterial({ color: p.hair, kind: 'fabric', repeat: 10, roughness: 0.8, sheen: p.hair, side: THREE.DoubleSide }, texSize),
    face: new THREE.MeshStandardMaterial({
      map: faceTex,
      color: '#ffffff',
      roughness: 0.62,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      visible: !!faceTex,
    }),
  };
  (mats.top.sheenColor as THREE.Color).set(p.top).multiplyScalar(1.6);
  (mats.pants.sheenColor as THREE.Color).set(p.pants).multiplyScalar(1.6);
  for (const [k, m] of Object.entries(mats)) m.name = k;

  sculptBody(
    bb,
    s,
    {
      torsoY: [0.84, 1.52],
      torso: scaleProfile(
        [
          [0, 0.14, 0.1, 0.11],
          [0.12, 0.165, 0.11, 0.13],
          [0.3, 0.14, 0.1, 0.095],
          [0.55, 0.162, 0.118, 0.105],
          [0.74, 0.182, 0.13, 0.115],
          [0.88, 0.18, 0.1, 0.105],
          [1, 0.075, 0.065, 0.07],
        ],
        b,
        0.2 + b * 0.8,
      ),
      neckR: 0.052 * (0.3 + b * 0.7),
      upperArm: scaleProfile(
        [
          [0, 0.058, 0.06, 0.056],
          [0.25, 0.052, 0.058, 0.05],
          [0.85, 0.042, 0.043, 0.042],
          [1, 0.04, 0.04, 0.04],
        ],
        b,
        b,
      ),
      foreArm: scaleProfile(
        [
          [0, 0.042, 0.044, 0.042],
          [0.25, 0.046, 0.046, 0.043],
          [1, 0.032, 0.03, 0.03],
        ],
        b,
        b,
      ),
      thigh: scaleProfile(
        [
          [0, 0.1, 0.1, 0.11],
          [0.3, 0.092, 0.095, 0.095],
          [0.85, 0.07, 0.07, 0.07],
          [1, 0.068, 0.068, 0.068],
        ],
        b,
        b,
      ),
      shin: scaleProfile(
        [
          [0, 0.07, 0.07, 0.07],
          [0.35, 0.078, 0.075, 0.08],
          [0.7, 0.06, 0.055, 0.058],
          [1, 0.04, 0.038, 0.04],
        ],
        b,
        b,
      ),
      hand: [0.043 * b, 0.048 * b, 0.095],
      foot: [0.19, 0.046 * b],
    },
    {
      torso: 'top',
      neck: 'skin',
      upperArm: p.sleeves ? 'top' : 'skin',
      foreArm: p.sleeves ? 'top' : 'skin',
      hand: 'skin',
      thigh: 'pants',
      shin: 'pants',
      foot: 'shoes',
    },
  );
  // Trousers up to the waist, over the bottom of the shirt.
  bb.tube({
    material: 'pants',
    from: v(0, 0.82, 0),
    to: v(0, W.hips.y + 0.07, 0),
    profile: scaleProfile(
      [
        [0, 0.15, 0.106, 0.118],
        [0.3, 0.172, 0.116, 0.136],
        [0.75, 0.16, 0.11, 0.115],
        [1, 0.15, 0.108, 0.104],
      ],
      b,
      0.2 + b * 0.8,
    ),
    bone: 'hips',
    weights: heightWeights([
      [W.hips.y - 0.04, 'hips'],
      [W.spine.y + 0.04, 'spine'],
    ]),
    radial: 28,
    rings: 8,
    caps: [0.5, 0],
  });
  if (!p.sleeves) {
    // Short sleeves over the upper arm.
    for (const side of ['L', 'R'] as const) {
      const sh = W[`upperArm${side}`];
      bb.tube({
        material: 'top',
        from: v(sh.x, sh.y + 0.04, sh.z),
        to: v(sh.x, sh.y - 0.12, sh.z),
        profile: [
          [0, 0.066 * b, 0.068 * b, 0.064 * b],
          [1, 0.06 * b, 0.064 * b, 0.058 * b],
        ],
        bone: `upperArm${side}` as BoneName,
        parentBlend: [`clav${side}` as BoneName, 0.3],
        radial: 18,
        rings: 4,
        caps: [0.6, 0.15],
      });
    }
  }

  // Head, photo face and hair.
  const headCY = W.head.y + 0.1;
  const r = 0.104;
  bb.geometry('skin', headGeometry(r, headCY), () => [['head', 1]]);
  if (faceTex) {
    const plate = headGeometry(r, headCY, [Math.PI / 2 - 1.0, 2.0], [Math.PI * 0.2, Math.PI * 0.56]);
    // Lift the plate just above the skin and project the photo planarly from the front.
    const pos = plate.getAttribute('position');
    const uv = plate.getAttribute('uv');
    const c = new THREE.Vector3(0, headCY, 0.005);
    const t = new THREE.Vector3();
    plate.computeBoundingBox();
    const bbx = plate.boundingBox!;
    for (let i = 0; i < pos.count; i++) {
      t.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1.025).add(c);
      pos.setXYZ(i, t.x, t.y, t.z);
      uv.setXY(i, (t.x - bbx.min.x) / (bbx.max.x - bbx.min.x), (t.y - bbx.min.y) / (bbx.max.y - bbx.min.y));
    }
    bb.geometry('face', plate, () => [['head', 1]]);
  }
  if (p.hairStyle !== 'bald') {
    const cap = thick(shell(0.112, 0.128, 0.122, [0, Math.PI * 2], [0, Math.PI * 0.3], 28), 0.006);
    cap.translate(0, headCY + 0.012, -0.004);
    bb.geometry('hair', cap, () => [['head', 1]]);
    const back = thick(shell(0.114, 0.13, 0.124, [Math.PI / 2 + 0.95, Math.PI * 2 - 1.9], [Math.PI * 0.25, Math.PI * (p.hairStyle === 'long' ? 0.45 : 0.32)], 24), 0.006);
    back.translate(0, headCY + 0.008, -0.004);
    bb.geometry('hair', back, () => [['head', 1]]);
  }

  const mesh = bb.build({ skin: mats.skin, top: mats.top, pants: mats.pants, shoes: mats.shoes, hair: mats.hair, face: mats.face });
  const root = new THREE.Group();
  root.add(mesh);
  const ribbons: Ribbon[] = [];
  if (p.hairStyle === 'long') {
    const tail = new Ribbon(s.bones.head, v(0, 0.06, -0.11), v(1, 0, 0), v(0, -1, -0.2), 0.32, 0.14, mats.hair, 7, 0.6, 0.3);
    tail.addCollider(s.bones.chest, v(0, 0.1, -0.02), 0.17);
    ribbons.push(tail);
  }
  return {
    id: p.style,
    root,
    skel: s,
    mesh,
    ribbons,
    energy: ENERGY,
    glowMats: [],
    materials: Object.values(mats) as THREE.MeshStandardMaterial[],
  };
}

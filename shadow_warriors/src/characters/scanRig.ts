import * as THREE from 'three';
import { PHANTOM_PROPS, type CharacterModel } from './appearance';
import type { CustomProfile } from './profile';
import { BONE_NAMES, Skeleton, type BoneName } from './Rig';
import type { ScanData } from './scan';

/*
 * Automatic rigging for a 3D body scan. The skeleton is fitted to the scan
 * (arm and leg directions are measured from the mesh, so A-pose and T-pose
 * scans both work), then every vertex is bound to its nearest bones with
 * smooth inverse-distance weights. The fighter's normal animation clips
 * then drive the scanned body.
 */

const DOWN = new THREE.Vector3(0, -1, 0);

interface Seg {
  bone: BoneName;
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Approximate flesh radius around the bone. */
  r: number;
  /** Which side of the body (+1 left, -1 right, 0 centre). */
  side: number;
}

const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3): number => {
  const ab = tmp.subVectors(b, a);
  const t = Math.max(0, Math.min(1, ab.dot(new THREE.Vector3().subVectors(p, a)) / Math.max(1e-8, ab.lengthSq())));
  return p.distanceTo(ab.multiplyScalar(t).add(a));
};

export function buildScanModel(d: ScanData, p: CustomProfile, alt = false): CharacterModel {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.positions), 3));
  if (d.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(d.uvs), 2));
  if (d.colors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(d.colors), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(d.index), 1));
  for (const g of d.groups) geo.addGroup(g.start, g.count, g.material);
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();

  // --- Fit the skeleton -------------------------------------------------
  const arm: Record<'L' | 'R', { dir: THREE.Vector3; len: number }> = {
    L: { dir: new THREE.Vector3(0.12, -1, 0).normalize(), len: 0.64 },
    R: { dir: new THREE.Vector3(-0.12, -1, 0).normalize(), len: 0.64 },
  };
  const shoulderY = PHANTOM_PROPS.hipsY + PHANTOM_PROPS.spine + PHANTOM_PROPS.chest + PHANTOM_PROPS.clavY;
  const shoulderX = PHANTOM_PROPS.clavX + PHANTOM_PROPS.shoulderX;
  for (const [side, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const sh = new THREE.Vector3(sx * shoulderX, shoulderY, 0);
    let best = 0;
    const tip = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.x * sx < 0.26 || v.y < 0.5 || v.y > 1.65) continue;
      const dd = v.distanceTo(sh);
      if (dd > best) {
        best = dd;
        tip.copy(v);
      }
    }
    if (best > 0.4 && best < 1.0) arm[side] = { dir: tip.clone().sub(sh).normalize(), len: best };
  }
  const ankles: Record<'L' | 'R', THREE.Vector3> = { L: new THREE.Vector3(0.1, 0.07, 0), R: new THREE.Vector3(-0.1, 0.07, 0) };
  for (const [side, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    let x = 0;
    let z = 0;
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y > 0.1 || v.x * sx < 0.01) continue;
      x += v.x;
      z += v.z;
      n++;
    }
    if (n) ankles[side].set(x / n, 0.07, z / n - 0.05);
  }

  const props = {
    ...PHANTOM_PROPS,
    upperArm: (arm.L.len + arm.R.len) * 0.5 * 0.44,
    foreArm: (arm.L.len + arm.R.len) * 0.5 * 0.4,
  };
  const skel = new Skeleton(props);
  const B = skel.bones;
  for (const side of ['L', 'R'] as const) {
    B[`upperArm${side}`].quaternion.setFromUnitVectors(DOWN, arm[side].dir);
    const hip = skel.bindWorld[`thigh${side}`];
    B[`thigh${side}`].quaternion.setFromUnitVectors(DOWN, ankles[side].clone().sub(hip).normalize());
  }
  const holder = new THREE.Group();
  holder.add(B.hips);
  holder.updateMatrixWorld(true);
  const W = {} as Record<BoneName, THREE.Vector3>;
  for (const n of BONE_NAMES) W[n] = B[n].getWorldPosition(new THREE.Vector3());

  // --- Skin weights -------------------------------------------------------
  const up = (x: THREE.Vector3, dy: number) => x.clone().add(new THREE.Vector3(0, dy, 0));
  const segs: Seg[] = [
    { bone: 'hips', a: W.hips, b: up(W.hips, -0.13), r: 0.12, side: 0 },
    { bone: 'spine', a: W.spine, b: W.chest, r: 0.12, side: 0 },
    { bone: 'chest', a: W.chest, b: W.neck, r: 0.13, side: 0 },
    { bone: 'neck', a: W.neck, b: W.head, r: 0.05, side: 0 },
    { bone: 'head', a: W.head, b: up(W.head, 0.2), r: 0.09, side: 0 },
  ];
  for (const [side, sx] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const handEnd = W[`hand${side}`].clone().addScaledVector(arm[side].dir, arm[side].len * 0.16);
    segs.push(
      { bone: `clav${side}` as BoneName, a: W[`clav${side}`], b: W[`upperArm${side}`], r: 0.05, side: sx },
      { bone: `upperArm${side}` as BoneName, a: W[`upperArm${side}`], b: W[`foreArm${side}`], r: 0.045, side: sx },
      { bone: `foreArm${side}` as BoneName, a: W[`foreArm${side}`], b: W[`hand${side}`], r: 0.038, side: sx },
      { bone: `hand${side}` as BoneName, a: W[`hand${side}`], b: handEnd, r: 0.03, side: sx },
      { bone: `thigh${side}` as BoneName, a: W[`thigh${side}`], b: W[`shin${side}`], r: 0.075, side: sx },
      { bone: `shin${side}` as BoneName, a: W[`shin${side}`], b: W[`foot${side}`], r: 0.05, side: sx },
      { bone: `foot${side}` as BoneName, a: W[`foot${side}`], b: W[`foot${side}`].clone().add(new THREE.Vector3(0, -0.05, 0.16)), r: 0.035, side: sx },
    );
  }
  const isArm = (b: BoneName) => /^(clav|upperArm|foreArm|hand)/.test(b);
  const isLeg = (b: BoneName) => /^(thigh|shin|foot)/.test(b);
  const idx = new Uint16Array(pos.count * 4);
  const wts = new Float32Array(pos.count * 4);
  const tmp = new THREE.Vector3();
  const cand: [number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    cand.length = 0;
    for (const s of segs) {
      // Keep left/right limbs and head/legs from bleeding into each other.
      if (s.side !== 0 && v.x * s.side < (isArm(s.bone) ? 0.06 : -0.015)) continue;
      if (isLeg(s.bone) && v.y > W.hips.y + 0.05) continue;
      if ((s.bone === 'head' || s.bone === 'neck') && v.y < W.chest.y + 0.12) continue;
      const dist = Math.max(0, segDist(v, s.a, s.b, tmp) - s.r) + 0.012;
      cand.push([skel.index[s.bone], 1 / Math.pow(dist, 4)]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    let sum = 0;
    for (let k = 0; k < 4 && k < cand.length; k++) sum += cand[k][1];
    for (let k = 0; k < 4; k++) {
      const c = cand[k];
      idx[i * 4 + k] = c ? c[0] : 0;
      wts[i * 4 + k] = c && sum > 0 ? c[1] / sum : k === 0 ? 1 : 0;
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));

  // --- Materials ----------------------------------------------------------
  const mats = d.materials.map((m, i) => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, vertexColors: !!d.colors });
    mat.name = `scan${i}`;
    if (m.texture) {
      const url = URL.createObjectURL(m.texture);
      const tex = new THREE.TextureLoader().load(url, () => URL.revokeObjectURL(url));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = m.flipY ?? true;
      mat.map = tex;
    } else if (!d.colors) mat.color.setRGB(...m.color);
    return mat;
  });
  if (!mats.length) mats.push(new THREE.MeshStandardMaterial({ color: '#b0a090', roughness: 0.7 }));
  if (!geo.groups.length) geo.addGroup(0, d.index.length, 0);

  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.add(B.hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(skel.list));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const energy = new THREE.Color(p.style === 'ironfang' ? (alt ? '#ffcf3a' : '#ff6a1f') : alt ? '#ff3d5e' : '#8a6bff');
  const root = new THREE.Group();
  root.add(mesh);
  return { id: p.style, root, skel, mesh, ribbons: [], energy, glowMats: [], materials: mats };
}

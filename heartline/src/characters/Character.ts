import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp } from '../core/rng';
import type { Expression } from '../narrative/types';
import { mat, physical } from '../world/kit';
import { fabric, skin as skinTex } from '../world/textures';
import type { Look, Outfit } from './cast';

/**
 * Procedural humanoid with a hierarchical rig and an expressive face rig. Built from primitive
 * meshes (no external models). It faces +Z; its left is +X.
 */

export type Pose = 'idle' | 'walk' | 'sit' | 'lie' | 'bedSit' | 'phone' | 'wash' | 'drink' | 'surgeon' | 'drive' | 'dress' | 'type' | 'cross';

interface FaceParams {
  brow: number; // raise -1..1
  browInner: number; // inner raise (worry) -1..1
  lid: number; // 1 open .. 0 closed
  smile: number; // -1 frown .. 1 smile
  open: number; // mouth open 0..1
  squint: number;
  wrinkle: number;
}

const EXPR: Record<Expression, FaceParams> = {
  neutral: { brow: 0, browInner: 0, lid: 0.85, smile: 0.05, open: 0, squint: 0, wrinkle: 0.1 },
  sleep: { brow: -0.1, browInner: 0, lid: 0, smile: 0, open: 0.05, squint: 0, wrinkle: 0 },
  drowsy: { brow: -0.2, browInner: 0.1, lid: 0.35, smile: 0, open: 0.05, squint: 0.2, wrinkle: 0.1 },
  worried: { brow: 0.25, browInner: 0.8, lid: 0.9, smile: -0.35, open: 0.05, squint: 0, wrinkle: 0.7 },
  alarmed: { brow: 0.9, browInner: 0.6, lid: 1.0, smile: -0.2, open: 0.35, squint: 0, wrinkle: 0.9 },
  focused: { brow: -0.35, browInner: -0.2, lid: 0.75, smile: -0.1, open: 0, squint: 0.4, wrinkle: 0.4 },
  sad: { brow: -0.1, browInner: 0.9, lid: 0.6, smile: -0.6, open: 0, squint: 0, wrinkle: 0.5 },
  smile: { brow: 0.2, browInner: 0, lid: 0.75, smile: 0.9, open: 0.1, squint: 0.4, wrinkle: 0.2 },
  angry: { brow: -0.7, browInner: -0.8, lid: 0.85, smile: -0.5, open: 0.05, squint: 0.5, wrinkle: 0.6 },
  tired: { brow: -0.1, browInner: 0.3, lid: 0.55, smile: -0.15, open: 0, squint: 0.1, wrinkle: 0.4 },
  relieved: { brow: 0.3, browInner: 0.2, lid: 0.7, smile: 0.45, open: 0.05, squint: 0.2, wrinkle: 0.2 },
};

const OUTFITS: Record<Outfit, { top: number; bottom: number; shoe: number; topPat?: 'stripe' | 'check' | 'dots' | 'knit'; accent?: number; long?: number; longColor?: number }> = {
  pajamas: { top: 0x2c3e64, bottom: 0x2c3e64, shoe: 0x5a4a3c, topPat: 'stripe', accent: 0x8fa3c8 },
  nightgown: { top: 0x9c88b8, bottom: 0x9c88b8, shoe: 0xd8c8c0, long: 0.85, longColor: 0x9c88b8 },
  shirt: { top: 0xb9cfe6, bottom: 0x2b2f3a, shoe: 0x2a1c14, topPat: 'check', accent: 0xffffff },
  casual: { top: 0x6b4f3a, bottom: 0x2f3e5c, shoe: 0x3a3a3a, topPat: 'knit' },
  scrubs: { top: 0x2f7f86, bottom: 0x2f7f86, shoe: 0xeeeeee },
  nurse: { top: 0x26386a, bottom: 0x26386a, shoe: 0xf0f0f0 },
  coat: { top: 0xdedede, bottom: 0x353a45, shoe: 0x241a12, long: 0.95, longColor: 0xf3f3f1 },
  guard: { top: 0x1f2633, bottom: 0x1f2633, shoe: 0x111111 },
  gown: { top: 0x9fc2d6, bottom: 0x9fc2d6, shoe: 0xcccccc, topPat: 'dots', accent: 0xffffff, long: 0.6, longColor: 0x9fc2d6 },
  suit: { top: 0x30343c, bottom: 0x30343c, shoe: 0x141010 },
};

type Joint = THREE.Object3D;

export class Character {
  readonly root = new THREE.Group();
  readonly look: Look;
  private s: number;
  private j: Record<string, Joint> = {};
  private target: Record<string, THREE.Vector3> = {};
  private mats: { top: THREE.MeshStandardMaterial; bottom: THREE.MeshStandardMaterial; shoe: THREE.MeshStandardMaterial; long?: THREE.MeshStandardMaterial };
  private skinMat: THREE.MeshStandardMaterial;
  private shoes: THREE.Mesh[] = [];
  private face: {
    lids: THREE.Object3D[];
    eyes: THREE.Object3D[];
    brows: THREE.Object3D[];
    mouthInner: THREE.Mesh;
    lipU: THREE.Object3D[];
    lipL: THREE.Object3D[];
    corners: THREE.Object3D[];
    cheeks: THREE.Object3D[];
    wrinkles: THREE.MeshBasicMaterial;
    jaw: THREE.Object3D;
  };
  private fp: FaceParams = { ...EXPR.neutral };
  expression: Expression = 'neutral';
  pose: Pose = 'idle';
  speed = 0;
  talking = false;
  private phase = 0;
  private blinkT = 2;
  private blink = 0;
  private time = Math.random() * 10;
  private longMesh: THREE.Mesh | null = null;
  private gear: { cap?: THREE.Object3D; mask?: THREE.Object3D; phone?: THREE.Object3D } = {};
  /** Optional world-space point the head turns toward. */
  lookAt: THREE.Vector3 | null = null;
  headTurn = 0;

  constructor(look: Look) {
    this.look = look;
    this.s = look.height / 1.75;
    const o = OUTFITS[look.outfit];
    this.skinMat = physical(0xffffff, { map: skinTex(look.skin), roughness: 0.58, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffd8c8) });
    this.mats = {
      top: mat(0xffffff, { map: fabric(o.top, o.topPat ?? 'plain', o.accent ?? 0xffffff), roughness: 0.9 }),
      bottom: mat(0xffffff, { map: fabric(o.bottom, 'plain'), roughness: 0.9 }),
      shoe: mat(o.shoe, { roughness: 0.45 }),
    };
    this.face = this.build();
    this.setOutfit(look.outfit);
    this.root.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  private joint(name: string, parent: Joint, x: number, y: number, z: number): Joint {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    this.j[name] = o;
    this.target[name] = new THREE.Vector3();
    return o;
  }

  private limb(parent: Joint, r: number, len: number, m: THREE.Material, scaleZ = 1) {
    const g = new THREE.CapsuleGeometry(r, len, 4, 12);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = -len / 2 - r * 0.3;
    mesh.scale.z = scaleZ;
    parent.add(mesh);
    return mesh;
  }

  private build() {
    const s = this.s;
    const L = this.look;
    const fem = !!L.female;
    const b = L.build;
    const skinM = this.skinMat;
    const hips = this.joint('hips', this.root, 0, 0.95 * s, 0);
    const spine = this.joint('spine', hips, 0, 0.1 * s, 0);
    const chest = this.joint('chest', spine, 0, 0.17 * s, 0);
    const neck = this.joint('neck', chest, 0, 0.27 * s, 0);
    const head = this.joint('head', neck, 0, 0.07 * s, 0);

    // Pelvis and torso
    const pelvis = new THREE.Mesh(new RoundedBoxGeometry(0.31 * b * (fem ? 1.08 : 1), 0.18, 0.2 * b, 3, 0.07), this.mats.bottom);
    pelvis.scale.setScalar(s);
    hips.add(pelvis);
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.08, 4, 14), this.mats.top);
    belly.scale.set(1.18 * b * (fem ? 0.92 : 1), 1, 0.8 * b * (L.age > 45 && !fem ? 1.12 : 1));
    belly.scale.multiplyScalar(s);
    belly.position.y = 0.04 * s;
    spine.add(belly);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.14, 4, 16), this.mats.top);
    torso.scale.set(1.22 * b * (fem ? 0.88 : 1), 1, 0.74 * b);
    torso.scale.multiplyScalar(s);
    torso.position.y = 0.13 * s;
    chest.add(torso);
    const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.11, 12), skinM);
    neckM.scale.setScalar(s);
    neckM.position.y = 0.01 * s;
    neck.add(neckM);
    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), this.mats.top);
    collar.rotation.x = Math.PI / 2;
    collar.scale.setScalar(s);
    collar.position.y = -0.02 * s;
    neck.add(collar);

    // Arms
    const shX = (fem ? 0.165 : 0.19) * b * s;
    for (const [side, sx] of [
      ['L', 1],
      ['R', -1],
    ] as const) {
      const sh = this.joint('shoulder' + side, chest, sx * shX, 0.22 * s, 0);
      const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.058 * b, 12, 10), this.mats.top);
      shoulderBall.scale.setScalar(s);
      sh.add(shoulderBall);
      this.limb(sh, 0.046 * b * s, 0.21 * s, this.mats.top);
      const fore = this.joint('fore' + side, sh, 0, -0.28 * s, 0);
      this.limb(fore, 0.038 * b * s, 0.19 * s, this.look.outfit === 'pajamas' || this.look.outfit === 'nightgown' || this.look.outfit === 'coat' || this.look.outfit === 'suit' || this.look.outfit === 'shirt' || this.look.outfit === 'casual' || this.look.outfit === 'guard' ? this.mats.top : skinM);
      const hand = this.joint('hand' + side, fore, 0, -0.26 * s, 0);
      const palm = new THREE.Mesh(new RoundedBoxGeometry(0.066, 0.08, 0.028, 2, 0.012), skinM);
      palm.scale.setScalar(s);
      palm.position.y = -0.045 * s;
      hand.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 3, 6), skinM);
      thumb.position.set(sx * 0.038 * s, -0.035 * s, 0.012 * s);
      thumb.rotation.z = sx * 0.6;
      hand.add(thumb);
      const fingers = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.045, 0.022, 2, 0.01), skinM);
      fingers.scale.setScalar(s);
      fingers.position.y = -0.105 * s;
      fingers.rotation.x = 0.25;
      hand.add(fingers);
    }

    // Legs
    for (const [side, sx] of [
      ['L', 1],
      ['R', -1],
    ] as const) {
      const th = this.joint('thigh' + side, hips, sx * 0.09 * b * s, -0.05 * s, 0);
      this.limb(th, 0.072 * b * s, 0.32 * s, this.mats.bottom);
      const shin = this.joint('shin' + side, th, 0, -0.43 * s, 0);
      this.limb(shin, 0.055 * b * s, 0.33 * s, this.mats.bottom);
      const foot = this.joint('foot' + side, shin, 0, -0.43 * s, 0);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.25, 2, 0.03), this.mats.shoe);
      shoe.scale.setScalar(s);
      shoe.position.set(0, -0.045 * s, 0.05 * s);
      foot.add(shoe);
      this.shoes.push(shoe);
    }

    return this.buildFace(head);
  }

  private buildFace(head: Joint) {
    const s = this.s;
    const L = this.look;
    const fem = !!L.female;
    const skinM = this.skinMat;
    const hairM = mat(L.hair, { roughness: 0.85 });
    const g = new THREE.Group();
    g.scale.setScalar(s);
    head.add(g);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 22), skinM);
    skull.scale.set(fem ? 0.84 : 0.87, 1.13, 0.98);
    skull.position.y = 0.115;
    g.add(skull);
    const jaw = new THREE.Object3D();
    jaw.position.set(0, 0.085, 0.0);
    g.add(jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.072, 22, 16), skinM);
    chin.scale.set(fem ? 0.84 : 0.93, 0.8, 0.98);
    chin.position.set(0, -0.035, 0.02);
    jaw.add(chin);

    const nose = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, 0.026, 4, 8), skinM);
    nose.position.set(0, 0.104, 0.094);
    nose.rotation.x = 0.38;
    nose.scale.set(1, 1, 0.8);
    g.add(nose);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 12, 10), skinM);
    tip.scale.set(1.25, 0.9, 0.9);
    tip.position.set(0, 0.091, 0.1);
    g.add(tip);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skinM);
      ear.scale.set(0.45, 1, 0.75);
      ear.position.set(sx * 0.091, 0.11, -0.005);
      g.add(ear);
    }

    const white = physical(0xf3efe9, { roughness: 0.15, clearcoat: 1 });
    const irisColor = L.age < 20 ? 0x5b3a1e : [0x4a2f1a, 0x3d5a3a, 0x2f4f6f][Math.abs(L.skin) % 3];
    const iris = mat(irisColor, { roughness: 0.3 });
    const pupil = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const lidM = skinM;
    const eyes: THREE.Object3D[] = [];
    const lids: THREE.Object3D[] = [];
    const brows: THREE.Object3D[] = [];
    const cheeks: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) {
      const socket = new THREE.Group();
      socket.position.set(sx * 0.034, 0.124, 0.08);
      g.add(socket);
      const eye = new THREE.Group();
      socket.add(eye);
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0135, 16, 12), white));
      const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0068, 16), iris);
      ir.position.z = 0.0128;
      eye.add(ir);
      const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0031, 12), pupil);
      pu.position.z = 0.0132;
      eye.add(pu);
      eyes.push(eye);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0148, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidM);
      socket.add(lid);
      lids.push(lid);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0146, 16, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), lidM);
      socket.add(lower);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0042, 0.028, 3, 6), hairM);
      brow.rotation.z = Math.PI / 2;
      const browPivot = new THREE.Group();
      browPivot.position.set(sx * 0.034, 0.146, 0.091);
      browPivot.add(brow);
      browPivot.userData.side = sx;
      g.add(browPivot);
      brows.push(browPivot);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), skinM);
      cheek.scale.set(1, 0.8, 0.7);
      cheek.position.set(sx * 0.043, 0.09, 0.06);
      g.add(cheek);
      cheeks.push(cheek);
    }

    // Mouth
    const mouth = new THREE.Group();
    mouth.position.set(0, 0.066, 0.094);
    g.add(mouth);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2a0d0d }));
    inner.scale.set(1.15, 0.12, 0.5);
    mouth.add(inner);
    const lipM = mat(new THREE.Color(L.skin).lerp(new THREE.Color(fem ? 0xb04a55 : 0x9a5550), fem ? 0.55 : 0.4).getHex(), { roughness: 0.45 });
    const lipU: THREE.Object3D[] = [];
    const lipL: THREE.Object3D[] = [];
    const corners: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) {
      for (const [arr, y, r] of [
        [lipU, 0.003, 0.0034],
        [lipL, -0.004, 0.004],
      ] as const) {
        const pivot = new THREE.Group();
        pivot.position.y = y;
        const lip = new THREE.Mesh(new THREE.CapsuleGeometry(r, 0.012, 3, 6), lipM);
        lip.rotation.z = Math.PI / 2;
        lip.position.x = sx * 0.009;
        pivot.add(lip);
        pivot.userData.side = sx;
        pivot.userData.y = y;
        mouth.add(pivot);
        arr.push(pivot);
      }
      const corner = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), lipM);
      corner.position.set(sx * 0.021, 0, -0.002);
      corner.userData.side = sx;
      mouth.add(corner);
      corners.push(corner);
    }

    // Age lines on the forehead; they deepen with worry.
    const wrinkles = new THREE.MeshBasicMaterial({ color: 0x5a3426, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.0009, 3, 24, 1.1), wrinkles);
      w.position.set(0, 0.16 + i * 0.011, 0.077 - i * 0.004);
      w.rotation.set(-0.35, 0, Math.PI / 2 - 0.55);
      g.add(w);
    }

    this.buildHair(g, hairM);

    if (L.beard) {
      const bm = mat(L.hair, { roughness: 1, transparent: L.beard === 'stubble', opacity: L.beard === 'stubble' ? 0.45 : 1 });
      if (L.beard === 'moustache') {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.03, 3, 8), bm);
        m.rotation.z = Math.PI / 2;
        m.position.set(0, 0.077, 0.098);
        g.add(m);
      } else {
        const beard = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), bm);
        beard.scale.set(1.04, 0.85, 1.04);
        beard.position.set(0, 0.06, 0.022);
        jaw.add(beard);
        beard.position.set(0, -0.025, 0.022);
      }
    }
    if (L.glasses) {
      const fm = mat(0x222222, { metalness: 0.6, roughness: 0.3 });
      for (const sx of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0018, 6, 20), fm);
        ring.position.set(sx * 0.034, 0.124, 0.1);
        g.add(ring);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.09), fm);
        arm.position.set(sx * 0.056, 0.126, 0.055);
        g.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.002), fm);
      bridge.position.set(0, 0.128, 0.102);
      g.add(bridge);
    }

    // Optional surgical cap and mask
    const capM = mat(0xffffff, { map: fabric(0x3b6fa8, 'dots', 0xb8d4f0), roughness: 0.95 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), capM);
    cap.scale.set(0.95, 1.05, 1.05);
    cap.position.y = 0.13;
    cap.visible = L.hairStyle === 'cap';
    g.add(cap);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 10, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.42, Math.PI * 0.3), mat(0x9ccbe0, { roughness: 0.95, side: THREE.DoubleSide }));
    mask.position.set(0, 0.075, 0.035);
    mask.scale.set(1.08, 1.1, 1.0);
    mask.visible = false;
    g.add(mask);
    this.gear.cap = cap;
    this.gear.mask = mask;

    const phone = new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.15, 0.009, 2, 0.006), mat(0x111316, { roughness: 0.3, metalness: 0.5 }));
    phone.visible = false;
    this.j.handR.add(phone);
    phone.position.set(0, -0.08 * this.s, 0.025);
    this.gear.phone = phone;

    return { lids, eyes, brows, mouthInner: inner, lipU, lipL, corners, cheeks, wrinkles, jaw };
  }

  private buildHair(g: THREE.Group, hairM: THREE.Material) {
    const st = this.look.hairStyle;
    const fem = !!this.look.female;
    if (st === 'cap') return;
    if (st === 'bald') {
      const ring = new THREE.Mesh(new THREE.SphereGeometry(0.104, 20, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.22), hairM);
      ring.scale.set(0.92, 1.1, 1.02);
      ring.position.set(0, 0.112, -0.01);
      ring.rotation.x = -0.35;
      g.add(ring);
      return;
    }
    const capH = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 14, 0, Math.PI * 2, 0, Math.PI * (st === 'short' || st === 'grey' ? 0.4 : 0.55)), hairM);
    capH.scale.set(fem ? 0.89 : 0.91, 1.12, 1.03);
    capH.position.set(0, 0.123, -0.012);
    capH.rotation.x = -0.42;
    // a softer back of the head so the hairline does not read as a cap
    const nape = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.35), hairM);
    nape.scale.set(fem ? 0.89 : 0.9, 1.1, 1.0);
    nape.position.set(0, 0.112, -0.016);
    nape.rotation.x = -1.2;
    g.add(nape);
    g.add(capH);
    if (st === 'grey') {
      // salt-and-pepper sides
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), hairM);
        side.scale.set(0.5, 1.2, 1.3);
        side.position.set(sx * 0.088, 0.125, -0.02);
        g.add(side);
      }
    }
    if (st === 'long') {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 12), hairM);
      back.scale.set(1.1, 1, 0.55);
      back.position.set(0, 0.05, -0.06);
      g.add(back);
      for (const sx of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 3, 8), hairM);
        lock.position.set(sx * 0.085, 0.07, 0.0);
        g.add(lock);
      }
    }
    if (st === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), hairM);
      bun.position.set(0, 0.18, -0.085);
      g.add(bun);
    }
  }

  setOutfit(outfit: Outfit) {
    const o = OUTFITS[outfit];
    this.mats.top.map = fabric(o.top, o.topPat ?? 'plain', o.accent ?? 0xffffff);
    this.mats.bottom.map = fabric(o.bottom, 'plain');
    const bare = outfit === 'pajamas' || outfit === 'nightgown';
    this.mats.shoe.color.setHex(bare ? this.look.skin : o.shoe);
    for (const sh of this.shoes) sh.scale.set(this.s * (bare ? 0.8 : 1), this.s * (bare ? 0.6 : 1), this.s * (bare ? 0.85 : 1));
    this.mats.top.needsUpdate = this.mats.bottom.needsUpdate = true;
    if (this.longMesh) {
      this.longMesh.removeFromParent();
      this.longMesh = null;
    }
    if (o.long) {
      const m = mat(0xffffff, { map: fabric(o.longColor ?? o.top, o.topPat === 'dots' ? 'dots' : 'plain', o.accent ?? 0xffffff), roughness: 0.9, side: THREE.DoubleSide });
      const len = o.long * this.s;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * this.look.build * this.s, 0.2 * this.look.build * this.s, len, 20, 1, true), m);
      mesh.scale.z = 0.8;
      mesh.position.y = 0.32 * this.s - len / 2;
      mesh.castShadow = true;
      this.j.chest.add(mesh);
      this.longMesh = mesh;
    }
  }

  setGear(g: { cap?: boolean; mask?: boolean; phone?: boolean }) {
    if (g.cap !== undefined && this.gear.cap) this.gear.cap.visible = g.cap;
    if (g.mask !== undefined && this.gear.mask) this.gear.mask.visible = g.mask;
    if (g.phone !== undefined && this.gear.phone) this.gear.phone.visible = g.phone;
  }

  /** Approximate world position of the eyes (for camera framing). */
  headWorld(out = new THREE.Vector3()) {
    return this.j.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.12 * this.s, 0).applyQuaternion(this.root.quaternion));
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  private set(name: string, x: number, y = 0, z = 0) {
    this.target[name].set(x, y, z);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const sp = this.speed;
    for (const k of Object.keys(this.target)) this.target[k].set(0, 0, 0);
    const breathe = Math.sin(t * 1.6) * 0.02;
    let hipsY = 0.95 * this.s;
    let hipsX = 0;
    switch (this.pose) {
      case 'walk': {
        this.phase += dt * (3.2 + sp * 2.6);
        const ph = this.phase;
        const amp = Math.min(1, sp / 1.4);
        this.set('thighL', Math.sin(ph) * 0.55 * amp);
        this.set('thighR', -Math.sin(ph) * 0.55 * amp);
        this.set('shinL', Math.max(0, -Math.cos(ph)) * 0.9 * amp + 0.05);
        this.set('shinR', Math.max(0, Math.cos(ph)) * 0.9 * amp + 0.05);
        this.set('footL', -0.2 * amp * Math.sin(ph));
        this.set('footR', 0.2 * amp * Math.sin(ph));
        this.set('shoulderL', -Math.sin(ph) * 0.45 * amp, 0, 0.08);
        this.set('shoulderR', Math.sin(ph) * 0.45 * amp, 0, -0.08);
        this.set('foreL', -0.25 - Math.max(0, Math.sin(ph)) * 0.3 * amp);
        this.set('foreR', -0.25 - Math.max(0, -Math.sin(ph)) * 0.3 * amp);
        this.set('spine', 0.05 * amp, Math.sin(ph) * 0.08 * amp, 0);
        this.set('chest', 0.02, -Math.sin(ph) * 0.1 * amp, 0);
        hipsY += Math.abs(Math.cos(ph)) * 0.03 * amp - 0.015 * amp;
        break;
      }
      case 'sit':
      case 'drive': {
        hipsY = 0.5 * this.s;
        this.set('thighL', -1.5, 0, 0.06);
        this.set('thighR', -1.5, 0, -0.06);
        this.set('shinL', 1.45);
        this.set('shinR', 1.45);
        this.set('spine', -0.05 + breathe);
        if (this.pose === 'drive') {
          this.set('shoulderL', -1.05, 0, 0.18);
          this.set('shoulderR', -1.05, 0, -0.18);
          this.set('foreL', -0.55, 0, -0.1);
          this.set('foreR', -0.55, 0, 0.1);
        } else {
          this.set('shoulderL', -0.35, 0, 0.12);
          this.set('shoulderR', -0.35, 0, -0.12);
          this.set('foreL', -1.0, 0, -0.2);
          this.set('foreR', -1.0, 0, 0.2);
        }
        break;
      }
      case 'lie': {
        this.set('shoulderL', 0.05, 0, 0.12);
        this.set('shoulderR', 0.05, 0, -0.12);
        this.set('foreL', -0.35, 0, -0.2);
        this.set('foreR', -0.35, 0, 0.2);
        this.set('thighL', -0.12, 0, 0.04);
        this.set('shinL', 0.2);
        this.set('thighR', -0.04, 0, -0.03);
        this.set('footL', 0.7);
        this.set('footR', 0.7);
        this.set('chest', breathe * 2);
        this.set('head', -0.15, 0, 0.25);
        break;
      }
      case 'bedSit': {
        hipsY = 0.12 * this.s;
        this.set('thighL', -1.45, 0, 0.05);
        this.set('thighR', -1.45, 0, -0.05);
        this.set('shinL', 0.2);
        this.set('shinR', 0.2);
        this.set('spine', 0.25 + breathe);
        this.set('chest', 0.1);
        this.set('shoulderR', -0.45, 0, -0.4);
        this.set('foreR', -2.2, 0, 0.2);
        this.set('shoulderL', -0.2, 0, 0.2);
        this.set('foreL', -0.8);
        this.set('head', 0.15, 0, -0.1);
        break;
      }
      case 'phone': {
        this.set('shoulderR', -0.45, 0, -0.4);
        this.set('foreR', -2.2, 0, 0.2);
        this.set('shoulderL', 0.05, 0, 0.1);
        this.set('foreL', -0.3);
        this.set('chest', breathe);
        this.set('head', 0.05, 0, -0.12);
        break;
      }
      case 'wash': {
        const k = Math.sin(t * 6) * 0.15;
        this.set('spine', 0.35);
        this.set('chest', 0.25);
        this.set('head', 0.35);
        this.set('shoulderL', -1.1 + k, 0, 0.1);
        this.set('shoulderR', -1.1 - k, 0, -0.1);
        this.set('foreL', -1.4);
        this.set('foreR', -1.4);
        break;
      }
      case 'drink': {
        const k = (Math.sin(t * 1.2) + 1) / 2;
        this.set('shoulderR', -0.35 - k * 0.2, 0, -0.15);
        this.set('foreR', -1.5 - k * 0.7, 0, 0.3);
        this.set('head', -0.1 * k);
        this.set('chest', breathe);
        break;
      }
      case 'surgeon': {
        const k = Math.sin(t * 2.1) * 0.05;
        this.set('spine', 0.22);
        this.set('chest', 0.12);
        this.set('head', 0.45);
        this.set('shoulderL', -0.75 + k, 0, 0.25);
        this.set('shoulderR', -0.75 - k, 0, -0.25);
        this.set('foreL', -1.0, 0, -0.35);
        this.set('foreR', -1.0, 0, 0.35);
        break;
      }
      case 'type': {
        this.set('shoulderL', -0.5, 0, 0.1);
        this.set('shoulderR', -0.5, 0, -0.1);
        this.set('foreL', -1.1 + Math.sin(t * 9) * 0.04);
        this.set('foreR', -1.1 + Math.cos(t * 8) * 0.04);
        this.set('head', 0.3);
        break;
      }
      case 'dress': {
        const k = Math.sin(t * 4);
        this.set('shoulderL', -0.8 + k * 0.3, 0, 0.3);
        this.set('shoulderR', -0.8 - k * 0.3, 0, -0.3);
        this.set('foreL', -1.6);
        this.set('foreR', -1.6);
        this.set('head', 0.2);
        break;
      }
      case 'cross': {
        this.set('shoulderL', -0.55, 0, 0.12);
        this.set('shoulderR', -0.55, 0, -0.12);
        this.set('foreL', -1.6, 0.0, -0.9);
        this.set('foreR', -1.6, 0.0, 0.9);
        this.set('chest', breathe);
        break;
      }
      default: {
        // idle: breathing and a small weight shift
        const sway = Math.sin(t * 0.7) * 0.02;
        hipsX = sway * 0.5;
        this.set('chest', breathe);
        this.set('spine', 0, sway, 0);
        this.set('shoulderL', 0.03, 0, 0.07 + breathe);
        this.set('shoulderR', 0.03, 0, -0.07 - breathe);
        this.set('foreL', -0.15);
        this.set('foreR', -0.15);
        this.set('thighL', 0, 0, 0.02);
        this.set('thighR', 0, 0, -0.02);
        if (this.talking) {
          const g = Math.max(0, Math.sin(t * 2.3)) * 0.35;
          this.set('shoulderR', -0.2 - g * 0.5, 0, -0.1);
          this.set('foreR', -0.9 - g);
        }
      }
    }
    // head turn toward look target (yaw only, limited)
    if (this.lookAt && this.pose !== 'lie') {
      const hw = this.j.neck.getWorldPosition(new THREE.Vector3());
      const dir = this.lookAt.clone().sub(hw);
      const yaw = Math.atan2(dir.x, dir.z) - this.root.rotation.y;
      const wrapped = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      this.headTurn = damp(this.headTurn, Math.max(-0.9, Math.min(0.9, wrapped)), 6, dt);
    } else this.headTurn = damp(this.headTurn, 0, 4, dt);
    this.target.neck.y += this.headTurn * 0.6;
    this.target.head.y += this.headTurn * 0.4;

    const lam = this.pose === 'walk' ? 14 : 7;
    for (const [k, tv] of Object.entries(this.target)) {
      const r = this.j[k].rotation;
      r.x = damp(r.x, tv.x, lam, dt);
      r.y = damp(r.y, tv.y, lam, dt);
      r.z = damp(r.z, tv.z, lam, dt);
    }
    const hips = this.j.hips;
    hips.position.y = damp(hips.position.y, hipsY, 8, dt);
    hips.position.x = damp(hips.position.x, hipsX, 4, dt);
    this.updateFace(dt);
  }

  private updateFace(dt: number) {
    const target = EXPR[this.expression] ?? EXPR.neutral;
    const f = this.fp;
    for (const k of Object.keys(f) as (keyof FaceParams)[]) f[k] = damp(f[k], target[k], 5, dt);
    // blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = 2 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 9);
    const lidOpen = Math.max(0, f.lid * (1 - Math.min(1, this.blink * 1.6)));
    for (const lid of this.face.lids) lid.rotation.x = -0.75 + (1 - lidOpen) * 1.65 - 0.25;
    // talking mouth
    const talk = this.talking ? Math.max(0, Math.sin(this.time * 17) * 0.5 + Math.sin(this.time * 11.3) * 0.5) : 0;
    const open = Math.min(1, f.open + talk * 0.45);
    this.face.mouthInner.scale.y = 0.12 + open * 0.55;
    this.face.mouthInner.scale.x = 1.15 + Math.max(0, f.smile) * 0.25;
    this.face.jaw.rotation.x = open * 0.18;
    for (const lp of this.face.lipU) {
      lp.rotation.z = lp.userData.side * f.smile * 0.42;
      lp.position.y = lp.userData.y + open * 0.002;
    }
    for (const lp of this.face.lipL) {
      lp.rotation.z = lp.userData.side * f.smile * 0.36;
      lp.position.y = lp.userData.y - open * 0.009;
    }
    for (const c of this.face.corners) {
      c.position.y = f.smile * 0.008 - open * 0.002;
      c.position.x = c.userData.side * (0.021 + Math.max(0, f.smile) * 0.003);
    }
    for (const ch of this.face.cheeks) ch.position.y = 0.09 + Math.max(0, f.smile) * 0.006 + f.squint * 0.002;
    for (const b of this.face.brows) {
      b.position.y = 0.146 + f.brow * 0.006;
      // inner raise: rotate so the inner end (towards the nose) lifts
      b.rotation.z = -b.userData.side * f.browInner * 0.35;
    }
    const age = Math.max(0, (this.look.age - 30) / 40);
    this.face.wrinkles.opacity = Math.min(0.55, age * 0.25 + f.wrinkle * 0.35 * (0.4 + age));
    // gaze micro-saccades
    const gx = Math.sin(this.time * 0.6) * 0.08 + (this.headTurn * 0.3);
    for (const e of this.face.eyes) e.rotation.set(Math.sin(this.time * 0.43) * 0.04, gx, 0);
  }

  /** Set a pose immediately without blending (used for scene setup). */
  snap() {
    const save = this.pose;
    for (let i = 0; i < 30; i++) this.update(0.1);
    this.pose = save;
  }
}

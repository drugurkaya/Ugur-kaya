import * as THREE from 'three';

/**
 * Cloth ribbon (sash tails, head-wrap tails, tabards) simulated as a Verlet
 * chain and rendered as a lit strip. Cheap secondary motion that reacts to
 * the fighter's movement and hits.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private seg: number;
  private geo: THREE.BufferGeometry;
  private anchorLocal: THREE.Vector3;
  private widthLocal: THREE.Vector3;
  private hangLocal: THREE.Vector3;
  private colliders: { bone: THREE.Object3D; offset: THREE.Vector3; r: number }[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private initialized = false;

  constructor(
    private readonly anchor: THREE.Object3D,
    anchorLocal: THREE.Vector3,
    /** Width direction in anchor space. */
    widthLocal: THREE.Vector3,
    /** Initial hang direction in anchor space. */
    hangLocal: THREE.Vector3,
    readonly length: number,
    private readonly width: number,
    material: THREE.Material,
    segments = 8,
    private readonly taper = 0.4,
    private readonly stiffness = 0.2,
  ) {
    this.seg = segments;
    this.anchorLocal = anchorLocal;
    this.widthLocal = widthLocal.normalize();
    this.hangLocal = hangLocal.normalize();
    for (let i = 0; i <= segments; i++) {
      this.pts.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    this.geo = new THREE.BufferGeometry();
    const n = (segments + 1) * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= segments; i++) {
      uv.set([0, i / segments, 1, i / segments], i * 4);
    }
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  addCollider(bone: THREE.Object3D, offset: THREE.Vector3, r: number): this {
    this.colliders.push({ bone, offset, r });
    return this;
  }

  reset(): void {
    this.initialized = false;
  }

  update(dt: number, wind: THREE.Vector3): void {
    const anchorW = this.anchor.localToWorld(this.tmp.copy(this.anchorLocal));
    const scale = this.anchor.getWorldScale(this.tmp2).x;
    const segLen = (this.length * scale) / this.seg;
    if (!this.initialized) {
      const q = this.anchor.getWorldQuaternion(new THREE.Quaternion());
      const hang = this.hangLocal.clone().applyQuaternion(q);
      for (let i = 0; i <= this.seg; i++) {
        this.pts[i].copy(anchorW).addScaledVector(hang, segLen * i);
        this.prev[i].copy(this.pts[i]);
      }
      this.initialized = true;
    }
    const h = Math.min(dt, 1 / 30);
    const q = this.anchor.getWorldQuaternion(new THREE.Quaternion());
    const hangW = this.hangLocal.clone().applyQuaternion(q);
    this.pts[0].copy(anchorW);
    this.prev[0].copy(anchorW);
    const g = -9.8 * h * h;
    for (let i = 1; i <= this.seg; i++) {
      const p = this.pts[i];
      const pr = this.prev[i];
      const vx = (p.x - pr.x) * 0.96;
      const vy = (p.y - pr.y) * 0.96;
      const vz = (p.z - pr.z) * 0.96;
      pr.copy(p);
      p.x += vx + wind.x * h * h;
      p.y += vy + g + wind.y * h * h;
      p.z += vz + wind.z * h * h;
      // Gentle shape memory toward the rest hang direction.
      const rest = this.tmp2.copy(anchorW).addScaledVector(hangW, segLen * i);
      p.lerp(rest, this.stiffness * (1 - i / (this.seg + 2)) * 0.5);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < this.seg; i++) {
        const a = this.pts[i];
        const b = this.pts[i + 1];
        const d = this.tmp2.subVectors(b, a);
        const l = d.length() || 1e-6;
        const diff = (l - segLen) / l;
        if (i === 0) b.addScaledVector(d, -diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
      for (const c of this.colliders) {
        const center = c.bone.localToWorld(this.tmp.copy(c.offset));
        const r = c.r * scale;
        for (let i = 1; i <= this.seg; i++) {
          const p = this.pts[i];
          const d = this.tmp2.subVectors(p, center);
          const l = d.length();
          if (l < r) p.copy(center).addScaledVector(d.normalize(), r);
        }
      }
      for (let i = 1; i <= this.seg; i++) if (this.pts[i].y < 0.01) this.pts[i].y = 0.01;
    }
    // Rebuild strip.
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geo.getAttribute('normal') as THREE.BufferAttribute;
    const wdir = this.widthLocal.clone().applyQuaternion(q);
    const along = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i <= this.seg; i++) {
      const p = this.pts[i];
      const w = (this.width * scale * (1 - (i / this.seg) * (1 - this.taper))) / 2;
      pos.setXYZ(i * 2, p.x - wdir.x * w, p.y - wdir.y * w, p.z - wdir.z * w);
      pos.setXYZ(i * 2 + 1, p.x + wdir.x * w, p.y + wdir.y * w, p.z + wdir.z * w);
      const nxt = this.pts[Math.min(this.seg, i + 1)];
      const prv = this.pts[Math.max(0, i - 1)];
      along.subVectors(nxt, prv).normalize();
      n.crossVectors(wdir, along).normalize();
      nor.setXYZ(i * 2, n.x, n.y, n.z);
      nor.setXYZ(i * 2 + 1, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

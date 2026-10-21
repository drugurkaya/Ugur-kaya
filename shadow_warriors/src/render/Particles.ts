import * as THREE from 'three';
import { Rng } from '../core/math';

const MAX = 1400;

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  a: number;
  size: number;
  grow: number;
  stretch: number;
  life: number;
  age: number;
  gravity: number;
  drag: number;
}

/**
 * Pooled GPU-instanced billboard particles. Velocity-stretched quads give
 * sparks a streak look; soft discs are used for dust and energy motes.
 * All particle structs are preallocated, so spawning never allocates.
 */
class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private pool: P[] = [];
  private alive = 0;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;

  constructor(blending: THREE.Blending, softness: number) {
    for (let i = 0; i < MAX; i++)
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, a: 1, size: 0.1, grow: 0, stretch: 0, life: 1, age: 0, gravity: 0, drag: 0 });
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iVel', this.aVel);
    this.geo.setAttribute('iColor', this.aCol);
    this.geo.setAttribute('iSize', this.aSize);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uSoft: { value: softness } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iColor; attribute vec2 iSize;
        varying vec2 vUv; varying vec4 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
          float sp = length(vv.xy);
          vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          float len = iSize.x * (1.0 + iSize.y * sp);
          mv.xy += dir * position.y * len + perp * position.x * iSize.x;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy + 0.5;
          vColor = iColor;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uSoft;
        varying vec2 vUv; varying vec4 vColor;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = 1.0 - smoothstep(1.0 - uSoft, 1.0, d);
          a *= vColor.a;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor.rgb * a, a);
        }
      `,
    });
    if (blending === THREE.NormalBlending) {
      mat.premultipliedAlpha = true;
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  spawn(init: (p: P) => void): void {
    if (this.alive >= MAX) return;
    const p = this.pool[this.alive++];
    p.vx = p.vy = p.vz = 0;
    p.grow = 0;
    p.stretch = 0;
    p.age = 0;
    p.gravity = 0;
    p.drag = 0;
    p.a = 1;
    init(p);
  }

  clear(): void {
    this.alive = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number): void {
    let w = 0;
    const pos = this.aPos.array as Float32Array;
    const vel = this.aVel.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const size = this.aSize.array as Float32Array;
    for (let i = 0; i < this.alive; i++) {
      const p = this.pool[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k - p.gravity * dt;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01 && p.gravity > 0) {
        p.y = 0.01;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const t = p.age / p.life;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      // Compact live particles to the front of the pool.
      if (w !== i) {
        const tmp = this.pool[w];
        this.pool[w] = p;
        this.pool[i] = tmp;
      }
      pos[w * 3] = p.x;
      pos[w * 3 + 1] = p.y;
      pos[w * 3 + 2] = p.z;
      vel[w * 3] = p.vx;
      vel[w * 3 + 1] = p.vy;
      vel[w * 3 + 2] = p.vz;
      col[w * 4] = p.r;
      col[w * 4 + 1] = p.g;
      col[w * 4 + 2] = p.b;
      col[w * 4 + 3] = p.a * fade;
      size[w * 2] = p.size * (1 + p.grow * t);
      size[w * 2 + 1] = p.stretch;
      w++;
    }
    this.alive = w;
    this.geo.instanceCount = w;
    this.aPos.needsUpdate = this.aVel.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.aPos.clearUpdateRanges();
    this.aPos.addUpdateRange(0, w * 3);
    this.aVel.clearUpdateRanges();
    this.aVel.addUpdateRange(0, w * 3);
    this.aCol.clearUpdateRanges();
    this.aCol.addUpdateRange(0, w * 4);
    this.aSize.clearUpdateRanges();
    this.aSize.addUpdateRange(0, w * 2);
  }

  get count(): number {
    return this.alive;
  }
}

/** Expanding ring on the floor (shockwaves) — small pool of meshes. */
class Rings {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; age: number; life: number; radius: number }[] = [];
  constructor() {
    const geo = new THREE.RingGeometry(0.85, 1, 64, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; void main(){ float e = sin(vUv.y * 3.14159); gl_FragColor = vec4(uColor * e * uAlpha, 1.0); }`,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.items.push({ mesh, mat, age: 1, life: 1, radius: 1 });
    }
  }
  spawn(x: number, y: number, z: number, radius: number, color: THREE.Color, life: number, vertical = false): void {
    const it = this.items.find((i) => i.age >= i.life) ?? this.items[0];
    it.age = 0;
    it.life = life;
    it.radius = radius;
    it.mesh.position.set(x, y, z);
    it.mesh.rotation.set(vertical ? Math.PI / 2 : 0, 0, 0);
    it.mat.uniforms.uColor.value.copy(color);
    it.mesh.visible = true;
  }
  orient(lookAt: THREE.Vector3): void {
    for (const it of this.items) if (it.mesh.visible && it.mesh.rotation.x !== 0) it.mesh.lookAt(lookAt);
  }
  update(dt: number): void {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.age += dt;
      const t = it.age / it.life;
      if (t >= 1) {
        it.mesh.visible = false;
        continue;
      }
      const s = 0.1 + (1 - Math.pow(1 - t, 3)) * it.radius;
      it.mesh.scale.set(s, 1, s);
      it.mat.uniforms.uAlpha.value = (1 - t) * 2.2;
    }
  }
  clear(): void {
    for (const it of this.items) {
      it.mesh.visible = false;
      it.age = it.life;
    }
  }
}

export type HitKind = 'light' | 'medium' | 'heavy' | 'special' | 'block';

/** High-level effect presets used by the game. */
export class VFX {
  readonly group = new THREE.Group();
  private add: ParticleLayer;
  private soft: ParticleLayer;
  private rings = new Rings();
  private rng = new Rng(42);
  /** Particle density multiplier from settings. */
  density = 1;
  private c = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.add = new ParticleLayer(THREE.AdditiveBlending, 0.9);
    this.soft = new ParticleLayer(THREE.NormalBlending, 1.0);
    this.group.add(this.soft.mesh, this.add.mesh, this.rings.group);
    scene.add(this.group);
  }

  private n(base: number): number {
    return Math.max(1, Math.round(base * this.density));
  }

  /** Impact at a contact point. `dir` = knockback direction on the ground plane. */
  hit(x: number, y: number, z: number, dx: number, dz: number, kind: HitKind, energy: THREE.Color): void {
    const r = this.rng;
    const heavy = kind === 'heavy' || kind === 'special';
    const block = kind === 'block';
    const count = this.n(block ? 22 : kind === 'light' ? 18 : kind === 'medium' ? 30 : 48);
    // Hot sparks spraying along the knockback direction.
    for (let i = 0; i < count; i++) {
      this.add.spawn((p) => {
        const sp = r.range(2.5, heavy ? 9 : 6.5);
        const a = r.range(0, Math.PI * 2);
        const spread = r.range(0.3, 1.0);
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = dx * sp * 0.8 + Math.cos(a) * sp * spread * 0.6;
        p.vy = r.range(-0.5, 1.2) * sp * 0.6;
        p.vz = dz * sp * 0.8 + Math.sin(a) * sp * spread * 0.6;
        if (block) this.c.set('#9fd8ff');
        else this.c.setRGB(1, r.range(0.55, 0.85), r.range(0.25, 0.45));
        p.r = this.c.r * 3;
        p.g = this.c.g * 3;
        p.b = this.c.b * 3;
        p.size = r.range(0.012, 0.025);
        p.stretch = 0.035;
        p.life = r.range(0.18, heavy ? 0.5 : 0.35);
        p.gravity = 9;
        p.drag = 2.5;
      });
    }
    // Flash core.
    this.add.spawn((p) => {
      p.x = x;
      p.y = y;
      p.z = z;
      p.size = heavy ? 0.55 : block ? 0.35 : 0.32;
      p.grow = 1.4;
      p.life = heavy ? 0.16 : 0.1;
      if (block) this.c.set('#7cc8ff');
      else this.c.setRGB(1, 0.85, 0.65);
      p.r = this.c.r * 4;
      p.g = this.c.g * 4;
      p.b = this.c.b * 4;
    });
    if (heavy) {
      // Energy motes in the attacker's colour.
      for (let i = 0; i < this.n(26); i++) {
        this.add.spawn((p) => {
          const a = r.range(0, Math.PI * 2);
          const e = r.range(-1, 1);
          const sp = r.range(1, 4);
          p.x = x;
          p.y = y;
          p.z = z;
          p.vx = Math.cos(a) * sp * Math.sqrt(1 - e * e);
          p.vy = e * sp;
          p.vz = Math.sin(a) * sp * Math.sqrt(1 - e * e);
          p.r = energy.r * 3;
          p.g = energy.g * 3;
          p.b = energy.b * 3;
          p.size = r.range(0.03, 0.06);
          p.life = r.range(0.3, 0.7);
          p.drag = 3;
          p.grow = -0.6;
        });
      }
      this.rings.spawn(x, y, z, 0.9, energy.clone().multiplyScalar(2), 0.25, true);
    }
    if (block) this.rings.spawn(x, y, z, 0.45, new THREE.Color('#6fc4ff').multiplyScalar(2.5), 0.18, true);
  }

  /** Dust kicked up from the floor. */
  dust(x: number, z: number, amount: number, radius = 0.4, speed = 1.2): void {
    const r = this.rng;
    for (let i = 0; i < this.n(amount); i++) {
      this.soft.spawn((p) => {
        const a = r.range(0, Math.PI * 2);
        const d = r.range(0, radius);
        p.x = x + Math.cos(a) * d;
        p.y = r.range(0.03, 0.15);
        p.z = z + Math.sin(a) * d;
        const sp = r.range(0.3, 1) * speed;
        p.vx = Math.cos(a) * sp;
        p.vy = r.range(0.2, 0.7);
        p.vz = Math.sin(a) * sp;
        const g = r.range(0.22, 0.32);
        p.r = g * 0.95;
        p.g = g * 0.95;
        p.b = g;
        p.a = r.range(0.25, 0.45);
        p.size = r.range(0.15, 0.3);
        p.grow = 2.2;
        p.life = r.range(0.6, 1.3);
        p.drag = 2.2;
      });
    }
  }

  /** Ground shockwave (Fang Breaker, knockdowns). */
  shockwave(x: number, z: number, radius: number, color: THREE.Color): void {
    this.rings.spawn(x, 0.03, z, radius, color.clone().multiplyScalar(2.5), 0.55);
    this.rings.spawn(x, 0.05, z, radius * 0.6, new THREE.Color(1.5, 1.2, 1.0), 0.35);
    this.dust(x, z, 40, radius * 0.5, 4);
    const r = this.rng;
    // Debris chunks.
    for (let i = 0; i < this.n(36); i++) {
      this.soft.spawn((p) => {
        const a = r.range(0, Math.PI * 2);
        const sp = r.range(2, 6);
        p.x = x + Math.cos(a) * 0.3;
        p.y = 0.05;
        p.z = z + Math.sin(a) * 0.3;
        p.vx = Math.cos(a) * sp;
        p.vy = r.range(2, 6);
        p.vz = Math.sin(a) * sp;
        p.r = p.g = p.b = r.range(0.12, 0.2);
        p.a = 1;
        p.size = r.range(0.03, 0.07);
        p.life = r.range(0.6, 1.1);
        p.gravity = 14;
        p.drag = 0.5;
      });
    }
    for (let i = 0; i < this.n(40); i++) {
      this.add.spawn((p) => {
        const a = r.range(0, Math.PI * 2);
        const sp = r.range(3, 8);
        p.x = x;
        p.y = 0.1;
        p.z = z;
        p.vx = Math.cos(a) * sp;
        p.vy = r.range(0.5, 3);
        p.vz = Math.sin(a) * sp;
        p.r = color.r * 3;
        p.g = color.g * 3;
        p.b = color.b * 3;
        p.size = r.range(0.015, 0.03);
        p.stretch = 0.04;
        p.life = r.range(0.3, 0.6);
        p.gravity = 6;
        p.drag = 2;
      });
    }
  }

  /** Swirling energy around a point (special charge, full meter aura). */
  energy(x: number, y: number, z: number, color: THREE.Color, count: number, radius = 0.5): void {
    const r = this.rng;
    for (let i = 0; i < this.n(count); i++) {
      this.add.spawn((p) => {
        const a = r.range(0, Math.PI * 2);
        p.x = x + Math.cos(a) * radius * r.range(0.3, 1);
        p.y = y + r.range(-0.8, 0.8);
        p.z = z + Math.sin(a) * radius * r.range(0.3, 1);
        p.vx = -Math.sin(a) * 1.2;
        p.vy = r.range(0.5, 1.8);
        p.vz = Math.cos(a) * 1.2;
        p.r = color.r * 2.5;
        p.g = color.g * 2.5;
        p.b = color.b * 2.5;
        p.size = r.range(0.02, 0.045);
        p.life = r.range(0.4, 0.9);
        p.drag = 1.5;
        p.stretch = 0.02;
      });
    }
  }

  /** Whoosh trail motes along a moving limb. */
  trail(x: number, y: number, z: number, color: THREE.Color): void {
    this.add.spawn((p) => {
      p.x = x;
      p.y = y;
      p.z = z;
      p.r = color.r * 1.6;
      p.g = color.g * 1.6;
      p.b = color.b * 1.6;
      p.a = 0.6;
      p.size = 0.07;
      p.grow = -0.8;
      p.life = 0.16;
    });
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.add.update(dt);
    this.soft.update(dt);
    this.rings.orient(camPos);
    this.rings.update(dt);
  }

  clear(): void {
    this.add.clear();
    this.soft.clear();
    this.rings.clear();
  }

  get count(): number {
    return this.add.count + this.soft.count;
  }
}

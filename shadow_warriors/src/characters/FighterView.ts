import * as THREE from 'three';
import { angleDelta, clamp, damp } from '../core/math';
import type { Fighter } from '../combat/Fighter';
import type { Limb } from '../combat/types';
import { radialTexture } from '../render/textures';
import { Animator } from './Animator';
import type { CharacterModel } from './appearance';

/** Skinned fresnel shader used for afterimages and the energy rim. */
const fresnelMaterial = (color: THREE.Color, opacity: number): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: opacity }, uPower: { value: 2.0 }, uBase: { value: 0.15 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vV = normalize(-mvPosition.xyz);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uPower, uBase;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uColor * (uBase + f) * uOpacity, 1.0);
      }
    `,
  });

let blobTex: THREE.Texture | null = null;

class Ghost {
  mesh: THREE.SkinnedMesh;
  /** Depth-only pre-pass so only the front-most surface of the afterimage shows. */
  depth: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  mat: THREE.ShaderMaterial;
  life = 0;
  constructor(src: THREE.SkinnedMesh, color: THREE.Color, order: number) {
    this.bones = src.skeleton.bones.map(() => {
      const b = new THREE.Bone();
      b.matrixAutoUpdate = false;
      b.matrixWorldAutoUpdate = false;
      return b;
    });
    const skeleton = new THREE.Skeleton(this.bones, src.skeleton.boneInverses);
    this.mat = fresnelMaterial(color, 0);
    this.mat.uniforms.uBase.value = 0.08;
    // Pushed slightly back in depth so a ghost that coincides with the live body stays hidden.
    this.mat.polygonOffset = true;
    this.mat.polygonOffsetFactor = 4;
    this.mat.polygonOffsetUnits = 8;
    this.mesh = new THREE.SkinnedMesh(src.geometry, this.mat);
    // Transparent queue so the pre-pass never occludes the opaque fighter itself.
    this.depth = new THREE.SkinnedMesh(
      src.geometry,
      new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }),
    );
    for (const [m, ro] of [
      [this.depth, 7 + order * 2],
      [this.mesh, 8 + order * 2],
    ] as const) {
      m.bindMode = THREE.DetachedBindMode;
      m.bind(skeleton, new THREE.Matrix4());
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = ro;
    }
  }
  capture(src: THREE.SkinnedMesh): void {
    src.skeleton.bones.forEach((b, i) => this.bones[i].matrixWorld.copy(b.matrixWorld));
    this.life = 1;
    this.mesh.visible = this.depth.visible = true;
  }
  hide(): void {
    this.mesh.visible = this.depth.visible = false;
  }
}

/**
 * Visual representation of one fighter: skinned model, animator, cloth,
 * contact shadow, energy rim, afterimage trail and hit flash.
 */
export class FighterView {
  readonly model: CharacterModel;
  readonly animator: Animator;
  readonly group = new THREE.Group();
  private blob: THREE.Mesh;
  private rim: THREE.SkinnedMesh;
  private rimMat: THREE.ShaderMaterial;
  private ghosts: Ghost[] = [];
  private ghostIdx = 0;
  private ghostTimer = 0;
  private flash = 0;
  private flashColor = new THREE.Color();
  private baseEmissive: { m: THREE.MeshStandardMaterial; c: THREE.Color; i: number }[] = [];
  private lastPos = new THREE.Vector3();
  private velF = 0;
  private velL = 0;
  private wind = new THREE.Vector3();
  private stepPhase = 0;
  /** Set when a footstep should sound this frame. */
  footstep = false;
  readonly scale: number;
  private tmp = new THREE.Vector3();

  constructor(model: CharacterModel, scale: number, scene: THREE.Scene) {
    this.model = model;
    this.scale = scale;
    this.animator = new Animator(model);
    model.root.scale.setScalar(scale);
    this.group.add(model.root);
    scene.add(this.group);
    for (const r of model.ribbons) scene.add(r.mesh);

    blobTex ??= radialTexture(64, [
      [0, 'rgba(0,0,0,0.75)'],
      [0.5, 'rgba(0,0,0,0.4)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.blob.renderOrder = 1;
    scene.add(this.blob);

    this.rimMat = fresnelMaterial(model.energy, 0);
    this.rimMat.uniforms.uPower.value = 3;
    this.rimMat.uniforms.uBase.value = 0;
    this.rim = new THREE.SkinnedMesh(model.mesh.geometry, this.rimMat);
    this.rim.bind(model.mesh.skeleton, model.mesh.bindMatrix);
    this.rim.frustumCulled = false;
    this.rim.visible = false;
    model.mesh.add(this.rim);

    for (let i = 0; i < 5; i++) {
      const g = new Ghost(model.mesh, model.energy, i);
      this.ghosts.push(g);
      scene.add(g.depth, g.mesh);
    }
    for (const m of model.materials) {
      if ('emissive' in m && !model.glowMats.includes(m)) this.baseEmissive.push({ m, c: m.emissive.clone(), i: m.emissiveIntensity });
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group, this.blob);
    for (const r of this.model.ribbons) scene.remove(r.mesh);
    for (const g of this.ghosts) scene.remove(g.mesh, g.depth);
    // Free GPU resources (custom fighters are rebuilt while editing).
    const mats = new Set<THREE.Material>();
    const geos = new Set<THREE.BufferGeometry>();
    const collect = (o: THREE.Object3D) =>
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        geos.add(m.geometry);
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
      });
    collect(this.group);
    for (const r of this.model.ribbons) collect(r.mesh);
    for (const g of this.ghosts) {
      collect(g.mesh);
      collect(g.depth);
    }
    for (const g of geos) g.dispose();
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  }

  hitFlash(color: THREE.Color, strength: number): void {
    this.flash = Math.max(this.flash, strength);
    this.flashColor.copy(color);
  }

  /** World position of a limb tip (for effects). */
  limbPosition(limb: Limb, out: THREE.Vector3): THREE.Vector3 {
    const B = this.model.skel.bones;
    const bone = limb === 'handL' ? B.handL : limb === 'handR' ? B.handR : limb === 'footL' ? B.footL : limb === 'footR' ? B.footR : B.chest;
    const off = limb.startsWith('hand') ? this.tmp.set(0, -0.08, 0.01) : limb.startsWith('foot') ? this.tmp.set(0, -0.03, 0.12) : this.tmp.set(0, 0, 0);
    return bone.localToWorld(out.copy(off));
  }

  reset(f: Fighter): void {
    this.group.position.set(f.pos.x, f.y, f.pos.z);
    this.lastPos.copy(this.group.position);
    this.animator.snap();
    for (const r of this.model.ribbons) r.reset();
    for (const g of this.ghosts) {
      g.life = 0;
      g.hide();
    }
  }

  update(f: Fighter, alpha: number, dt: number, meterFull: boolean): void {
    // Interpolate the fixed-step simulation for smooth rendering at any refresh rate.
    const x = f.prevPos.x + (f.pos.x - f.prevPos.x) * alpha;
    const z = f.prevPos.z + (f.pos.z - f.prevPos.z) * alpha;
    const y = f.prevY + (f.y - f.prevY) * alpha;
    const yaw = f.prevYaw + angleDelta(f.prevYaw, f.yaw) * alpha;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;

    // Ground speed in local axes drives stride-matched locomotion.
    if (dt > 0) {
      const dx = (x - this.lastPos.x) / dt;
      const dz = (z - this.lastPos.z) / dt;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const vf = dx * fx + dz * fz;
      const vl = dx * fz - dz * fx;
      this.velF = damp(this.velF, clamp(vf, -6, 6), 12, dt);
      this.velL = damp(this.velL, clamp(vl, -6, 6), 12, dt);
      this.wind.set(-dx * 2.5, 0, -dz * 2.5);
    }
    this.lastPos.set(x, y, z);
    const walking = f.state === 'walk' || f.state === 'idle';
    this.animator.update(f, alpha, dt, walking ? this.velF / this.scale : 0, walking ? this.velL / this.scale : 0);

    // Footsteps on stride phase.
    this.footstep = false;
    const speed = Math.hypot(this.velF, this.velL);
    if (walking && speed > 0.6) {
      this.stepPhase += (speed / 0.55) * dt;
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        this.footstep = true;
      }
    }

    this.model.root.updateMatrixWorld(true);
    // Breeze + body motion for the cloth.
    const t = performance.now() / 1000;
    this.wind.x += Math.sin(t * 0.7) * 0.6 + 0.4;
    this.wind.z += Math.cos(t * 0.5) * 0.4;
    for (const r of this.model.ribbons) r.update(dt, this.wind);

    // Contact shadow fades/grows with height.
    const h = clamp(y, 0, 2);
    const s = (0.95 + h * 0.4) * this.scale;
    const lying = f.state === 'down' || f.state === 'ko' || (f.state === 'launch' && f.stateFrame > 10);
    this.blob.scale.set(s * (lying ? 1.3 : 1), 1, s * (lying ? 2.0 : 1));
    this.blob.rotation.y = yaw;
    this.blob.position.set(x - (lying ? Math.sin(yaw) * 0.6 : 0), 0.012, z - (lying ? Math.cos(yaw) * 0.6 : 0));
    (this.blob.material as THREE.MeshBasicMaterial).opacity = clamp(1 - h * 0.5, 0.3, 1);

    // Energy rim: full meter pulse, strong during specials.
    const special = f.state === 'attack' && f.move?.sfx === 'special';
    const rimTarget = special ? 0.9 : meterFull ? 0.35 + Math.sin(t * 6) * 0.15 : 0;
    const cur = this.rimMat.uniforms.uOpacity.value as number;
    this.rimMat.uniforms.uOpacity.value = damp(cur, rimTarget, 10, dt);
    this.rim.visible = this.rimMat.uniforms.uOpacity.value > 0.01;
    for (const gm of this.model.glowMats) gm.emissiveIntensity = (gm.userData.base ??= gm.emissiveIntensity) * (1 + (special ? 2 : meterFull ? 0.6 : 0));

    // Afterimages during specials and dashes.
    const trailing = special || f.state === 'dash' || f.state === 'sidestep' || f.state === 'backdash';
    this.ghostTimer -= dt;
    if (trailing && this.ghostTimer <= 0) {
      this.ghostTimer = special ? 0.06 : 0.07;
      const g = this.ghosts[this.ghostIdx];
      this.ghostIdx = (this.ghostIdx + 1) % this.ghosts.length;
      g.capture(this.model.mesh);
      g.life = special ? 1 : 0.55;
    }
    for (const g of this.ghosts) {
      if (!g.mesh.visible) continue;
      g.life -= dt * 3.2;
      if (g.life <= 0) g.hide();
      g.mat.uniforms.uOpacity.value = Math.max(0, g.life) * 0.9;
    }

    // Hit flash via emissive override; reaching exactly 0 restores the base emissive.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7);
      const k = Math.min(1, this.flash) * 0.6;
      for (const e of this.baseEmissive) {
        e.m.emissive.copy(e.c).lerp(this.flashColor, k);
        e.m.emissiveIntensity = e.i + this.flash * 0.8;
      }
    }
  }

  /** Hide/show (menus show only one fighter at a time). */
  setVisible(v: boolean): void {
    this.group.visible = v;
    this.blob.visible = v;
    for (const r of this.model.ribbons) r.mesh.visible = v;
    if (!v)
      for (const g of this.ghosts) {
        g.life = 0;
        g.hide();
      }
  }
}

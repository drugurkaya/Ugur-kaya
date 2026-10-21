import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA_RADIUS } from '../combat/data';
import { Rng } from '../core/math';
import type { SettingsData } from '../core/Settings';
import { PlanarReflection } from '../render/Renderer';
import { detailSet, radialTexture, runeMetal, stoneFloor, type PBRSet } from '../render/textures';

/*
 * "The Forsaken Temple": an abandoned futuristic fighting temple at night.
 * Art direction: cold moonlight (teal/blue) as the dominant key, warm amber
 * braziers as the counter-light, and a restrained cyan rune accent marking
 * the fighting circle. Everything else stays dark and desaturated so the
 * fighters read clearly against it.
 */

export const PALETTE = {
  fog: new THREE.Color('#0b1218'),
  skyTop: new THREE.Color('#03060b'),
  skyHorizon: new THREE.Color('#13222b'),
  moon: new THREE.Color('#bcd6ff'),
  fire: new THREE.Color('#ff8a3a'),
  rune: new THREE.Color('#3fd8ff'),
};

const PLATFORM_R = 8.4;

const flameMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSeed;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += noise(p) * a; p *= 2.1; a *= 0.5; } return s; }
      void main() {
        vec2 uv = vUv;
        float t = uTime * 1.6 + uSeed * 10.0;
        float n = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t));
        float width = mix(0.42, 0.04, pow(uv.y, 0.8));
        float d = abs(uv.x - 0.5 + (n - 0.5) * 0.25 * uv.y);
        float shape = smoothstep(width, width * 0.2, d) * smoothstep(1.0, 0.25, uv.y + n * 0.35) * smoothstep(0.0, 0.08, uv.y);
        vec3 hot = vec3(1.0, 0.85, 0.55) * 4.0;
        vec3 mid = vec3(1.0, 0.42, 0.1) * 2.6;
        vec3 cool = vec3(0.6, 0.12, 0.03) * 1.2;
        vec3 col = mix(mid, hot, smoothstep(0.55, 0.95, shape));
        col = mix(cool, col, smoothstep(0.1, 0.5, shape));
        gl_FragColor = vec4(col * shape, shape);
      }
    `,
  });

const skyMaterial = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: PALETTE.skyTop },
      uHorizon: { value: PALETTE.skyHorizon },
      uMoonDir: { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() },
      uMoon: { value: PALETTE.moon },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uMoon, uMoonDir;
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.05, 0.6, h), 0.7));
        // Thin drifting clouds, lit by the moon.
        float c = noise(d * 4.0 + vec3(uTime * 0.01, 0.0, 0.0)) * 0.6 + noise(d * 9.0 - vec3(0.0, 0.0, uTime * 0.015)) * 0.4;
        c = smoothstep(0.5, 0.85, c) * smoothstep(0.0, 0.25, d.y);
        float md = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.08, 0.11, 0.14) * c * (0.4 + pow(md, 8.0) * 2.0);
        // Moon disc + halo.
        col += uMoon * smoothstep(0.9988, 0.9992, md) * 3.5;
        col += uMoon * pow(md, 64.0) * 0.35 + uMoon * pow(md, 6.0) * 0.05;
        // Stars.
        vec3 sp = floor(d * 380.0);
        float s = step(0.9975, hash(sp)) * smoothstep(0.05, 0.4, d.y) * (1.0 - c);
        col += vec3(s) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(sp) * 30.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

/** Volumetric light shaft (additive cone with soft edges and fresnel fade). */
const shaftMaterial = (color: THREE.Color, intensity: number): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: color }, uIntensity: { value: intensity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity, uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float fall = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 12.0);
        gl_FragColor = vec4(uColor * edge * fall * uIntensity * flick, 1.0);
      }
    `,
  });

export class Arena {
  readonly group = new THREE.Group();
  readonly reflection: PlanarReflection;
  readonly floor: THREE.Mesh;
  readonly moon: THREE.DirectionalLight;
  private flames: THREE.ShaderMaterial[] = [];
  private fireLights: { light: THREE.PointLight; base: number; seed: number }[] = [];
  private sky: THREE.ShaderMaterial;
  private shafts: THREE.ShaderMaterial[] = [];
  private orbs: THREE.InstancedMesh;
  private orbData: { r: number; a: number; y: number; speed: number; bob: number }[] = [];
  private dust: THREE.Points;
  private runeMat: THREE.MeshStandardMaterial;
  private dummy = new THREE.Object3D();
  private time = 0;
  /** Extra rune glow pulse (special moves). */
  runePulse = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, texSize: number, onProgress: (p: number) => void) {
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(PALETTE.fog, 0.03);
    scene.background = PALETTE.fog;
    this.reflection = new PlanarReflection(0);

    // --- Materials -------------------------------------------------------
    const floorTex = stoneFloor(texSize, 11);
    onProgress(0.25);
    const stone = detailSet('stone', texSize / 2, 21);
    const metal = detailSet('metal', texSize / 2, 8);
    const runes = runeMetal(texSize / 2, 5);
    onProgress(0.45);

    const floorMat = new THREE.MeshStandardMaterial({
      ...floorTex,
      color: new THREE.Color('#a9aaa6'),
      roughness: 1,
      metalness: 0.0,
      normalScale: new THREE.Vector2(0.8, 0.8),
      envMapIntensity: 0.35,
    });
    for (const t of Object.values(floorTex)) (t as THREE.Texture).repeat.set(4, 4);
    this.reflection.patch(floorMat);

    const stoneMat = (tint = '#6d6f6f', repeat = 2, repeatY = repeat): THREE.MeshStandardMaterial => {
      const s = cloneSet(stone, repeat, repeatY);
      return new THREE.MeshStandardMaterial({ ...s, color: new THREE.Color(tint), roughness: 1, metalness: 0, envMapIntensity: 0.35 });
    };
    const metalMat = new THREE.MeshStandardMaterial({
      ...cloneSet(metal, 2),
      color: new THREE.Color('#4a4d52'),
      metalness: 0.9,
      roughness: 1,
      envMapIntensity: 1.0,
    });
    this.runeMat = new THREE.MeshStandardMaterial({
      ...cloneSet(runes, 1),
      color: new THREE.Color('#5a5c60'),
      metalness: 0.85,
      roughness: 1,
      emissive: PALETTE.rune,
      emissiveIntensity: 1.6,
      envMapIntensity: 1.0,
    });
    runes.map.repeat.set(4, 1);

    // --- Sky + distant ground -------------------------------------------
    this.sky = skyMaterial();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);

    const groundMat = stoneMat('#3a3d3f', 24);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // --- Platform ---------------------------------------------------------
    const floorGeo = new THREE.CircleGeometry(PLATFORM_R - 0.9, 96);
    floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.receiveShadow = true;
    this.group.add(this.floor);

    // Rune ring that marks the fighting boundary.
    const ringGeo = new THREE.RingGeometry(PLATFORM_R - 0.9, PLATFORM_R - 0.25, 128, 1);
    remapRingUV(ringGeo, PLATFORM_R - 0.9, PLATFORM_R - 0.25);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, this.runeMat);
    ring.position.y = 0.004;
    ring.receiveShadow = true;
    this.group.add(ring);

    // Thin inner metal inlays.
    for (const r of [2.2, 4.6]) {
      const g = new THREE.RingGeometry(r - 0.035, r + 0.035, 128);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, metalMat);
      m.position.y = 0.003;
      m.receiveShadow = true;
      this.group.add(m);
    }

    // Platform rim and stepped base.
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R + 0.05, 0.35, 96, 1, true), stoneMat('#5a5d5f', 12, 0.5));
    rim.position.y = -0.175;
    rim.receiveShadow = true;
    this.group.add(rim);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R - 0.12, 0.13, 8, 128), metalMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -0.02;
    lip.castShadow = false;
    this.group.add(lip);
    for (let i = 0; i < 3; i++) {
      const r = PLATFORM_R + 0.6 + i * 0.7;
      const stepMat = stoneMat('#4c4f50', 8);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 96), stepMat);
      step.position.y = -0.35 - i * 0.28;
      step.receiveShadow = true;
      this.group.add(step);
    }
    onProgress(0.6);

    // --- Pillars (instanced) ---------------------------------------------
    const rng = new Rng(77);
    const pillarGeo = buildPillarGeometry();
    const pillarMat = stoneMat('#7a7b78', 2, 5);
    const pillarCount = 12;
    const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCount);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.25, 24), metalMat, pillarCount * 2);
    bands.castShadow = true;
    let bi = 0;
    for (let i = 0; i < pillarCount; i++) {
      const a = (i / pillarCount) * Math.PI * 2 + 0.13;
      const r = 12.5 + rng.range(-0.3, 0.6);
      const broken = i % 3 === 1;
      const h = broken ? rng.range(0.35, 0.6) : rng.range(0.95, 1.15);
      this.dummy.position.set(Math.cos(a) * r, -1.2, Math.sin(a) * r);
      this.dummy.rotation.set(broken ? rng.range(-0.05, 0.05) : 0, rng.range(0, Math.PI), broken ? rng.range(-0.06, 0.06) : 0);
      this.dummy.scale.set(1, h, 1);
      this.dummy.updateMatrix();
      pillars.setMatrixAt(i, this.dummy.matrix);
      for (const fy of [0.18, 0.78]) {
        if (fy * 9 * h > 9 * h - 0.3) continue;
        this.dummy.position.set(Math.cos(a) * r, -1.2 + fy * 9 * h, Math.sin(a) * r);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        bands.setMatrixAt(bi++, this.dummy.matrix);
      }
    }
    bands.count = bi;
    this.group.add(pillars, bands);

    // --- Background architecture: arches, monoliths, halo gates -----------
    this.buildArchitecture(stoneMat('#4f5252', 3), metalMat, rng);
    onProgress(0.72);

    // --- Braziers -----------------------------------------------------------
    const brazierAngles = [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 + (3 * Math.PI) / 2];
    brazierAngles.forEach((a, i) => this.buildBrazier(Math.cos(a) * 10.2, Math.sin(a) * 10.2, metalMat, stoneMat('#5d5f60', 1), i));

    // --- Lights ----------------------------------------------------------------
    scene.add(new THREE.HemisphereLight('#2a3c4a', '#0b0a08', 0.55));
    this.moon = new THREE.DirectionalLight(PALETTE.moon, 2.2);
    this.moon.position.set(-9, 16, -12);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -10;
    sc.near = 2;
    sc.far = 45;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.03;
    this.moon.shadow.radius = 3;
    scene.add(this.moon, this.moon.target);
    // Rim/fill lights to separate fighters from the dark background.
    const rimWarm = new THREE.DirectionalLight('#ff9c5a', 0.8);
    rimWarm.position.set(10, 5, 9);
    const rimCool = new THREE.DirectionalLight('#6fb7ff', 0.6);
    rimCool.position.set(-6, 3, 12);
    scene.add(rimWarm, rimCool);
    // Overhead key so faces are readable when the camera turns away from the moon.
    const top = new THREE.SpotLight('#cfe2ff', 40, 30, 0.6, 0.6, 1.6);
    top.position.set(0, 14, 0);
    top.target.position.set(0, 0, 0);
    scene.add(top, top.target);

    // --- Light shafts from the moon through the ruins -------------------------
    const shaftGeo = new THREE.CylinderGeometry(0.6, 3.2, 26, 24, 1, true);
    shaftGeo.translate(0, -13, 0);
    for (const [x, z, s] of [
      [-4, -6, 0.05],
      [5, -9, 0.035],
      [-11, 3, 0.03],
    ]) {
      const mat = shaftMaterial(new THREE.Color('#7fb1e0'), s);
      this.shafts.push(mat);
      const shaft = new THREE.Mesh(shaftGeo, mat);
      shaft.position.set(x - 7, 22, z - 9);
      shaft.lookAt(x, 0, z);
      shaft.rotateX(-Math.PI / 2);
      shaft.renderOrder = 5;
      this.group.add(shaft);
    }

    // --- Floating lanterns (distant moving lights, instanced) -----------------
    const orbCount = 36;
    this.orbs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb36b').multiplyScalar(3.2), fog: true }),
      orbCount,
    );
    for (let i = 0; i < orbCount; i++) {
      this.orbData.push({ r: rng.range(24, 46), a: rng.range(0, Math.PI * 2), y: rng.range(5, 16), speed: rng.range(0.004, 0.012) * (rng.chance(0.5) ? 1 : -1), bob: rng.range(0, 10) });
    }
    this.group.add(this.orbs);

    // --- Dust motes --------------------------------------------------------
    const dustCount = 420;
    const dpos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 11;
      dpos.set([Math.cos(a) * r, rng.range(0.1, 6), Math.sin(a) * r], i * 3);
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(
      dgeo,
      new THREE.PointsMaterial({
        size: 0.05,
        map: radialTexture(32, [
          [0, 'rgba(255,255,255,1)'],
          [1, 'rgba(255,255,255,0)'],
        ]),
        color: new THREE.Color('#9fb8c8'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.dust);

    // --- Environment map for PBR reflections -------------------------------
    scene.environment = buildEnvironment(renderer);
    onProgress(1);
  }

  private buildBrazier(x: number, z: number, metalMat: THREE.Material, stoneMat: THREE.Material, i: number): void {
    const g = new THREE.Group();
    g.position.set(x, -1.2, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 8), stoneMat);
    base.position.y = 0.8;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.45, 16, 1, true), metalMat);
    bowl.position.y = 1.85;
    const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24), metalMat);
    bowlRim.rotation.x = Math.PI / 2;
    bowlRim.position.y = 2.07;
    const coals = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a1a').multiplyScalar(2.2) }),
    );
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = 1.98;
    for (const m of [base, bowl, bowlRim]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    g.add(base, bowl, bowlRim, coals);
    const flameGeo = new THREE.PlaneGeometry(1.1, 1.9);
    flameGeo.translate(0, 0.95, 0);
    for (let k = 0; k < 3; k++) {
      const mat = flameMaterial();
      mat.uniforms.uSeed.value = i * 3.7 + k * 1.3;
      this.flames.push(mat);
      const f = new THREE.Mesh(flameGeo, mat);
      f.position.y = 1.95;
      f.rotation.y = (k / 3) * Math.PI;
      f.scale.setScalar(1 - k * 0.12);
      f.renderOrder = 6;
      g.add(f);
    }
    const light = new THREE.PointLight(PALETTE.fire, 14, 16, 1.7);
    light.position.y = 3.0;
    g.add(light);
    this.fireLights.push({ light, base: 14, seed: i * 5.1 });
    this.group.add(g);
  }

  private buildArchitecture(stoneMat: THREE.Material, metalMat: THREE.Material, rng: Rng): void {
    // Ring of ruined arches.
    const archParts: THREE.BufferGeometry[] = [];
    const archCount = 9;
    for (let i = 0; i < archCount; i++) {
      if (i === 4) continue; // a collapsed gap for variety
      const a = (i / archCount) * Math.PI * 2 + 0.3;
      const r = 21 + rng.range(-1, 1.5);
      const h = rng.range(9, 13);
      const legL = new THREE.BoxGeometry(1.4, h, 1.4);
      legL.translate(-2.6, h / 2, 0);
      const legR = new THREE.BoxGeometry(1.4, h * (i % 2 ? 0.75 : 1), 1.4);
      legR.translate(2.6, (h * (i % 2 ? 0.75 : 1)) / 2, 0);
      const parts = [legL, legR];
      if (!(i % 2)) {
        const top = new THREE.BoxGeometry(7, 1.1, 1.6);
        top.translate(0, h + 0.55, 0);
        const crown = new THREE.BoxGeometry(3, 0.8, 1.2);
        crown.translate(0, h + 1.5, 0);
        parts.push(top, crown);
      }
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * r, -1.2, Math.sin(a) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      for (const p of parts) archParts.push(p.applyMatrix4(m));
    }
    const arches = new THREE.Mesh(mergeGeometries(archParts), stoneMat);
    arches.castShadow = false;
    arches.receiveShadow = true;
    this.group.add(arches);

    // Distant monolith towers with faint glowing slits.
    const slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3fd8ff').multiplyScalar(1.4) });
    const towerParts: THREE.BufferGeometry[] = [];
    const slitParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const r = rng.range(48, 70);
      const h = rng.range(25, 50);
      const w = rng.range(3, 6);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * r, -1.2, Math.sin(a) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI), 0)),
        new THREE.Vector3(1, 1, 1),
      );
      const t = new THREE.CylinderGeometry(w * 0.55, w, h, 6);
      t.translate(0, h / 2, 0);
      towerParts.push(t.applyMatrix4(m));
      const slit = new THREE.BoxGeometry(0.25, h * 0.5, w * 0.95);
      slit.translate(0, h * 0.55, 0);
      slitParts.push(slit.applyMatrix4(m));
    }
    this.group.add(new THREE.Mesh(mergeGeometries(towerParts), stoneMat), new THREE.Mesh(mergeGeometries(slitParts), slitMat));

    // Two colossal halo gates: the temple's "futuristic" signature.
    for (const [a, r, s] of [
      [-2.2, 40, 1],
      [0.9, 55, 0.8],
    ]) {
      const halo = new THREE.Group();
      halo.position.set(Math.cos(a) * r, 9 * s, Math.sin(a) * r);
      halo.lookAt(0, 9 * s, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12 * s, 0.9 * s, 12, 96), metalMat);
      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(11.1 * s, 0.08 * s, 6, 128),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#3fd8ff').multiplyScalar(2.0) }),
      );
      halo.add(ring, inner);
      for (let k = 0; k < 12; k++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(1.2 * s, 2.6 * s, 1.6 * s), stoneMat);
        const ang = (k / 12) * Math.PI * 2;
        seg.position.set(Math.cos(ang) * 12 * s, Math.sin(ang) * 12 * s, 0);
        seg.rotation.z = ang;
        halo.add(seg);
      }
      this.group.add(halo);
    }
  }

  applySettings(s: SettingsData): void {
    this.reflection.enabled = s.reflections;
    this.moon.castShadow = s.shadows;
    const sz = s.quality === 'ultra' ? 4096 : s.quality === 'high' ? 2048 : 1024;
    if (this.moon.shadow.mapSize.x !== sz) {
      this.moon.shadow.mapSize.set(sz, sz);
      this.moon.shadow.map?.dispose();
      this.moon.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    // Fewer dynamic lights on low quality.
    this.fireLights.forEach((f, i) => (f.light.visible = s.quality !== 'low' || i < 2));
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.flames) f.uniforms.uTime.value = t;
    for (const s of this.shafts) s.uniforms.uTime.value = t;
    this.sky.uniforms.uTime.value = t;
    for (const f of this.fireLights) {
      const flick = Math.sin(t * 11 + f.seed) * 0.08 + Math.sin(t * 23.7 + f.seed * 2) * 0.05 + Math.sin(t * 5.3 + f.seed) * 0.07;
      f.light.intensity = f.base * (1 + flick);
    }
    this.runePulse = Math.max(0, this.runePulse - dt * 1.5);
    this.runeMat.emissiveIntensity = 1.4 + Math.sin(t * 1.3) * 0.25 + this.runePulse * 4;

    for (let i = 0; i < this.orbData.length; i++) {
      const o = this.orbData[i];
      o.a += o.speed * dt * 6;
      this.dummy.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(t * 0.4 + o.bob) * 0.8, Math.sin(o.a) * o.r);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.8 + Math.sin(t * 2 + o.bob) * 0.15);
      this.dummy.updateMatrix();
      this.orbs.setMatrixAt(i, this.dummy.matrix);
    }
    this.orbs.instanceMatrix.needsUpdate = true;

    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(t * 0.3 + i) * 0.002;
      arr[i + 1] += 0.004 + Math.sin(t * 0.5 + i * 0.1) * 0.002;
      arr[i + 2] += Math.cos(t * 0.25 + i) * 0.002;
      if (arr[i + 1] > 6) arr[i + 1] = 0.1;
    }
    p.needsUpdate = true;
  }
}

function cloneSet(s: PBRSet, repeat: number, repeatY = repeat): PBRSet {
  const c = (t: THREE.Texture) => {
    const n = t.clone();
    n.repeat.set(repeat, repeatY);
    n.needsUpdate = true;
    return n;
  };
  return {
    map: c(s.map),
    roughnessMap: c(s.roughnessMap),
    normalMap: c(s.normalMap),
    ...(s.emissiveMap ? { emissiveMap: c(s.emissiveMap) } : {}),
  };
}

/** Ring UVs: u around the circle, v across the band (so rune glyphs wrap). */
function remapRingUV(g: THREE.BufferGeometry, r0: number, r1: number): void {
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = Math.atan2(y, x);
    uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 4, (Math.hypot(x, y) - r0) / (r1 - r0));
  }
  uv.needsUpdate = true;
}

/** Fluted pillar with base and capital, 9 m tall at scale 1. */
function buildPillarGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  const pts: [number, number][] = [
    [0, 0],
    [0.95, 0],
    [0.95, 0.35],
    [0.8, 0.45],
    [0.72, 0.6],
    [0.62, 0.9],
    [0.58, 7.9],
    [0.7, 8.1],
    [0.85, 8.45],
    [0.9, 8.7],
    [0.9, 9.0],
    [0, 9.0],
  ];
  for (const [x, y] of pts) profile.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 24);
  // Flutes: modulate radius of the shaft section.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.95 && y < 7.85) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 - 0.05 * Math.pow(Math.abs(Math.sin(a * 6)), 0.5);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  // Lathe UVs follow profile points; re-map v by height so stone texels stay square.
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / 9);
  return g;
}

/** Small dark environment for PMREM: cool sky dome + warm/cool emitters. */
function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(vec3(0.03,0.035,0.035), vec3(0.06,0.1,0.14), smoothstep(-0.2,0.8,h)); gl_FragColor = vec4(c,1.0); }`,
    }),
  );
  env.add(dome);
  const emit = (color: string, intensity: number, pos: [number, number, number], size: [number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  emit('#bcd6ff', 6, [-20, 25, -30], [14, 14]);
  emit('#ff8a3a', 4, [25, 4, 10], [8, 5]);
  emit('#ff8a3a', 4, [-25, 4, 15], [8, 5]);
  emit('#3fd8ff', 1.5, [0, -6, 30], [30, 2]);
  emit('#cfe2ff', 3, [0, 40, 0], [20, 20]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}

export { ARENA_RADIUS };

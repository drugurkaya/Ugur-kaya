import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SettingsData } from '../core/Settings';

/** Final grade in display space: vignette, split-tone, impact chromatic aberration, grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uAberration: { value: 0 },
    uGrain: { value: 0.025 },
    uSaturation: { value: 1.0 },
    uFlash: { value: 0 },
    uDesaturate: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uAberration, uGrain, uSaturation, uFlash, uDesaturate;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uAberration * 0.02;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // Split tone: cool shadows, warm highlights (subtle).
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.92, 1.0, 1.08), (1.0 - smoothstep(0.0, 0.45, l)) * 0.5);
      col = mix(col, col * vec3(1.05, 1.0, 0.94), smoothstep(0.55, 1.0, l) * 0.4);
      float sat = uSaturation * (1.0 - uDesaturate);
      col = mix(vec3(l), col, sat);
      // Gentle S-curve contrast.
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      col *= 1.0 - uVignette * smoothstep(0.08, 0.55, r2 * 1.6);
      col += uFlash;
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private width = 1;
  private height = 1;
  private scale = 1;
  private msaa = 4;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.85);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get webgl(): THREE.WebGLRenderer {
    return this.renderer;
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  applySettings(s: SettingsData): void {
    this.renderer.shadowMap.enabled = s.shadows;
    this.bloom.enabled = s.bloom;
    this.scale = s.resolutionScale;
    const samples = s.quality === 'low' ? 0 : s.quality === 'medium' ? 2 : 4;
    if (samples !== this.msaa) {
      this.msaa = samples;
      this.composer.renderTarget1.samples = samples;
      this.composer.renderTarget2.samples = samples;
    }
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // Bloom at reduced resolution is visually identical and much cheaper.
    this.bloom.setSize(Math.max(1, (w * pr) / 2), Math.max(1, (h * pr) / 2));
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  render(dt: number): void {
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 1000;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}

/**
 * Planar reflection for the arena floor: renders a mirrored view into a
 * half-resolution target and injects it into the floor's standard material,
 * attenuated by roughness so polished stone reflects and grout doesn't.
 */
export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  private virtualCamera = new THREE.PerspectiveCamera();
  enabled = true;
  strength = 0.32;
  readonly uniforms = {
    tReflect: { value: null as THREE.Texture | null },
    uReflectMatrix: { value: new THREE.Matrix4() },
    uReflectStrength: { value: 0.55 },
  };

  constructor(private readonly height = 0) {
    this.target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    this.uniforms.tReflect.value = this.target.texture;
    this.uniforms.uReflectMatrix.value = this.textureMatrix;
  }

  /** Patch a MeshStandardMaterial to sample the reflection texture. */
  patch(mat: THREE.MeshStandardMaterial): void {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflectMatrix;\nvarying vec4 vReflUv;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvReflUv = uReflectMatrix * modelMatrix * vec4(transformed, 1.0);',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D tReflect;\nuniform float uReflectStrength;\nvarying vec4 vReflUv;',
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            vec2 ruv = vReflUv.xy / vReflUv.w + normal.xz * 0.03;
            float spread = roughnessFactor * 0.012;
            vec3 refl = texture2D(tReflect, ruv).rgb * 0.4;
            refl += texture2D(tReflect, ruv + vec2(spread, 0.0)).rgb * 0.15;
            refl += texture2D(tReflect, ruv - vec2(spread, 0.0)).rgb * 0.15;
            refl += texture2D(tReflect, ruv + vec2(0.0, spread)).rgb * 0.15;
            refl += texture2D(tReflect, ruv - vec2(0.0, spread)).rgb * 0.15;
            float gloss = pow(clamp(1.0 - roughnessFactor, 0.0, 1.0), 1.5);
            float fres = 0.35 + 0.65 * pow(1.0 - clamp(dot(normalize(vViewPosition), -normal) , 0.0, 1.0), 3.0);
            outgoingLight += refl * gloss * fres * uReflectStrength;
          }
          #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'planar-reflection';
  }

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
  }

  private normal = new THREE.Vector3(0, 1, 0);
  private plane = new THREE.Plane();
  private clipPlane = new THREE.Vector4();
  private q = new THREE.Vector4();
  private camPos = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]): void {
    this.uniforms.uReflectStrength.value = this.enabled ? this.strength : 0;
    if (!this.enabled) return;
    const vc = this.virtualCamera;
    const n = this.normal;
    const mirrorPoint = this.tmp.set(0, this.height, 0);
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (this.camPos.y < this.height) return;
    // Mirror position and view direction about the plane y = height.
    vc.position.set(this.camPos.x, 2 * this.height - this.camPos.y, this.camPos.z);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this.lookTarget.copy(this.camPos).add(dir);
    this.lookTarget.y = 2 * this.height - this.lookTarget.y;
    vc.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    vc.up.y = -vc.up.y;
    vc.lookAt(this.lookTarget);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);

    // Oblique near plane clipping so geometry below the floor never shows.
    this.plane.setFromNormalAndCoplanarPoint(n, mirrorPoint);
    this.plane.applyMatrix4(vc.matrixWorldInverse);
    this.clipPlane.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = vc.projectionMatrix;
    const q = this.q;
    q.x = (Math.sign(this.clipPlane.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(this.clipPlane.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(q));
    pm.elements[2] = this.clipPlane.x;
    pm.elements[6] = this.clipPlane.y;
    pm.elements[10] = this.clipPlane.z + 1.0 - 0.003;
    pm.elements[14] = this.clipPlane.w;

    for (const h of hide) h.visible = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevTarget);
    for (const h of hide) h.visible = true;
  }
}

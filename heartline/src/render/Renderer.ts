import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PRESETS, type Quality } from '../core/Settings';

/**
 * Cinematic grade in display space: per-scene colour tint, contrast and saturation, vignette that
 * tightens with stress, a red pulse at high stress, slight chromatic aberration, film grain.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStress: { value: 0 },
    uPulse: { value: 0 },
    uFade: { value: 0 },
    uWarm: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 0.12 },
    uSaturation: { value: 1 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uStress, uPulse, uFade, uWarm, uContrast, uSaturation;
    uniform vec3 uTint, uLift;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // Lens: a touch of chromatic aberration towards the edges, stronger under stress.
      vec2 off = c * (0.0015 + uStress * 0.004);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Split toning: cool shadows, warm highlights.
      col = mix(col, col * vec3(0.9, 0.98, 1.1), (1.0 - smoothstep(0.0, 0.4, l)) * 0.45);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.5, 1.0, l) * (0.3 + uWarm));
      col = col * uTint + uLift * (1.0 - l);
      col = mix(vec3(l), col, uSaturation * (1.0 - uStress * 0.35));
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
      float vig = 0.3 + uStress * 0.35 + uPulse * 0.12;
      col *= 1.0 - vig * smoothstep(0.06, 0.5, r2 * 1.7);
      col += vec3(uPulse * 0.05, 0.0, 0.0) * smoothstep(0.1, 0.5, r2 * 1.7);
      col += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.025;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Per-place colour grade. */
export interface Grade {
  tint: [number, number, number];
  lift?: [number, number, number];
  contrast?: number;
  saturation?: number;
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private bokeh: BokehPass | null = null;
  private gtao: GTAOPass | null = null;
  grade: ShaderPass | null = null;
  private envRT: THREE.WebGLRenderTarget;
  quality: Quality;
  /** Live effect values set by the game every frame. */
  fx = { stress: 0, pulse: 0, fade: 0, warm: 0, dof: 0, focus: 3 };
  private gradeTarget: Grade = { tint: [1, 1, 1] };

  constructor(
    private container: HTMLElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.gl.domElement);
    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.apply(quality);
    window.addEventListener('resize', () => this.resize());
  }

  get envMap() {
    return this.envRT.texture;
  }

  setGrade(g: Grade) {
    this.gradeTarget = g;
  }

  apply(q: Quality) {
    this.quality = q;
    const p = PRESETS[q];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    this.gl.shadowMap.enabled = p.shadows;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.bokeh = null;
    this.gtao = null;
    this.grade = null;
    if (p.post) {
      // Multisampled target so edges stay smooth with post-processing on.
      const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.gl, rt);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera();
      this.renderPass = new RenderPass(scene, cam);
      this.composer.addPass(this.renderPass);
      if (p.ao) {
        this.gtao = new GTAOPass(scene, cam, size.x, size.y);
        this.gtao.blendIntensity = 0.75;
        this.composer.addPass(this.gtao);
      }
      if (p.dof) {
        this.bokeh = new BokehPass(scene, cam, { focus: 3, aperture: 0.004, maxblur: 0.008 });
        this.bokeh.enabled = false;
        this.composer.addPass(this.bokeh);
      }
      if (p.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.55, 0.9);
        this.composer.addPass(this.bloom);
      }
      this.composer.addPass(new OutputPass());
      // Grade runs after the output transform so it works in display space.
      this.grade = new ShaderPass(GradeShader);
      this.composer.addPass(this.grade);
    }
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.gl.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w / 2, h / 2);
    this.onResize?.(w / h);
  }

  onResize?: (aspect: number) => void;

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, dt: number) {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.gtao) {
        this.gtao.scene = scene;
        this.gtao.camera = camera;
      }
      if (this.bokeh) {
        // Depth of field only in close-ups: keeps exploration cheap and sharp.
        const on = this.fx.dof > 0.05;
        this.bokeh.enabled = on;
        if (on) {
          this.bokeh.scene = scene;
          this.bokeh.camera = camera;
          const u = this.bokeh.uniforms as Record<string, THREE.IUniform>;
          u.focus.value = this.fx.focus;
          u.aperture.value = 0.0045 * this.fx.dof;
          u.maxblur.value = 0.009;
        }
      }
      if (this.grade) {
        const u = this.grade.uniforms;
        u.uTime.value = time;
        u.uStress.value = this.fx.stress;
        u.uPulse.value = this.fx.pulse;
        u.uFade.value = this.fx.fade;
        u.uWarm.value = this.fx.warm;
        // Ease the scene grade so cuts between places do not snap.
        const k = 1 - Math.exp(-2.5 * dt);
        const g = this.gradeTarget;
        (u.uTint.value as THREE.Vector3).lerp(new THREE.Vector3(...g.tint), k);
        (u.uLift.value as THREE.Vector3).lerp(new THREE.Vector3(...(g.lift ?? [0, 0, 0])), k);
        u.uContrast.value += ((g.contrast ?? 0.14) - u.uContrast.value) * k;
        u.uSaturation.value += ((g.saturation ?? 1) - u.uSaturation.value) * k;
      }
      this.composer.render();
    } else this.gl.render(scene, camera);
  }
}

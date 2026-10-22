import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PRESETS, type Quality } from '../core/Settings';

/** Cinematic grade: vignette that tightens with stress, desaturation, warm/cool split, film grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStress: { value: 0 },
    uPulse: { value: 0 },
    uFade: { value: 0 },
    uWarm: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uStress, uPulse, uFade, uWarm;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.9, 0.98, 1.1), (1.0 - smoothstep(0.0, 0.4, l)) * 0.45);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), smoothstep(0.5, 1.0, l) * (0.35 + uWarm));
      col = mix(vec3(l), col, 1.0 - uStress * 0.35);
      float vig = 0.28 + uStress * 0.35 + uPulse * 0.12;
      col *= 1.0 - vig * smoothstep(0.06, 0.5, r2 * 1.7);
      col += vec3(uPulse * 0.05, 0.0, 0.0) * smoothstep(0.1, 0.5, r2 * 1.7);
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.03;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  private envRT: THREE.WebGLRenderTarget;
  quality: Quality;
  /** Uniform values mirrored for the no-post path (fade is drawn with a DOM overlay there). */
  fx = { stress: 0, pulse: 0, fade: 0, warm: 0 };

  constructor(
    private container: HTMLElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ antialias: quality !== 'performance', powerPreference: 'high-performance' });
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

  apply(q: Quality) {
    this.quality = q;
    const p = PRESETS[q];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    this.gl.shadowMap.enabled = p.shadows;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.grade = null;
    if (p.post) {
      this.composer = new EffectComposer(this.gl);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      if (p.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 0.92);
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

  render(scene: THREE.Scene, camera: THREE.Camera, time: number) {
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.grade) {
        const u = this.grade.uniforms;
        u.uTime.value = time;
        u.uStress.value = this.fx.stress;
        u.uPulse.value = this.fx.pulse;
        u.uFade.value = this.fx.fade;
        u.uWarm.value = this.fx.warm;
      }
      this.composer.render();
    } else this.gl.render(scene, camera);
  }
}

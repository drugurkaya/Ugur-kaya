import * as THREE from 'three';
import { Rng } from '../core/math';

/*
 * Procedural texture generation. The project ships without third-party art,
 * so surface detail (stone, metal, fabric, leather, skin) is synthesised at
 * load time into PBR maps: albedo, roughness and tangent-space normals.
 */

const smoothstepJS = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

class Noise2D {
  private perm: Uint8Array;
  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** Tileable value noise with integer period. */
  value(x: number, y: number, period: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const h = (ix: number, iy: number) => {
      const a = ((ix % period) + period) % period;
      const b = ((iy % period) + period) % period;
      return this.perm[(this.perm[a & 255] + b) & 511] / 255;
    };
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  fbm(x: number, y: number, octaves: number, basePeriod: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(x * freq, y * freq, basePeriod * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

export interface PBRSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
  emissiveMap?: THREE.Texture;
}

const makeCanvas = (size: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
};

const toTexture = (canvas: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.Texture => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
};

/** Height field (0..1) -> tangent-space normal map canvas (tileable Sobel). */
const heightToNormal = (h: Float32Array, size: number, strength: number): HTMLCanvasElement => {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

const fieldToCanvas = (
  size: number,
  fn: (i: number) => [number, number, number],
): HTMLCanvasElement => {
  const [c, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fn(i);
    img.data[i * 4] = Math.max(0, Math.min(255, r * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, g * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

/** Large stone paving slabs with grout, wear, cracks and dirt. */
export function stoneFloor(size: number, seed = 11): PBRSet {
  const n = new Noise2D(seed);
  const rng = new Rng(seed);
  const tiles = 4;
  const height = new Float32Array(size * size);
  const albedo = new Float32Array(size * size * 3);
  const rough = new Float32Array(size * size);
  // Per-tile random tint & offset (staggered rows).
  const tileTint: number[] = [];
  for (let i = 0; i < tiles * tiles; i++) tileTint.push(rng.range(-0.06, 0.06));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * tiles;
      const v = (y / size) * tiles;
      const row = Math.floor(v);
      const uo = u + (row % 2) * 0.5;
      const col = Math.floor(uo) % tiles;
      const fu = uo - Math.floor(uo);
      const fv = v - row;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const warp = n.fbm(x / size * 8, y / size * 8, 3, 8) * 0.03;
      const groove = Math.min(1, Math.max(0, (edge - 0.006 - warp * 0.5) / 0.018));
      const big = n.fbm((x / size) * 6, (y / size) * 6, 5, 6);
      const fine = n.fbm((x / size) * 64, (y / size) * 64, 3, 64);
      // Cracks: thin ridges of a low-frequency noise.
      const cr = Math.abs(n.fbm((x / size) * 10 + 3.7, (y / size) * 10 + 1.3, 4, 10) - 0.5);
      const crack = Math.max(0, 1 - cr / 0.006) * smoothstepJS(0.55, 0.65, big);
      const i = y * size + x;
      const tint = tileTint[row * tiles + col] ?? 0;
      height[i] = groove * (0.8 + big * 0.12 + fine * 0.08) - crack * 0.15;
      const base = 0.24 + big * 0.12 + fine * 0.06 + tint;
      const dirt = (1 - groove) * 0.45 + crack * 0.4;
      albedo[i * 3] = base * (1 - dirt * 0.5) * 0.96;
      albedo[i * 3 + 1] = base * (1 - dirt * 0.5) * 0.98;
      albedo[i * 3 + 2] = base * (1 - dirt * 0.5) * 1.04;
      // Polished centres, rough grout: gives the wet-stone reflection look.
      rough[i] = 0.5 + (1 - groove) * 0.35 + fine * 0.2 + crack * 0.2 + (big - 0.5) * 0.35;
    }
  }
  const map = toTexture(fieldToCanvas(size, (i) => [albedo[i * 3], albedo[i * 3 + 1], albedo[i * 3 + 2]]), true);
  const roughnessMap = toTexture(fieldToCanvas(size, (i) => [0, rough[i], 0]), false);
  const normalMap = toTexture(heightToNormal(height, size, 2.2), false);
  return { map, roughnessMap, normalMap };
}

/** Engraved metal ring with glowing rune channels (emissive). */
export function runeMetal(size: number, seed = 5): PBRSet {
  const n = new Noise2D(seed);
  const rng = new Rng(seed);
  const height = new Float32Array(size * size);
  const em = new Float32Array(size * size);
  const alb = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  // Glyph segments along the u axis (texture is wrapped around a ring).
  const glyphs: { u0: number; u1: number; v0: number; v1: number }[] = [];
  const count = 24;
  for (let g = 0; g < count; g++) {
    const cx = (g + 0.5) / count;
    const w = 0.5 / count;
    const strokes = 3 + Math.floor(rng.next() * 3);
    for (let s = 0; s < strokes; s++) {
      if (rng.chance(0.5)) {
        const v = rng.range(0.3, 0.7);
        glyphs.push({ u0: cx - w * rng.range(0.3, 0.8), u1: cx + w * rng.range(0.3, 0.8), v0: v - 0.02, v1: v + 0.02 });
      } else {
        const u = cx + rng.range(-0.6, 0.6) * w;
        glyphs.push({ u0: u - 0.0025, u1: u + 0.0025, v0: rng.range(0.28, 0.45), v1: rng.range(0.55, 0.72) });
      }
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      let rune = 0;
      for (const g of glyphs) if (u >= g.u0 && u <= g.u1 && v >= g.v0 && v <= g.v1) rune = 1;
      const brushed = n.fbm(u * 2, v * 128, 3, 2);
      const scratches = Math.max(0, n.fbm(u * 40, v * 3, 2, 40) - 0.62) * 3;
      const border = v < 0.12 || v > 0.88 ? 1 : 0;
      height[i] = 0.6 - rune * 0.4 + border * 0.25 + brushed * 0.05;
      em[i] = rune;
      alb[i] = 0.32 + brushed * 0.1 - scratches * 0.05;
      rough[i] = 0.28 + brushed * 0.2 + scratches * 0.25 + rune * 0.4;
    }
  }
  const map = toTexture(fieldToCanvas(size, (i) => [alb[i] * 0.95, alb[i] * 0.93, alb[i] * 0.9]), true);
  const roughnessMap = toTexture(fieldToCanvas(size, (i) => [0, rough[i], 1]), false);
  const normalMap = toTexture(heightToNormal(height, size, 3), false);
  const emissiveMap = toTexture(fieldToCanvas(size, (i) => [em[i], em[i], em[i]]), true);
  return { map, roughnessMap, normalMap, emissiveMap };
}

/** Generic tileable detail: fabric weave, leather grain, brushed metal, skin pores. */
export function detailSet(kind: 'fabric' | 'leather' | 'metal' | 'skin' | 'stone', size: number, seed = 3): PBRSet {
  const n = new Noise2D(seed + kind.length * 17);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const alb = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      let h = 0;
      let r = 0.5;
      let a = 1;
      switch (kind) {
        case 'fabric': {
          const threads = 48;
          const wu = Math.sin(u * threads * Math.PI * 2);
          const wv = Math.sin(v * threads * Math.PI * 2);
          const over = Math.sin(u * threads * Math.PI) * Math.sin(v * threads * Math.PI) > 0 ? 1 : 0;
          h = (over ? wu * 0.5 + 0.5 : wv * 0.5 + 0.5) * 0.6 + n.fbm(u * 32, v * 32, 2, 32) * 0.4;
          r = 0.75 + n.fbm(u * 8, v * 8, 3, 8) * 0.2;
          a = 0.85 + n.fbm(u * 4, v * 4, 4, 4) * 0.3;
          break;
        }
        case 'leather': {
          const cell = n.fbm(u * 24, v * 24, 4, 24);
          h = Math.pow(cell, 1.5);
          r = 0.45 + cell * 0.25;
          a = 0.85 + n.fbm(u * 5, v * 5, 4, 5) * 0.3;
          break;
        }
        case 'metal': {
          const br = n.fbm(u * 1, v * 160, 3, 1);
          const sc = Math.max(0, n.fbm(u * 30 + 2, v * 4, 2, 30) - 0.6) * 2.5;
          const dent = n.fbm(u * 6, v * 6, 4, 6);
          h = br * 0.3 + dent * 0.7 - sc * 0.3;
          r = 0.42 + br * 0.18 + sc * 0.25 + Math.max(0, dent - 0.55) * 0.5;
          a = 0.9 + dent * 0.15 - sc * 0.15;
          break;
        }
        case 'skin': {
          const pores = n.fbm(u * 96, v * 96, 2, 96);
          h = pores * 0.8 + n.fbm(u * 12, v * 12, 3, 12) * 0.2;
          r = 0.55 + pores * 0.2;
          a = 0.94 + n.fbm(u * 6, v * 6, 3, 6) * 0.12;
          break;
        }
        case 'stone': {
          const big = n.fbm(u * 4, v * 4, 5, 4);
          const fine = n.fbm(u * 48, v * 48, 3, 48);
          const cr = Math.abs(n.fbm(u * 6 + 1.1, v * 6 + 7.3, 4, 6) - 0.5);
          const crack = Math.max(0, 1 - cr / 0.015);
          h = big * 0.7 + fine * 0.3 - crack * 0.4;
          r = 0.7 + fine * 0.25 + crack * 0.1;
          a = 0.75 + big * 0.35 + fine * 0.1 - crack * 0.4;
          break;
        }
      }
      height[i] = h;
      rough[i] = r;
      alb[i] = a;
    }
  }
  const strength = kind === 'fabric' ? 1.6 : kind === 'leather' ? 2.5 : kind === 'skin' ? 0.8 : kind === 'stone' ? 3 : 1.2;
  return {
    map: toTexture(fieldToCanvas(size, (i) => [alb[i], alb[i], alb[i]]), true),
    roughnessMap: toTexture(fieldToCanvas(size, (i) => [0, rough[i], 0]), false),
    normalMap: toTexture(heightToNormal(height, size, strength), false),
  };
}

/** Soft radial gradient used for blob/contact shadows, glows and particles. */
export function radialTexture(size: number, stops: [number, string][]): THREE.Texture {
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

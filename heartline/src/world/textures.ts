import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/**
 * Procedural canvas textures. Everything visual in the game is generated at runtime so the
 * project ships no third-party assets (and no licensing questions).
 */

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat: [number, number], srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

function hex(c: number) {
  return '#' + c.toString(16).padStart(6, '0');
}

function shade(c: number, f: number): string {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (c & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed: number) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

export function woodFloor(base = 0x8a6242, repeat: [number, number] = [2, 2]) {
  return memo('wood' + base + repeat, () => {
    const [c, ctx] = canvas(512, 512);
    const r = mulberry32(11);
    const plankH = 64;
    for (let y = 0; y < 512; y += plankH) {
      let x = -r() * 200;
      while (x < 512) {
        const len = 180 + r() * 220;
        ctx.fillStyle = shade(base, 0.82 + r() * 0.3);
        ctx.fillRect(x, y, len, plankH);
        // grain lines
        for (let g = 0; g < 14; g++) {
          ctx.strokeStyle = `rgba(40,22,10,${0.05 + r() * 0.08})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const gy = y + r() * plankH;
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 8, x + len * 0.7, gy + (r() - 0.5) * 8, x + len, gy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20,10,5,0.55)';
        ctx.fillRect(x, y, 2, plankH);
        x += len;
      }
      ctx.fillStyle = 'rgba(20,10,5,0.6)';
      ctx.fillRect(0, y, 512, 2);
    }
    return finish(c, repeat);
  });
}

export function tiles(base: number, grout: number, n = 8, repeat: [number, number] = [2, 2], seed = 3) {
  return memo(`tiles${base}-${grout}-${n}-${repeat}`, () => {
    const [c, ctx] = canvas(512, 512);
    const r = mulberry32(seed);
    ctx.fillStyle = hex(grout);
    ctx.fillRect(0, 0, 512, 512);
    const s = 512 / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(base, 0.93 + r() * 0.12);
        ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        const g = ctx.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
        g.addColorStop(0, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0.05)');
        ctx.fillStyle = g;
        ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
    speckle(ctx, 512, 512, 1500, 0.06, seed);
    return finish(c, repeat);
  });
}

export function paint(base: number, repeat: [number, number] = [1, 1]) {
  return memo('paint' + base + repeat, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, 4000, 0.035, 5);
    return finish(c, repeat);
  });
}

export function linoleum(base: number, repeat: [number, number] = [4, 4]) {
  return memo('lino' + base + repeat, () => {
    const [c, ctx] = canvas(512, 512);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 512, 512);
    speckle(ctx, 512, 512, 9000, 0.12, 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 510);
    return finish(c, repeat);
  });
}

export function fabric(base: number, pattern: 'plain' | 'stripe' | 'check' | 'dots' | 'knit' = 'plain', accent = 0xffffff, repeat: [number, number] = [2, 2]) {
  return memo(`fab${base}-${pattern}-${accent}-${repeat}`, () => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 256, 256);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = hex(accent);
    if (pattern === 'stripe') for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 8, 256);
    if (pattern === 'check') {
      for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 6, 256);
      for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 6);
    }
    if (pattern === 'dots') for (let x = 8; x < 256; x += 32) for (let y = 8; y < 256; y += 32) ctx.fillRect(x + ((y / 32) % 2) * 16, y, 5, 5);
    ctx.globalAlpha = 1;
    // weave
    for (let y = 0; y < 256; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${y % 4 ? 0.035 : 0.07})`;
      ctx.fillRect(0, y, 256, 1);
    }
    if (pattern === 'knit') speckle(ctx, 256, 256, 3000, 0.1, 4);
    return finish(c, repeat);
  });
}

export function skin(base: number) {
  return memo('skin' + base, () => {
    const [c, ctx] = canvas(128, 128);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 128, 128);
    const r = mulberry32(base);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${150 + r() * 60},${60 + r() * 30},${50 + r() * 30},${0.04 * r()})`;
      ctx.beginPath();
      ctx.arc(r() * 128, r() * 128, 1 + r() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(c, [1, 1]);
  });
}

export function marble(base = 0xe8e4de) {
  return memo('marble' + base, () => {
    const [c, ctx] = canvas(512, 256);
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, 512, 256);
    const r = mulberry32(21);
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(90,90,100,${0.05 + r() * 0.12})`;
      ctx.lineWidth = 0.5 + r() * 2;
      ctx.beginPath();
      let x = r() * 512;
      let y = r() * 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.3) * 80;
        y += (r() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return finish(c, [1, 1]);
  });
}

/** Dawn sky gradient used on a large sphere or window backdrop. `t` 0 = night, 1 = sunrise. */
export function skyGradient(t: number) {
  const key = 'sky' + t.toFixed(2);
  return memo(key, () => {
    const [c, ctx] = canvas(16, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    const top = new THREE.Color(0x070b1a).lerp(new THREE.Color(0x2b4a7a), t);
    const mid = new THREE.Color(0x141c38).lerp(new THREE.Color(0x8a6aa0), t);
    const low = new THREE.Color(0x1c2240).lerp(new THREE.Color(0xf0a070), t);
    g.addColorStop(0, '#' + top.getHexString());
    g.addColorStop(0.55, '#' + mid.getHexString());
    g.addColorStop(1, '#' + low.getHexString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    const tex = finish(c, [1, 1]);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Building facade with randomly lit windows (night city). */
export function facade(seed: number, litRatio = 0.25) {
  return memo('facade' + seed + litRatio, () => {
    const [c, ctx] = canvas(128, 256);
    ctx.fillStyle = '#1a1c24';
    ctx.fillRect(0, 0, 128, 256);
    const r = mulberry32(seed);
    for (let y = 8; y < 256; y += 20)
      for (let x = 8; x < 128; x += 18) {
        const lit = r() < litRatio;
        ctx.fillStyle = lit ? (r() < 0.7 ? '#ffd9a0' : '#cfe3ff') : '#262a35';
        ctx.fillRect(x, y, 10, 12);
      }
    return finish(c, [1, 1]);
  });
}

export function roadTex() {
  return memo('road', () => {
    const [c, ctx] = canvas(256, 512);
    ctx.fillStyle = '#26272b';
    ctx.fillRect(0, 0, 256, 512);
    speckle(ctx, 256, 512, 9000, 0.12, 31);
    ctx.fillStyle = '#d8d4c8';
    for (let y = 0; y < 512; y += 128) ctx.fillRect(124, y, 8, 64);
    ctx.fillRect(10, 0, 5, 512);
    ctx.fillRect(241, 0, 5, 512);
    return finish(c, [1, 20]);
  });
}

/** A text sign (hospital signage, door labels). Not cached: each is unique. */
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}) {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = opts.bg ?? '#0d5c8c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg ?? '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.floor((h / lines.length) * 0.55);
  ctx.font = `600 ${size}px ${opts.font ?? 'system-ui, sans-serif'}`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, (h / lines.length) * (i + 0.5)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Framed artwork for walls: soft abstract landscape. */
export function artwork(seed: number) {
  return memo('art' + seed, () => {
    const [c, ctx] = canvas(256, 192);
    const r = mulberry32(seed);
    const g = ctx.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, `hsl(${200 + r() * 40},40%,${60 + r() * 15}%)`);
    g.addColorStop(1, `hsl(${30 + r() * 30},45%,${70 + r() * 10}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 192);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `hsla(${100 + r() * 120},25%,${30 + k * 12}%,0.85)`;
      ctx.beginPath();
      ctx.moveTo(0, 192);
      let y = 110 + k * 22;
      for (let x = 0; x <= 256; x += 16) {
        y += (r() - 0.5) * 18;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(256, 192);
      ctx.fill();
    }
    return finish(c, [1, 1]);
  });
}

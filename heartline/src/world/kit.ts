import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Small building kit shared by every environment: materials, boxes, rooms, colliders. */

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Material quality: 'performance' uses cheap Lambert shading (much lower per-pixel cost on
 * phones), 'balanced' uses standard PBR, 'quality' adds physical extras (clearcoat, sheen,
 * transmission). Set by the game before an area is built.
 */
export const MATERIAL_LEVEL = { value: 'balanced' as 'performance' | 'balanced' | 'quality' };

const LAMBERT_KEYS = ['map', 'emissive', 'emissiveIntensity', 'emissiveMap', 'side', 'transparent', 'opacity', 'depthWrite', 'fog', 'vertexColors'] as const;

function lambert(color: number | THREE.Color | undefined, opts: Record<string, unknown>): THREE.MeshStandardMaterial {
  const o: Record<string, unknown> = { color };
  for (const k of LAMBERT_KEYS) if (opts[k] !== undefined) o[k] = opts[k];
  // Metals look flat without reflections; brighten them slightly.
  const m = new THREE.MeshLambertMaterial(o as THREE.MeshLambertMaterialParameters);
  return m as unknown as THREE.MeshStandardMaterial;
}

export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  if (MATERIAL_LEVEL.value === 'performance') return lambert(color, opts as Record<string, unknown>);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });
}

export function physical(color: number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshStandardMaterial {
  if (MATERIAL_LEVEL.value === 'performance') return lambert(color, opts as Record<string, unknown>);
  if (MATERIAL_LEVEL.value === 'balanced') {
    const { clearcoat: _c, transmission, sheen: _s, sheenRoughness: _sr, sheenColor: _sc, ...rest } = opts;
    const std = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...(rest as THREE.MeshStandardMaterialParameters) });
    if (transmission) {
      std.transparent = true;
      std.opacity = Math.min(std.opacity, 0.35);
    }
    return std;
  }
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...opts });
}

export function emissive(color: number, intensity = 1.5) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 });
}

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, round = 0): THREE.Mesh {
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.7)), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function plane(w: number, h: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A rectangular room: floor, ceiling and four walls with optional door gaps.
 * Doors are given per wall as [centre offset along wall, width].
 */
export interface RoomSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h?: number;
  floor: THREE.Material;
  wall: THREE.Material;
  ceiling?: THREE.Material;
  doors?: Partial<Record<'n' | 's' | 'e' | 'w', [number, number][]>>;
  /** Walls to omit entirely. */
  open?: ('n' | 's' | 'e' | 'w')[];
  windows?: Partial<Record<'n' | 's' | 'e' | 'w', [number, number, number, number][]>>; // [offset, width, sill, height]
}

export function room(spec: RoomSpec, colliders: Collider[]): THREE.Group {
  const g = new THREE.Group();
  const h = spec.h ?? 2.7;
  const floor = plane(spec.w, spec.d, spec.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(spec.x, 0, spec.z);
  g.add(floor);
  if (spec.ceiling) {
    const c = plane(spec.w, spec.d, spec.ceiling);
    c.rotation.x = Math.PI / 2;
    c.position.set(spec.x, h, spec.z);
    c.receiveShadow = false;
    g.add(c);
  }
  const t = 0.12;
  const walls: { side: 'n' | 's' | 'e' | 'w'; len: number; cx: number; cz: number; horiz: boolean }[] = [
    { side: 'n', len: spec.w, cx: spec.x, cz: spec.z - spec.d / 2, horiz: true },
    { side: 's', len: spec.w, cx: spec.x, cz: spec.z + spec.d / 2, horiz: true },
    { side: 'w', len: spec.d, cx: spec.x - spec.w / 2, cz: spec.z, horiz: false },
    { side: 'e', len: spec.d, cx: spec.x + spec.w / 2, cz: spec.z, horiz: false },
  ];
  for (const wl of walls) {
    if (spec.open?.includes(wl.side)) continue;
    const gaps = [...(spec.doors?.[wl.side] ?? []).map(([o, w]) => ({ o, w, sill: 0, top: 2.1 })), ...(spec.windows?.[wl.side] ?? []).map(([o, w, sill, wh]) => ({ o, w, sill, top: sill + wh }))].sort((a, b) => a.o - b.o);
    let cursor = -wl.len / 2;
    const segs: [number, number, number, number][] = []; // start, end, y0, y1
    for (const gp of gaps) {
      const a = gp.o - gp.w / 2;
      const b = gp.o + gp.w / 2;
      if (a > cursor) segs.push([cursor, a, 0, h]);
      if (gp.sill > 0) segs.push([a, b, 0, gp.sill]);
      segs.push([a, b, gp.top, h]);
      cursor = b;
    }
    if (cursor < wl.len / 2) segs.push([cursor, wl.len / 2, 0, h]);
    for (const [a, b, y0, y1] of segs) {
      const len = b - a;
      const hh = y1 - y0;
      if (len <= 0.001 || hh <= 0.001) continue;
      const mid = (a + b) / 2;
      const m = box(wl.horiz ? len : t, hh, wl.horiz ? t : len, spec.wall, wl.horiz ? wl.cx + mid : wl.cx, y0 + hh / 2, wl.horiz ? wl.cz : wl.cz + mid);
      m.castShadow = true;
      m.userData.wall = true;
      g.add(m);
      if (y0 < 1) {
        if (wl.horiz) colliders.push({ minX: wl.cx + a, maxX: wl.cx + b, minZ: wl.cz - t, maxZ: wl.cz + t });
        else colliders.push({ minX: wl.cx - t, maxX: wl.cx + t, minZ: wl.cz + a, maxZ: wl.cz + b });
      }
    }
  }
  return g;
}

/** Adds a solid furniture collider centred at x,z with half extents. */
export function solid(colliders: Collider[], x: number, z: number, hw: number, hd: number) {
  colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
}

/** Circle-vs-AABB push-out for character movement. */
export function collide(x: number, z: number, r: number, colliders: Collider[]): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the shallowest axis
          const left = x - c.minX;
          const right = c.maxX - x;
          const top = z - c.minZ;
          const bottom = c.maxZ - z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = c.minX - r;
          else if (m === right) x = c.maxX + r;
          else if (m === top) z = c.minZ - r;
          else z = c.maxZ + r;
        }
      }
    }
  }
  return [x, z];
}

import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * 3D body-scan import. A scan (GLB/GLTF, OBJ+MTL+textures, PLY, STL or FBX)
 * is normalised (Y up, facing +Z, feet on the ground, standard height),
 * simplified to a game-friendly triangle count, and stored in IndexedDB so
 * it never leaves the browser. Rigging happens at build time (scanRig.ts).
 */

/** Model-space height every scan is normalised to (matches the built-in skeletons). */
export const SCAN_HEIGHT = 1.84;
const TARGET_TRIS = 40000;

export interface ScanMaterial {
  color: [number, number, number];
  texture: Blob | null;
  flipY?: boolean;
}

export interface ScanData {
  version: 1;
  positions: Float32Array;
  uvs: Float32Array | null;
  colors: Float32Array | null;
  index: Uint32Array;
  groups: { start: number; count: number; material: number }[];
  materials: ScanMaterial[];
  /** Detected real-world height in metres (null if units were unknown). */
  realHeight: number | null;
  sourceName: string;
  sourceTriangles: number;
}

export type Progress = (msg: string) => void;

/* ------------------------------------------------------------------ Loading */

const ext = (n: string) => n.toLowerCase().split('.').pop() ?? '';

/** Parse the selected file(s) into a three.js object; extra files resolve MTL/texture references. */
async function parseFiles(files: File[]): Promise<{ root: THREE.Object3D; name: string }> {
  const main =
    files.find((f) => ['glb', 'gltf', 'fbx'].includes(ext(f.name))) ??
    files.find((f) => ext(f.name) === 'obj') ??
    files.find((f) => ['ply', 'stl'].includes(ext(f.name)));
  if (!main) throw new Error('Desteklenen bir 3D dosya bulunamadı (GLB, GLTF, OBJ, PLY, STL, FBX).');
  const urls = new Map<string, string>();
  for (const f of files) urls.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((u) => {
    const base = decodeURIComponent(u.split(/[\\/]/).pop() ?? u).toLowerCase();
    return urls.get(base) ?? u;
  });
  const url = urls.get(main.name.toLowerCase())!;
  try {
    switch (ext(main.name)) {
      case 'glb':
      case 'gltf': {
        const l = new GLTFLoader(manager);
        l.setMeshoptDecoder(MeshoptDecoder);
        const g = await l.loadAsync(url);
        return { root: g.scene, name: main.name };
      }
      case 'fbx':
        return { root: await new FBXLoader(manager).loadAsync(url), name: main.name };
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtl = files.find((f) => ext(f.name) === 'mtl');
        if (mtl) {
          const m = await new MTLLoader(manager).loadAsync(urls.get(mtl.name.toLowerCase())!);
          m.preload();
          loader.setMaterials(m);
        }
        return { root: await loader.loadAsync(url), name: main.name };
      }
      case 'ply': {
        const geo = await new PLYLoader(manager).loadAsync(url);
        return { root: new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: !!geo.getAttribute('color') })), name: main.name };
      }
      default: {
        const geo = await new STLLoader(manager).loadAsync(url);
        return { root: new THREE.Mesh(geo, new THREE.MeshStandardMaterial()), name: main.name };
      }
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (/draco|KHR_draco/i.test(msg)) throw new Error('Bu GLB Draco ile sıkıştırılmış. Tarayıcı yazılımından sıkıştırmasız GLB, OBJ veya PLY olarak dışa aktarın.');
    throw new Error(`Dosya okunamadı: ${msg}`);
  } finally {
    // Textures may still be decoding; release the URLs a bit later.
    window.setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 30000);
  }
}

async function imageToBlob(img: CanvasImageSource & { width: number; height: number }): Promise<Blob | null> {
  const max = 2048;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.9));
}

/** OBJ/MTL and FBX textures keep loading after the model resolves; wait for them (max 20 s). */
async function waitForTextures(root: THREE.Object3D): Promise<void> {
  const maps: THREE.Texture[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const t = (mat as THREE.MeshStandardMaterial).map;
      if (t) maps.push(t);
    }
  });
  const ready = (t: THREE.Texture) => {
    const img = t.image as { width?: number; complete?: boolean } | undefined;
    return !!img && (img.complete === undefined || img.complete) && (img.width ?? 0) > 0;
  };
  for (let waited = 0; waited < 20000 && !maps.every(ready); waited += 100) await new Promise((r) => setTimeout(r, 100));
}

/* --------------------------------------------------------------- Processing */

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Full import pipeline from user files to a stored, game-ready scan. */
export async function importScan(files: File[], progress: Progress): Promise<ScanData> {
  progress('Dosya okunuyor…');
  const { root, name } = await parseFiles(files);
  root.updateMatrixWorld(true);
  progress('Dokular yükleniyor…');
  await waitForTextures(root);
  await nextTick();

  progress('Model birleştiriliyor…');
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.getAttribute('position')) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (g.groups.length > 1 && mats.length > 1) {
      // Split multi-material meshes into one part per material group.
      for (const gr of g.groups) {
        const idx: number[] = [];
        for (let i = gr.start; i < gr.start + gr.count && i < (g.index ? g.index.count : g.getAttribute('position').count); i++)
          idx.push(g.index ? g.index.getX(i) : i);
        const sub = g.clone();
        sub.setIndex(idx);
        sub.clearGroups();
        parts.push({ geo: sub, mat: mats[gr.materialIndex ?? 0] ?? mats[0] });
      }
    } else parts.push({ geo: g, mat: mats[0] });
  });
  if (!parts.length) throw new Error('Dosyada görüntülenebilir bir mesh bulunamadı.');

  const hasUV = parts.every((p) => !!p.geo.getAttribute('uv')) && parts.some((p) => !!(p.mat as THREE.MeshStandardMaterial).map);
  const hasColor = !hasUV && parts.every((p) => !!p.geo.getAttribute('color'));
  const materials: ScanMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  let sourceTriangles = 0;
  for (const p of parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', p.geo.getAttribute('position').clone());
    if (hasUV) g.setAttribute('uv', p.geo.getAttribute('uv').clone());
    if (hasColor) {
      const c = p.geo.getAttribute('color');
      const arr = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) arr.set([c.getX(i), c.getY(i), c.getZ(i)], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (p.geo.index) g.setIndex(p.geo.index.clone());
    sourceTriangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    geos.push(g);
    const sm = p.mat as THREE.MeshStandardMaterial;
    const col = sm.color ?? new THREE.Color(0.8, 0.8, 0.8);
    let texture: Blob | null = null;
    const img = sm.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (hasUV && img && img.width) texture = await imageToBlob(img);
    materials.push({ color: [col.r, col.g, col.b], texture, flipY: sm.map?.flipY ?? true });
  }
  await nextTick();

  progress(`Kaynaştırılıyor (${Math.round(sourceTriangles / 1000)}k üçgen)…`);
  const indexed = geos.map((g) => mergeVertices(g, 1e-6));
  let merged = mergeGeometries(indexed, true);
  if (!merged) throw new Error('Mesh parçaları birleştirilemedi.');
  await nextTick();

  progress('Yön ve ölçek düzeltiliyor…');
  const realHeight = orientAndNormalize(merged);
  await nextTick();

  progress('Sadeleştiriliyor…');
  merged = await simplify(merged);

  const pos = merged.getAttribute('position').array as Float32Array;
  return {
    version: 1,
    positions: new Float32Array(pos),
    uvs: hasUV ? new Float32Array(merged.getAttribute('uv').array as Float32Array) : null,
    colors: hasColor ? new Float32Array(merged.getAttribute('color').array as Float32Array) : null,
    index: new Uint32Array(merged.index!.array),
    groups: merged.groups.map((g) => ({ start: g.start, count: g.count, material: g.materialIndex ?? 0 })),
    materials,
    realHeight,
    sourceName: name,
    sourceTriangles: Math.round(sourceTriangles),
  };
}

/** Y-up, facing +Z, feet at y = 0, centred, scaled to SCAN_HEIGHT. Returns detected real height (m). */
function orientAndNormalize(g: THREE.BufferGeometry): number | null {
  g.computeBoundingBox();
  let s = new THREE.Vector3();
  g.boundingBox!.getSize(s);
  // Scanners export Y-up or Z-up. Only those two are considered: in a T-pose the
  // arm span equals the height, so "longest axis" alone would be ambiguous.
  if (s.z > s.y * 1.05) g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  s = g.boundingBox!.getSize(new THREE.Vector3());
  // Head should be the narrow end: compare horizontal spread of top vs bottom 10%.
  if (spread(g, 0.9, 1.0) > spread(g, 0.0, 0.1) * 1.8) g.rotateZ(Math.PI);
  const h = s.y;
  const realHeight = h > 1 && h < 2.5 ? h : h > 100 && h < 250 ? h / 100 : h > 1000 && h < 2500 ? h / 1000 : null;
  const k = SCAN_HEIGHT / h;
  g.scale(k, k, k);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  centreOnHips(g);
  // Facing: feet/toes stick out forward, so the foot band sits ahead of the shin band.
  if (bandCentroidZ(g, 0.0, 0.035) < bandCentroidZ(g, 0.12, 0.25)) g.rotateY(Math.PI);
  centreOnHips(g);
  return realHeight;
}

function spread(g: THREE.BufferGeometry, a: number, b: number): number {
  const p = g.getAttribute('position');
  const bb = g.boundingBox!;
  const h = bb.max.y - bb.min.y;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / h;
    if (t < a || t > b) continue;
    const x = p.getX(i);
    mn = Math.min(mn, x);
    mx = Math.max(mx, x);
  }
  return mx > mn ? mx - mn : 0;
}

function bandCentroidZ(g: THREE.BufferGeometry, y0: number, y1: number): number {
  const p = g.getAttribute('position');
  let s = 0;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < y0 || y > y1) continue;
    s += p.getZ(i);
    n++;
  }
  return n ? s / n : 0;
}

function centreOnHips(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position');
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.85 || y > 1.15) continue;
    sx += p.getX(i);
    sz += p.getZ(i);
    n++;
  }
  if (n) g.translate(-sx / n, 0, -sz / n);
}

async function simplify(g: THREE.BufferGeometry): Promise<THREE.BufferGeometry> {
  const triCount = g.index!.count / 3;
  if (triCount <= TARGET_TRIS * 1.1) return g;
  await MeshoptSimplifier.ready;
  const pos = g.getAttribute('position').array as Float32Array;
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index!.count, materialIndex: 0 }];
  const out: number[] = [];
  const newGroups: { start: number; count: number; materialIndex: number }[] = [];
  const all = new Uint32Array(g.index!.array);
  for (const gr of groups) {
    const idx = all.slice(gr.start, gr.start + gr.count);
    const target = Math.max(300, Math.floor((idx.length / all.length) * TARGET_TRIS) * 3);
    let [res] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, []);
    if (res.length > target * 1.5) [res] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.02);
    newGroups.push({ start: out.length, count: res.length, materialIndex: gr.materialIndex ?? 0 });
    for (const v of res) out.push(v);
  }
  // Compact: keep only referenced vertices.
  const remap = new Int32Array(pos.length / 3).fill(-1);
  let n = 0;
  for (const v of out) if (remap[v] < 0) remap[v] = n++;
  const res = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    const arr = new Float32Array(n * a.itemSize);
    for (let i = 0; i < remap.length; i++) {
      const r = remap[i];
      if (r < 0) continue;
      for (let k = 0; k < a.itemSize; k++) arr[r * a.itemSize + k] = (a.array as ArrayLike<number>)[i * a.itemSize + k];
    }
    res.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  res.setIndex(new THREE.BufferAttribute(Uint32Array.from(out, (v) => remap[v]), 1));
  for (const gr of newGroups) res.addGroup(gr.start, gr.count, gr.materialIndex);
  return res;
}

/** Turn the stored scan around (when automatic facing guessed wrong). */
export function rotateScan(d: ScanData, axis: 'y180' | 'x90'): ScanData {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.positions), 3));
  if (axis === 'y180') g.rotateY(Math.PI);
  else {
    g.rotateX(Math.PI / 2);
    g.computeBoundingBox();
    const h = g.boundingBox!.max.y - g.boundingBox!.min.y;
    g.scale(SCAN_HEIGHT / h, SCAN_HEIGHT / h, SCAN_HEIGHT / h);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox!.min.y, 0);
  centreOnHips(g);
  return { ...d, positions: new Float32Array(g.getAttribute('position').array as Float32Array) };
}

/* ------------------------------------------------------------------ Storage */

const DB = 'shadow-warriors';
const STORE = 'scan';

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveScan(d: ScanData): Promise<void> {
  const d0 = await db();
  await new Promise<void>((res, rej) => {
    const tx = d0.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(d, 'body');
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  d0.close();
}

export async function loadScan(): Promise<ScanData | null> {
  try {
    const d0 = await db();
    const v = await new Promise<ScanData | null>((res, rej) => {
      const r = d0.transaction(STORE, 'readonly').objectStore(STORE).get('body');
      r.onsuccess = () => res((r.result as ScanData) ?? null);
      r.onerror = () => rej(r.error);
    });
    d0.close();
    return v;
  } catch {
    return null;
  }
}

export async function deleteScan(): Promise<void> {
  try {
    const d0 = await db();
    await new Promise<void>((res) => {
      const tx = d0.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete('body');
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    d0.close();
  } catch {
    /* ignore */
  }
}

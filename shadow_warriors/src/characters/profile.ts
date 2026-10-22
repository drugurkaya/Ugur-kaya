/**
 * The player's own fighter ("SEN"). Everything, including the photo, is
 * stored only in this browser's localStorage and never uploaded anywhere.
 */
export type HairStyle = 'short' | 'long' | 'bald';
export type FightStyle = 'phantom' | 'ironfang';

export interface CustomProfile {
  name: string;
  style: FightStyle;
  /** Downscaled source photo (data URL) used for cropping and colour picking. */
  photo: string | null;
  /** Face crop circle in normalised photo coordinates. */
  faceX: number;
  faceY: number;
  faceR: number;
  /** Cropped, edge-faded face texture (data URL). */
  face: string | null;
  skin: string;
  hair: string;
  top: string;
  pants: string;
  shoes: string;
  hairStyle: HairStyle;
  sleeves: boolean;
  /** 0.92 .. 1.08 */
  height: number;
  /** 0.85 .. 1.3 */
  build: number;
}

const KEY = 'shadow-warriors-custom-v1';

export const defaultProfile = (): CustomProfile => ({
  name: 'SEN',
  style: 'phantom',
  photo: null,
  faceX: 0.5,
  faceY: 0.3,
  faceR: 0.18,
  face: null,
  skin: '#b98a6c',
  hair: '#1c1612',
  top: '#2c3440',
  pants: '#1d1f24',
  shoes: '#202020',
  hairStyle: 'short',
  sleeves: false,
  height: 1,
  build: 1,
});

export function loadProfile(): CustomProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultProfile(), ...(JSON.parse(raw) as Partial<CustomProfile>) } : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store it (e.g. quota or private mode). */
export function saveProfile(p: CustomProfile): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function deleteProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Build the round, edge-faded face texture from the photo crop. */
export async function makeFaceTexture(photo: string, cx: number, cy: number, r: number): Promise<string> {
  const img = await loadImage(photo);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  const rad = r * s;
  // Slightly taller than wide: faces are oval.
  g.drawImage(img, cx * img.width - rad, cy * img.height - rad * 1.12, rad * 2, rad * 2.24, 0, 0, size, size);
  g.globalCompositeOperation = 'destination-in';
  g.save();
  g.translate(size / 2, size / 2);
  g.scale(1, 1.08);
  const grad = g.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(-size, -size, size * 2, size * 2);
  g.restore();
  return c.toDataURL('image/png');
}

/** Average colour around a normalised point of the photo. */
export async function sampleColor(photo: string, x: number, y: number, radius = 0.012): Promise<string> {
  const img = await loadImage(photo);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const rr = Math.max(1, Math.round(radius * Math.min(img.width, img.height)));
  const px = Math.round(x * img.width);
  const py = Math.round(y * img.height);
  const d = g.getImageData(Math.max(0, px - rr), Math.max(0, py - rr), rr * 2, rr * 2).data;
  let R = 0;
  let G = 0;
  let B = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    R += d[i];
    G += d[i + 1];
    B += d[i + 2];
    n++;
  }
  const h = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0');
  return `#${h(R)}${h(G)}${h(B)}`;
}

/** Read a user-selected file into a downscaled JPEG data URL (keeps storage small). */
export async function readPhoto(file: File, maxSide = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Görüntü okunamadı'));
      i.src = src;
    });
    if (cache.size > 6) cache.clear();
    cache.set(src, p);
  }
  return p;
}

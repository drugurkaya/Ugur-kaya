import { deleteScan, importScan, rotateScan, saveScan, SCAN_HEIGHT, type ScanData } from '../characters/scan';
import {
  defaultProfile,
  deleteProfile,
  loadImage,
  makeFaceTexture,
  readPhoto,
  sampleColor,
  type CustomProfile,
} from '../characters/profile';

type ColorSlot = 'skin' | 'hair' | 'top' | 'pants' | 'shoes';
const SLOTS: { key: ColorSlot; label: string }[] = [
  { key: 'skin', label: 'Ten' },
  { key: 'hair', label: 'Saç' },
  { key: 'top', label: 'Üst' },
  { key: 'pants', label: 'Alt' },
  { key: 'shoes', label: 'Ayakkabı' },
];

export interface CreatorHooks {
  getScan: () => ScanData | null;
  setScan: (d: ScanData | null) => void;
  preview: (p: CustomProfile) => void;
  save: (p: CustomProfile) => boolean;
  cancel: () => void;
  deleted: () => void;
}

/**
 * Character creator: upload a full-body photo, frame the face, click the
 * photo to pick skin/hair/clothing colours, set height, build and fighting
 * style. The photo never leaves the browser.
 */
export class Creator {
  readonly el: HTMLElement;
  private p: CustomProfile = defaultProfile();
  private canvas: HTMLCanvasElement;
  private mode: 'face' | ColorSlot = 'face';
  private img: HTMLImageElement | null = null;
  private drag = false;
  private previewTimer = 0;
  private msg: HTMLElement;

  constructor(private hooks: CreatorHooks) {
    this.el = document.createElement('div');
    this.el.className = 'creator';
    this.el.innerHTML = `
      <div class="panel cr-panel">
        <h2>KARAKTERİNİ OLUŞTUR<small>FOTOĞRAFIN SADECE BU TARAYICIDA SAKLANIR</small></h2>
        <div class="cr-scan">
          <label class="cr-file">🧍 3D tarama yükle (GLB, OBJ+MTL+doku, PLY, STL, FBX)<input type="file" data-scan multiple accept=".glb,.gltf,.bin,.obj,.mtl,.ply,.stl,.fbx,image/*" /></label>
          <div class="cr-scan-info"></div>
          <div class="cr-scan-tools">
            <label><input type="checkbox" data-usescan /> Taramayı kullan</label>
            <button data-scan-act="y180">↻ 180° çevir</button>
            <button data-scan-act="x90">⤾ Yatır / kaldır</button>
            <button data-scan-act="del">Taramayı sil</button>
          </div>
        </div>
        <label class="cr-file cr-photo-file">📷 Fotoğraf seç (tam boy önerilir)<input type="file" data-photo accept="image/*" /></label>
        <div class="cr-photo"><canvas width="360" height="360"></canvas><div class="cr-empty">Önce bir fotoğraf seçin.<br>Yüzünüzün ve kıyafetinizin göründüğü, iyi ışıklı bir fotoğraf en iyi sonucu verir.</div></div>
        <div class="cr-modes">
          <button data-mode="face" class="on">Yüz çerçevesi</button>
          ${SLOTS.map((s) => `<button data-mode="${s.key}">${s.label} <input type="color" data-sw="${s.key}" title="Renk seç" /></button>`).join('')}
        </div>
        <div class="cr-hint"></div>
        <div class="cr-row"><span>Yüz boyutu</span><input type="range" data-k="faceR" min="0.04" max="0.45" step="0.005" /></div>
        <div class="cr-row"><span>İsim</span><input type="text" data-k="name" maxlength="14" /></div>
        <div class="cr-row"><span>Boy</span><input type="range" data-k="height" min="0.85" max="1.15" step="0.01" /><b data-v="height"></b></div>
        <div class="cr-row"><span>Yapı</span><input type="range" data-k="build" min="0.85" max="1.3" step="0.01" /><b data-v="build"></b></div>
        <div class="cr-row"><span>Saç</span><select data-k="hairStyle"><option value="short">Kısa</option><option value="long">Uzun</option><option value="bald">Kel</option></select></div>
        <div class="cr-row"><span>Kollar</span><select data-k="sleeves"><option value="false">Kısa kollu</option><option value="true">Uzun kollu</option></select></div>
        <div class="cr-row"><span>Dövüş stili</span><select data-k="style"><option value="phantom">Hızlı (Phantom hareketleri)</option><option value="ironfang">Güçlü (Iron Fang hareketleri)</option></select></div>
        <div class="cr-msg"></div>
        <div class="cr-buttons"><button data-act="save" class="primary">Kaydet</button><button data-act="cancel">Vazgeç</button><button data-act="delete">Sil</button></div>
      </div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.msg = this.el.querySelector('.cr-msg')!;
    this.bind();
  }

  open(existing: CustomProfile | null): void {
    this.p = existing ? { ...existing } : defaultProfile();
    this.img = null;
    this.mode = 'face';
    this.msg.textContent = '';
    this.setMode('face');
    this.syncInputs();
    if (this.p.photo) void loadImage(this.p.photo).then((i) => ((this.img = i), this.draw()));
    this.draw();
    this.hooks.preview(this.p);
  }

  private bind(): void {
    this.bindScan();
    const file = this.el.querySelector<HTMLInputElement>('input[data-photo]')!;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        this.p.photo = await readPhoto(f);
        this.img = await loadImage(this.p.photo);
        // Guess a face position near the top centre of a full-body photo.
        const portrait = this.img.height > this.img.width * 1.2;
        this.p.faceX = 0.5;
        this.p.faceY = portrait ? 0.14 : 0.38;
        this.p.faceR = portrait ? 0.1 : 0.22;
        this.setMode('face');
        this.syncInputs();
        await this.updateFace(true);
        this.msg.textContent = 'Yüz çerçevesini sürükleyerek yüzünüze oturtun, sonra renkleri fotoğrafa tıklayarak seçin.';
      } catch {
        this.msg.textContent = 'Bu dosya okunamadı. JPG veya PNG bir fotoğraf deneyin.';
      }
      file.value = '';
    });
    this.el.querySelectorAll<HTMLButtonElement>('.cr-modes button').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode as never)));
    this.el.querySelectorAll<HTMLInputElement>('[data-sw]').forEach((inp) =>
      inp.addEventListener('input', () => {
        this.p[inp.dataset.sw as ColorSlot] = inp.value;
        this.schedulePreview();
      }),
    );

    const toNorm = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const g = this.geom();
      if (!g) return null;
      const x = ((e.clientX - r.left) / r.width) * this.canvas.width;
      const y = ((e.clientY - r.top) / r.height) * this.canvas.height;
      return { x: (x - g.ox) / g.w, y: (y - g.oy) / g.h };
    };
    this.canvas.addEventListener('pointerdown', async (e) => {
      const n = toNorm(e);
      if (!n || !this.p.photo) return;
      if (this.mode === 'face') {
        this.drag = true;
        this.canvas.setPointerCapture(e.pointerId);
        this.p.faceX = n.x;
        this.p.faceY = n.y;
        this.draw();
      } else {
        const slot = this.mode;
        this.p[slot] = await sampleColor(this.p.photo, Math.min(1, Math.max(0, n.x)), Math.min(1, Math.max(0, n.y)));
        this.syncInputs();
        this.schedulePreview();
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const n = toNorm(e);
      if (!n) return;
      this.p.faceX = Math.min(1, Math.max(0, n.x));
      this.p.faceY = Math.min(1, Math.max(0, n.y));
      this.draw();
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = false;
      void this.updateFace(false);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.p.photo) return;
        e.preventDefault();
        this.p.faceR = Math.min(0.45, Math.max(0.04, this.p.faceR * (e.deltaY > 0 ? 0.95 : 1.05)));
        this.syncInputs();
        void this.updateFace(false);
      },
      { passive: false },
    );

    this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof CustomProfile;
        const raw = inp.value;
        if (k === 'name') this.p.name = raw.toUpperCase();
        else if (k === 'sleeves') this.p.sleeves = raw === 'true';
        else if (k === 'style' || k === 'hairStyle') (this.p as unknown as Record<string, string>)[k] = raw;
        else (this.p as unknown as Record<string, number>)[k] = Number(raw);
        this.syncInputs(false);
        if (k === 'faceR') void this.updateFace(false);
        else if (k !== 'name') this.schedulePreview();
      });
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'save') {
          if (!this.p.name.trim()) this.p.name = 'SEN';
          if (this.hooks.save(this.p)) this.msg.textContent = '';
          else this.msg.textContent = 'Kaydedilemedi: tarayıcı depolama alanı dolu ya da gizli modda. Daha küçük bir fotoğraf deneyin.';
        } else if (a === 'cancel') this.hooks.cancel();
        else if (a === 'delete') {
          deleteProfile();
          this.hooks.deleted();
        }
      }),
    );
    // Keep game/menu shortcuts from firing while typing.
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hooks.cancel();
      e.stopPropagation();
    });
  }

  private bindScan(): void {
    const input = this.el.querySelector<HTMLInputElement>('input[data-scan]')!;
    const use = this.el.querySelector<HTMLInputElement>('input[data-usescan]')!;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      if (!files.length) return;
      try {
        const d = await importScan(files, (m) => (this.msg.textContent = m));
        this.msg.textContent = 'Kaydediliyor…';
        await saveScan(d);
        this.hooks.setScan(d);
        this.p.useScan = true;
        if (d.realHeight) this.p.height = Math.min(1.15, Math.max(0.85, d.realHeight / SCAN_HEIGHT));
        this.msg.textContent = 'Tarama yüklendi. Önizlemede yüzü bize dönük değilse "180° çevir", yatıksa "Yatır / kaldır" düğmesini kullanın.';
        this.syncInputs();
        this.schedulePreview();
      } catch (e) {
        this.msg.textContent = (e as Error).message;
      }
    });
    use.addEventListener('change', () => {
      this.p.useScan = use.checked && !!this.hooks.getScan();
      this.syncInputs();
      this.schedulePreview();
    });
    this.el.querySelectorAll<HTMLButtonElement>('[data-scan-act]').forEach((b) =>
      b.addEventListener('click', async () => {
        const d = this.hooks.getScan();
        if (!d) return;
        const a = b.dataset.scanAct;
        if (a === 'del') {
          await deleteScan();
          this.hooks.setScan(null);
          this.p.useScan = false;
        } else {
          const r = rotateScan(d, a as 'y180' | 'x90');
          await saveScan(r);
          this.hooks.setScan(r);
        }
        this.syncInputs();
        this.schedulePreview();
      }),
    );
  }

  private setMode(m: 'face' | ColorSlot): void {
    this.mode = m;
    this.el.querySelectorAll<HTMLButtonElement>('.cr-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    const hint = this.el.querySelector('.cr-hint')!;
    hint.textContent =
      m === 'face'
        ? 'Fotoğrafta yüzünüze tıklayın / sürükleyin. Tekerlek veya kaydırıcı ile boyutu ayarlayın.'
        : `Fotoğrafta ${SLOTS.find((s) => s.key === m)!.label.toLowerCase()} rengine tıklayın (ya da sağdaki kutudan seçin).`;
  }

  private async updateFace(sampleSkin: boolean): Promise<void> {
    this.draw();
    if (!this.p.photo) return;
    this.p.face = await makeFaceTexture(this.p.photo, this.p.faceX, this.p.faceY, this.p.faceR);
    if (sampleSkin) this.p.skin = await sampleColor(this.p.photo, this.p.faceX, this.p.faceY + this.p.faceR * 0.35, 0.02);
    this.syncInputs();
    this.schedulePreview();
  }

  private schedulePreview(): void {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.hooks.preview({ ...this.p }), 150);
  }

  private geom(): { ox: number; oy: number; w: number; h: number } | null {
    if (!this.img) return null;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const k = Math.min(cw / this.img.width, ch / this.img.height);
    const w = this.img.width * k;
    const h = this.img.height * k;
    return { ox: (cw - w) / 2, oy: (ch - h) / 2, w, h };
  }

  private draw(): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    (this.el.querySelector('.cr-empty') as HTMLElement).style.display = this.img ? 'none' : 'flex';
    const gm = this.geom();
    if (!gm || !this.img) return;
    g.drawImage(this.img, gm.ox, gm.oy, gm.w, gm.h);
    const s = Math.min(gm.w, gm.h);
    const cx = gm.ox + this.p.faceX * gm.w;
    const cy = gm.oy + this.p.faceY * gm.h;
    const r = this.p.faceR * s;
    g.save();
    g.strokeStyle = '#ff8a3a';
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.beginPath();
    g.ellipse(cx, cy, r, r * 1.12, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  private syncInputs(all = true): void {
    const p = this.p;
    if (all)
      this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => {
        const k = inp.dataset.k as keyof CustomProfile;
        inp.value = String(p[k]);
      });
    (this.el.querySelector('[data-v=height]') as HTMLElement).textContent = `${Math.round(184 * p.height)} cm`;
    (this.el.querySelector('[data-v=build]') as HTMLElement).textContent = p.build < 0.95 ? 'İnce' : p.build < 1.1 ? 'Atletik' : p.build < 1.2 ? 'Güçlü' : 'İri';
    for (const sl of SLOTS) this.el.querySelector<HTMLInputElement>(`[data-sw=${sl.key}]`)!.value = p[sl.key];
    const scan = this.hooks.getScan();
    const use = this.el.querySelector<HTMLInputElement>('input[data-usescan]')!;
    use.checked = p.useScan && !!scan;
    use.disabled = !scan;
    this.el.querySelectorAll<HTMLButtonElement>('[data-scan-act]').forEach((b) => (b.disabled = !scan));
    this.el.querySelector('.cr-scan-info')!.textContent = scan
      ? `${scan.sourceName} · ${Math.round(scan.sourceTriangles / 1000)}k → ${Math.round(scan.index.length / 3000)}k üçgen${scan.realHeight ? ` · ${Math.round(scan.realHeight * 100)} cm` : ''}`
      : 'Tarama yok. Varsa önce taramayı, yoksa fotoğrafı kullanın.';
    this.el.classList.toggle('scan-on', use.checked);
  }
}

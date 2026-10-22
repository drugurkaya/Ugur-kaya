import * as THREE from 'three';
import { AIController, type Difficulty } from '../ai/AIController';
import { Audio, type HitSize } from '../audio/Audio';
import { buildCharacter, buildCustom } from '../characters/appearance';
import { loadProfile, saveProfile, type CustomProfile } from '../characters/profile';
import { FighterView } from '../characters/FighterView';
import { CHARACTERS, type CharacterId } from '../combat/data';
import type { CharacterDef } from '../combat/types';
import { Creator } from '../ui/Creator';
import { Fighter, FPS } from '../combat/Fighter';
import { Match, type MatchPhase } from '../combat/Match';
import { BUTTONS, type Button, type FighterInput, type MatchEvent } from '../combat/types';
import { Input, keyLabel, type ActionFrame } from '../core/Input';
import { clamp, damp } from '../core/math';
import { ACTION_LABELS, Settings, type Action, type Quality } from '../core/Settings';
import { CameraRig } from '../render/CameraRig';
import { VFX, type HitKind } from '../render/Particles';
import { Renderer } from '../render/Renderer';
import { UI, type MenuItem } from '../ui/UI';
import { Arena } from '../world/Arena';

type Screen = 'loading' | 'menu' | 'match';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const STEP = 1 / FPS;
const CHAR_IDS: CharacterId[] = ['phantom', 'ironfang'];
/** Selectable fighters: the two built-ins plus the player's own ("custom"). */
type FighterId = CharacterId | 'custom';
const FIGHTER_IDS: FighterId[] = ['phantom', 'ironfang', 'custom'];

/**
 * Top-level orchestrator: loading, menus, match lifecycle, fixed-step
 * simulation loop with render interpolation, and routing of combat events
 * to camera, particles, sound and HUD.
 */
export class Game {
  readonly settings = new Settings();
  readonly input = new Input(this.settings);
  readonly audio = new Audio(this.settings.data);
  readonly scene = new THREE.Scene();
  readonly cam: CameraRig;
  readonly ui: UI;
  private renderer!: Renderer;
  private arena!: Arena;
  private vfx!: VFX;
  private views: Partial<Record<FighterId, FighterView>>[] = [];
  private custom: CustomProfile | null = loadProfile();
  private customVersion = 0;
  private customBuilt: number[] = [-1, -1];
  private texSize = 512;
  private creator!: Creator;
  private creatorReturn: 'main' | 'select' = 'main';
  private active: [FighterView, FighterView] | null = null;
  private dummies: [Fighter, Fighter];
  match: Match | null = null;
  private ai: AIController | null = null;
  private screen: Screen = 'loading';
  paused = false;
  private acc = 0;
  private last = performance.now();
  private timeScale = 1;
  private slowTimer = 0;
  private slowScale = 1;
  private lastPhase: MatchPhase | null = null;
  private resultsShown = false;
  private fpsTimer = 0;
  private fpsFrames = 0;
  private fpsText = '';
  lastCalls = 0;
  lastTris = 0;
  private auraTimer = 0;
  private selectSide = 0;
  private selectReady = [false, false];
  p1: FighterId = 'phantom';
  p2: FighterId = 'ironfang';
  private menuTime = 0;
  private debugGroup = new THREE.Group();
  private debugSpheres: THREE.Mesh[] = [];
  private tmpV = new THREE.Vector3();
  private canvas: HTMLCanvasElement;
  /** Exposed for automated tests. */
  readonly stats = { frames: 0, simSteps: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.cam = new CameraRig(window.innerWidth / window.innerHeight);
    this.ui = new UI(this.settings, this.input, this.audio);
    this.dummies = [new Fighter(CHARACTERS.phantom, 0), new Fighter(CHARACTERS.ironfang, 1)];
    const uiHandler = this.input.onAction;
    this.input.onAction = (a) => {
      this.audio.unlock();
      if (this.screen === 'match' && !this.ui.top && a === 'pause' && !this.paused) {
        this.openPause();
        return;
      }
      uiHandler?.(a);
    };
    window.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', (e) => {
      // Ignore the Enter that started the match (same key event reaches both listeners).
      if (e.code === 'Enter' && this.match?.phase === 'intro' && this.match.phaseFrame > 20 && !this.paused) this.match.skipIntro();
      if (e.code === 'F3') {
        this.settings.update({ debugHitboxes: !this.settings.data.debugHitboxes });
        e.preventDefault();
      }
    });
    window.addEventListener('resize', () => {
      this.cam.setAspect(window.innerWidth / window.innerHeight);
      this.updateReflectionSize();
    });
    this.settings.onChange((s) => {
      this.applySettings();
      this.audio.apply(s);
    });
  }

  async init(): Promise<void> {
    try {
      this.ui.setLoading(0.05, 'Grafik motoru başlatılıyor');
      await nextFrame();
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) throw new Error('WEBGL2');
      this.renderer = new Renderer(this.canvas, this.scene, this.cam.camera);
      const q = this.settings.data.quality;
      const texSize = q === 'low' ? 256 : q === 'medium' ? 512 : 1024;
      this.texSize = Math.min(512, texSize);
      if (this.custom) this.p1 = 'custom';
      this.ui.setLoading(0.1, 'Tapınak inşa ediliyor');
      await nextFrame();
      this.arena = new Arena(this.scene, this.renderer.webgl, texSize, (p) => this.ui.setLoading(0.1 + p * 0.4, 'Tapınak inşa ediliyor'));
      this.vfx = new VFX(this.scene);
      this.scene.add(this.debugGroup);
      let k = 0;
      for (const slot of [0, 1]) {
        const rec: Partial<Record<FighterId, FighterView>> = {};
        for (const id of CHAR_IDS) {
          this.ui.setLoading(0.5 + k * 0.1, `Savaşçılar hazırlanıyor: ${CHARACTERS[id].name}`);
          await nextFrame();
          const model = buildCharacter(id, Math.min(512, texSize), slot === 1);
          const view = new FighterView(model, CHARACTERS[id].scale, this.scene);
          view.setVisible(false);
          rec[id] = view;
          k++;
        }
        this.views.push(rec);
      }
      this.ui.setLoading(0.92, 'Gölgelendiriciler derleniyor');
      await nextFrame();
      this.applySettings();
      this.showMenuFighters();
      this.renderer.webgl.compile(this.scene, this.cam.camera);
      this.ui.setLoading(1, 'Hazır');
      await nextFrame();
      this.buildMenus();
      this.goMainMenu();
      requestAnimationFrame(this.loop);
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error && err.message === 'WEBGL2'
          ? 'Bu tarayıcı veya ekran kartı WebGL 2 desteklemiyor.<br>Güncel bir Chrome, Edge veya Firefox ile donanım hızlandırma açıkken deneyin.'
          : `Oyun yüklenemedi: ${(err as Error)?.message ?? err}<br>Sayfayı yenileyin; sorun sürerse tarayıcı konsolunu kontrol edin.`;
      this.ui.showError(msg);
    }
  }

  /* ====================================================== Custom fighter */

  /** Combat definition for a fighter id (the custom fighter borrows its style's move set). */
  defOf(id: FighterId): CharacterDef {
    if (id !== 'custom') return CHARACTERS[id];
    const p = this.custom;
    const base = CHARACTERS[p?.style ?? 'phantom'];
    return {
      ...base,
      name: (p?.name || 'SEN').toUpperCase(),
      title: p ? (p.style === 'ironfang' ? 'Güçlü stil' : 'Hızlı stil') : 'Henüz oluşturulmadı',
      description: p ? 'Senin savaşçın. Fotoğrafından oluşturuldu.' : 'Enter ile fotoğrafından kendi savaşçını oluştur.',
      scale: base.scale * (p?.height ?? 1),
    };
  }

  /** View for a fighter in a slot; the custom one is (re)built when its profile changes. */
  private viewOf(slot: number, id: FighterId): FighterView {
    const rec = this.views[slot];
    if (id === 'custom' && this.customBuilt[slot] !== this.customVersion) {
      rec.custom?.dispose(this.scene);
      const prof = this.custom ?? loadProfile() ?? undefined;
      const model = prof ? buildCustom(prof, this.texSize, slot === 1) : buildCharacter('phantom', this.texSize, slot === 1);
      rec.custom = new FighterView(model, this.defOf('custom').scale, this.scene);
      rec.custom.setVisible(false);
      this.customBuilt[slot] = this.customVersion;
    }
    return rec[id]!;
  }

  private hideAllViews(): void {
    for (const rec of this.views) for (const v of Object.values(rec)) v?.setVisible(false);
  }

  private openCreator(returnTo: 'main' | 'select'): void {
    this.creatorReturn = returnTo;
    this.ui.show('creator');
    this.creator.open(this.custom);
  }

  private previewCustom(p: CustomProfile): void {
    this.custom = p;
    this.customVersion++;
    this.hideAllViews();
    const v = this.viewOf(0, 'custom');
    v.setVisible(true);
    const d = new Fighter(this.defOf('custom'), 0);
    d.resetForRound({ x: 0.9, z: 0.4 }, -0.25, true);
    this.dummies = [d, this.dummies[1]];
    this.active = [v, v];
    v.reset(d);
  }

  private closeCreator(): void {
    this.custom = loadProfile();
    this.customVersion++;
    if (!this.custom) {
      if (this.p1 === 'custom') this.p1 = 'phantom';
      if (this.p2 === 'custom') this.p2 = 'ironfang';
    }
    if (this.creatorReturn === 'select') this.openSelect();
    else this.goMainMenu();
  }

  /* ================================================================ Menus */

  private buildMenus(): void {
    const s = this.settings;
    const diffLabel: Record<Difficulty, string> = { easy: 'KOLAY', normal: 'NORMAL', hard: 'ZOR' };
    this.ui.defineMenu('main', () => ({
      className: 'main',
      items: [
        { kind: 'button', label: 'Oyunu Başlat', onSelect: () => this.openSelect() },
        { kind: 'button', label: 'Karakter Seçimi', onSelect: () => this.openSelect() },
        { kind: 'button', label: 'Karakterini Oluştur', onSelect: () => this.openCreator('main') },
        { kind: 'button', label: 'Zorluk Seviyesi', onSelect: () => this.openDifficulty(false) },
        { kind: 'button', label: 'Kontroller', onSelect: () => this.ui.push('controls') },
        { kind: 'button', label: 'Grafik Ayarları', onSelect: () => this.ui.push('graphics') },
        { kind: 'button', label: 'Ses Ayarları', onSelect: () => this.ui.push('audio') },
      ],
    }));

    const back = () => this.ui.pop();
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.ui.defineMenu('graphics', () => ({
      title: 'GRAFİK AYARLARI',
      subtitle: 'KALİTE VE PERFORMANS',
      onBack: back,
      items: [
        {
          kind: 'choice',
          label: 'Kalite',
          options: [
            { value: 'low', label: 'DÜŞÜK' },
            { value: 'medium', label: 'ORTA' },
            { value: 'high', label: 'YÜKSEK' },
            { value: 'ultra', label: 'ULTRA' },
          ],
          get: () => s.data.quality,
          set: (v) => {
            s.applyQuality(v as Quality);
            this.ui.refresh();
          },
        },
        { kind: 'slider', label: 'Çözünürlük', min: 0.5, max: 1, step: 0.05, get: () => s.data.resolutionScale, set: (v) => s.update({ resolutionScale: v }), fmt: pct },
        { kind: 'toggle', label: 'Gölgeler', get: () => s.data.shadows, set: (v) => s.update({ shadows: v }) },
        { kind: 'toggle', label: 'Bloom', get: () => s.data.bloom, set: (v) => s.update({ bloom: v }) },
        { kind: 'toggle', label: 'Zemin Yansımaları', get: () => s.data.reflections, set: (v) => s.update({ reflections: v }) },
        { kind: 'slider', label: 'Parçacıklar', min: 0.2, max: 1, step: 0.1, get: () => s.data.particles, set: (v) => s.update({ particles: v }), fmt: pct },
        { kind: 'slider', label: 'Kamera Sarsıntısı', min: 0, max: 1, step: 0.1, get: () => s.data.cameraShake, set: (v) => s.update({ cameraShake: v }), fmt: pct },
        { kind: 'toggle', label: 'FPS Göstergesi', get: () => s.data.showFps, set: (v) => s.update({ showFps: v }) },
        { kind: 'toggle', label: 'Hitbox Gösterimi (F3)', get: () => s.data.debugHitboxes, set: (v) => s.update({ debugHitboxes: v }) },
        { kind: 'button', label: 'Geri', onSelect: back },
      ],
      note: 'Kalite ön ayarı; doku çözünürlüğü, gölge haritası, MSAA, yansıma ve parçacık yoğunluğunu birlikte değiştirir. Doku çözünürlüğü değişikliği oyunu yeniden yüklediğinizde uygulanır.',
    }));

    this.ui.defineMenu('audio', () => ({
      title: 'SES AYARLARI',
      onBack: back,
      items: [
        { kind: 'slider', label: 'Ana Ses', min: 0, max: 1, step: 0.05, get: () => s.data.masterVolume, set: (v) => s.update({ masterVolume: v }) },
        { kind: 'slider', label: 'Efektler', min: 0, max: 1, step: 0.05, get: () => s.data.sfxVolume, set: (v) => s.update({ sfxVolume: v }) },
        { kind: 'slider', label: 'Ortam', min: 0, max: 1, step: 0.05, get: () => s.data.ambienceVolume, set: (v) => s.update({ ambienceVolume: v }) },
        { kind: 'slider', label: 'Müzik', min: 0, max: 1, step: 0.05, get: () => s.data.musicVolume, set: (v) => s.update({ musicVolume: v }) },
        { kind: 'button', label: 'Geri', onSelect: back },
      ],
      note: 'Tüm sesler Web Audio ile gerçek zamanlı sentezlenen geçici efektlerdir (kayıtlı ses dosyası kullanılmaz).',
    }));

    const actions: Action[] = ['up', 'down', 'left', 'right', 'lp', 'hp', 'lk', 'hk', 'block', 'dodge', 'special', 'pause'];
    const moveList = document.createElement('div');
    moveList.className = 'movelist';
    const k = (a: Action) => `<span class="k">${keyLabel(s.data.bindings[a])}</span>`;
    const renderMoves = () => {
      moveList.innerHTML = `
        <b>HAREKET</b><br>
        ${k('left')}${k('right')} ileri / geri (ekrana göre) · ${k('up')}${k('down')} yana adım<br>
        ${k('dodge')} + ileri: <b>hamle</b> · + geri: <b>geri sıçrama</b> · tek başına: <b>kaçınma</b><br>
        ${k('block')} basılı: <b>blok</b> (arkadan gelen darbe bloklanamaz)<br><br>
        <b>THE PHANTOM KOMBOLARI</b><br>
        ${k('lp')}${k('lp')}${k('lk')}${k('special')} Shadow Chain<br>
        ${k('lp')}${k('lp')}${k('lk')}${k('hk')} Nightfall<br>
        ${k('lp')}${k('lp')}${k('hp')} Ghost Palm<br><br>
        <b>IRON FANG KOMBOLARI</b><br>
        ${k('lp')}${k('lp')}${k('hp')} Iron Avalanche<br>
        ${k('lp')}${k('lk')}${k('hk')} Fang Crusher<br>
        ${k('lp')}${k('lp')}${k('hk')} Temple Fall<br><br>
        Zincirler yalnızca vuruş isabet ettiğinde veya bloklandığında devam eder.<br>
        ${k('special')} özel güç çubuğu dolduğunda kullanılır.<br><br>
        <b>OYUN KUMANDASI</b><br>
        Sol çubuk/D-pad hareket · X/Y yumruk · A/B tekme · RB blok · LB kaçınma · RT özel · Start duraklat`;
    };
    renderMoves();
    s.onChange(renderMoves);
    this.ui.defineMenu('controls', () => ({
      title: 'KONTROLLER',
      subtitle: 'DEĞİŞTİRMEK İÇİN SEÇİP YENİ TUŞA BASIN',
      onBack: back,
      extra: moveList,
      items: [
        ...actions.map((a) => ({ kind: 'key', label: ACTION_LABELS[a], action: a }) as MenuItem),
        { kind: 'button', label: 'Varsayılanlar', onSelect: () => s.resetBindings() },
        { kind: 'button', label: 'Geri', onSelect: back },
      ],
    }));

    const diffNote = (d: Difficulty) =>
      ({
        easy: 'Yavaş tepki verir, nadiren bloklar, kombolarını sık sık yarıda bırakır.',
        normal: 'Dengeli tepki süresi; açıkları cezalandırır, kombo devam ettirir.',
        hard: 'Çok hızlı tepki, güçlü savunma ve kaçınma; alışkanlıklarınıza göre strateji değiştirir.',
      })[d];
    this.ui.defineMenu('difficulty', () => ({
      title: 'ZORLUK SEVİYESİ',
      subtitle: 'RAKİBİN KARAR VERME HIZI, TEPKİ SÜRESİ VE SAVUNMASI',
      onBack: back,
      items: (['easy', 'normal', 'hard'] as Difficulty[]).map(
        (d) =>
          ({
            kind: 'button',
            label: `${diffLabel[d]}${s.data.difficulty === d ? '  ◆' : ''}`,
            onSelect: () => {
              s.update({ difficulty: d });
              if (this.difficultyStartsMatch) this.startMatch();
              else back();
            },
          }) as MenuItem,
      ),
      note: `${diffNote('easy')}<br>${diffNote('normal')}<br>${diffNote('hard')}`,
    }));

    this.ui.defineMenu('pause', () => ({
      title: 'DURAKLATILDI',
      onBack: () => this.resume(),
      items: [
        { kind: 'button', label: 'Devam Et', onSelect: () => this.resume() },
        { kind: 'button', label: 'Maçı Yeniden Başlat', onSelect: () => this.startMatch() },
        { kind: 'button', label: 'Kontroller', onSelect: () => this.ui.push('controls') },
        { kind: 'button', label: 'Grafik Ayarları', onSelect: () => this.ui.push('graphics') },
        { kind: 'button', label: 'Ses Ayarları', onSelect: () => this.ui.push('audio') },
        { kind: 'button', label: 'Ana Menü', onSelect: () => this.goMainMenu() },
      ],
    }));

    this.buildSelectScreen();

    this.creator = new Creator({
      preview: (p) => this.previewCustom(p),
      save: (p) => {
        if (!saveProfile(p)) return false;
        this.p1 = 'custom';
        this.closeCreator();
        return true;
      },
      cancel: () => this.closeCreator(),
      deleted: () => this.closeCreator(),
    });
    this.ui.defineCustom('creator', this.creator.el, {
      onNav: (a) => {
        if (a === 'back') this.closeCreator();
        return true;
      },
    });
  }

  private difficultyStartsMatch = false;

  private openDifficulty(startsMatch: boolean): void {
    this.difficultyStartsMatch = startsMatch;
    this.buildDifficultyLabels();
    this.ui.push('difficulty');
  }

  private buildDifficultyLabels(): void {
    // Rebuild to refresh the ◆ marker on the current difficulty.
    const s = this.settings;
    const items = document.querySelectorAll('#difficulty .item span');
    const labels = ['KOLAY', 'NORMAL', 'ZOR'];
    const vals: Difficulty[] = ['easy', 'normal', 'hard'];
    items.forEach((el, i) => {
      if (i < 3) el.textContent = `${labels[i]}${s.data.difficulty === vals[i] ? '  ◆' : ''}`;
    });
  }

  private selectEl!: HTMLElement;

  private buildSelectScreen(): void {
    const el = document.createElement('div');
    this.selectEl = el;
    const side = (i: number) => `
      <div class="sel-side" data-side="${i}">
        <div class="who">${i === 0 ? 'OYUNCU 1' : 'RAKİP · CPU'}</div>
        <div class="name"><span class="arr" data-d="-1">◀</span><span class="n"></span><span class="arr" data-d="1">▶</span></div>
        <div class="tag"></div>
        <div class="desc"></div>
        <div class="stats"></div>
        <div class="ready"></div>
      </div>`;
    el.innerHTML = `<div class="sel-title">SAVAŞÇINI SEÇ</div>${side(0)}${side(1)}
      <div class="footer-hint" style="bottom:2.5vh"><b>◀ ▶</b> değiştir <b>Enter</b> onayla <b>Esc</b> geri</div>`;
    el.querySelectorAll<HTMLElement>('.arr').forEach((a) =>
      a.addEventListener('click', (ev) => {
        const sd = Number((a.closest('.sel-side') as HTMLElement).dataset.side);
        this.selectSide = sd;
        this.selectReady[sd] = false;
        this.cycleChar(sd, Number(a.dataset.d));
        ev.stopPropagation();
      }),
    );
    el.querySelectorAll<HTMLElement>('.sel-side').forEach((p) =>
      p.addEventListener('click', () => {
        const sd = Number(p.dataset.side);
        if (sd !== this.selectSide) {
          this.selectSide = sd;
          this.renderSelect();
        } else this.selectConfirm();
      }),
    );
    this.ui.defineCustom('select', el, {
      onNav: (a) => {
        if (a === 'left' || a === 'right') {
          this.selectReady[this.selectSide] = false;
          this.cycleChar(this.selectSide, a === 'left' ? -1 : 1);
        } else if (a === 'confirm') this.selectConfirm();
        else if (a === 'back') {
          this.audio.menuBack();
          if (this.selectSide === 1) {
            this.selectSide = 0;
            this.selectReady = [false, false];
            this.renderSelect();
          } else this.goMainMenu();
        } else if (a === 'up' || a === 'down') {
          this.selectSide = 1 - this.selectSide;
          this.audio.menuMove();
          this.renderSelect();
        }
        return true;
      },
    });
  }

  private cycleChar(side: number, d: number): void {
    const cur = side === 0 ? this.p1 : this.p2;
    const idx = (FIGHTER_IDS.indexOf(cur) + d + FIGHTER_IDS.length) % FIGHTER_IDS.length;
    if (side === 0) this.p1 = FIGHTER_IDS[idx];
    else this.p2 = FIGHTER_IDS[idx];
    this.audio.menuMove();
    this.showMenuFighters();
    this.renderSelect();
  }

  private selectConfirm(): void {
    const chosen = this.selectSide === 0 ? this.p1 : this.p2;
    if (chosen === 'custom' && !this.custom) {
      this.audio.menuSelect();
      this.openCreator('select');
      return;
    }
    this.audio.menuSelect();
    this.selectReady[this.selectSide] = true;
    const d = this.dummies[this.selectSide];
    d.setState('victory');
    this.dummyTimers[this.selectSide] = 0;
    if (this.selectSide === 0) {
      this.selectSide = 1;
      this.renderSelect();
    } else {
      this.renderSelect();
      this.openDifficulty(true);
    }
  }

  private renderSelect(): void {
    const ids = [this.p1, this.p2];
    this.selectEl.querySelectorAll<HTMLElement>('.sel-side').forEach((p, i) => {
      const def = this.defOf(ids[i]);
      p.classList.toggle('active', i === this.selectSide);
      p.classList.toggle('ph', def.id === 'phantom');
      p.querySelector('.n')!.textContent = def.name;
      p.querySelector('.tag')!.textContent = def.title;
      p.querySelector('.desc')!.textContent = def.description;
      const st = def.stats;
      const row = (n: string, v: number) => `<div class="stat"><span>${n}</span><span class="pips">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= v ? 'on' : ''}"></i>`).join('')}</span></div>`;
      p.querySelector('.stats')!.innerHTML = row('GÜÇ', st.power) + row('HIZ', st.speed) + row('SAVUNMA', st.defense) + row('MENZİL', st.range);
      p.querySelector('.ready')!.textContent = this.selectReady[i] ? 'HAZIR' : i === this.selectSide ? 'SEÇİLİYOR…' : '';
    });
  }

  private openSelect(): void {
    this.selectSide = 0;
    this.selectReady = [false, false];
    this.renderSelect();
    this.ui.show('select');
    this.showMenuFighters();
  }

  goMainMenu(): void {
    this.endMatch();
    this.screen = 'menu';
    this.paused = false;
    this.ui.hud.setVisible(false);
    this.ui.show('main');
    this.cam.mode = 'menu';
    this.showMenuFighters();
    this.audio.stopMusic();
  }

  private dummyTimers = [0, 0];

  /** Place the two preview fighters for menu / character select. */
  private showMenuFighters(): void {
    if (!this.views.length || this.screen === 'match') return;
    this.hideAllViews();
    const a = this.viewOf(0, this.p1);
    const b = this.viewOf(1, this.p2);
    a.setVisible(true);
    b.setVisible(true);
    this.dummies = [new Fighter(this.defOf(this.p1), 0), new Fighter(this.defOf(this.p2), 1)];
    this.dummies[0].resetForRound({ x: -1.0, z: 0.3 }, 0.45, true);
    this.dummies[1].resetForRound({ x: 1.0, z: 0.3 }, -0.45, true);
    this.dummyTimers = [0, 0];
    this.active = [a, b];
    a.reset(this.dummies[0]);
    b.reset(this.dummies[1]);
  }

  /* ================================================================ Match */

  startMatch(): void {
    this.endMatch();
    this.ui.closeAll();
    this.screen = 'match';
    this.paused = false;
    this.match = new Match(this.defOf(this.p1), this.defOf(this.p2));
    this.ai = new AIController(this.settings.data.difficulty, (Math.random() * 1e9) | 0);
    this.hideAllViews();
    this.active = [this.viewOf(0, this.p1), this.viewOf(1, this.p2)];
    this.active.forEach((v, i) => {
      v.setVisible(true);
      v.reset(this.match!.fighters[i]);
    });
    this.vfx.clear();
    this.acc = 0;
    this.timeScale = 1;
    this.slowTimer = 0;
    this.lastPhase = null;
    this.resultsShown = false;
    this.input.flush();
    this.ui.hud.setFighters(this.defOf(this.p1), this.defOf(this.p2), ['OYUNCU 1', `CPU · ${({ easy: 'KOLAY', normal: 'NORMAL', hard: 'ZOR' } as const)[this.settings.data.difficulty]}`]);
    this.ui.hud.setVisible(true);
    this.ui.hud.setBarsVisible(false);
    this.ui.hud.clearAnnounce();
    this.cam.mode = 'intro';
    this.cam.cut();
    this.audio.startMusic();
  }

  private endMatch(): void {
    this.match = null;
    this.ai = null;
    this.vfx?.clear();
    this.ui.hud.clearAnnounce();
    this.ui.hud.setSkipHint(false);
  }

  private openPause(): void {
    this.paused = true;
    this.ui.show('pause');
    this.audio.menuSelect();
  }

  private resume(): void {
    this.paused = false;
    this.ui.closeAll();
    this.input.flush();
    this.last = performance.now();
  }

  private showResults(): void {
    const m = this.match!;
    const w = m.matchWinner;
    const playerWon = w === 0;
    const el = document.createElement('div');
    const name = w < 0 ? 'BERABERE' : this.defOf(w === 0 ? this.p1 : this.p2).name;
    el.innerHTML = `
      <div>
        <div class="winner"><small>${w < 0 ? 'SONUÇ' : playerWon ? 'ZAFER · KAZANAN' : 'YENİLGİ · KAZANAN'}</small>${name}</div>
        <table>
          <tr><td>Raund</td><td class="v">${m.wins[0]} - ${m.wins[1]}</td></tr>
          <tr><td>İsabet (sen / CPU)</td><td class="v">${m.stats.hits[0]} / ${m.stats.hits[1]}</td></tr>
          <tr><td>En uzun kombo</td><td class="v">${m.stats.maxCombo[0]} / ${m.stats.maxCombo[1]}</td></tr>
          <tr><td>Bloklanan darbe</td><td class="v">${m.stats.blocks[0]} / ${m.stats.blocks[1]}</td></tr>
          <tr><td>Özel saldırı</td><td class="v">${m.stats.specials[0]} / ${m.stats.specials[1]}</td></tr>
        </table>
        <div class="menu-slot"></div>
      </div>`;
    this.ui.defineMenu('resultsMenu', () => ({
      items: [
        { kind: 'button', label: 'Tekrar Oyna', onSelect: () => this.startMatch() },
        { kind: 'button', label: 'Karakter Seçimi', onSelect: () => this.openSelectFromMatch() },
        { kind: 'button', label: 'Ana Menü', onSelect: () => this.goMainMenu() },
      ],
    }));
    // Move the generated menu list into our custom results layout.
    const menuScreen = document.getElementById('resultsMenu')!;
    const list = menuScreen.querySelector('.menu')!;
    el.querySelector('.menu-slot')!.appendChild(list);
    menuScreen.remove();
    this.ui.defineCustom('results', el, {
      onNav: (a) => {
        const items = Array.from(list.querySelectorAll<HTMLElement>('.item'));
        let f = items.findIndex((i) => i.classList.contains('focus'));
        if (f < 0) f = 0;
        if (a === 'up' || a === 'down') {
          f = (f + (a === 'up' ? -1 : 1) + items.length) % items.length;
          this.audio.menuMove();
        } else if (a === 'confirm') items[f].click();
        items.forEach((it, i) => it.classList.toggle('focus', i === f));
        return true;
      },
    });
    const items = Array.from(list.querySelectorAll<HTMLElement>('.item'));
    items.forEach((it, i) => it.classList.toggle('focus', i === 0));
    this.ui.show('results');
    this.ui.hud.setBarsVisible(false);
    this.ui.hud.clearAnnounce();
  }

  private openSelectFromMatch(): void {
    this.endMatch();
    this.screen = 'menu';
    this.ui.hud.setVisible(false);
    this.audio.stopMusic();
    this.cam.mode = 'menu';
    this.openSelect();
  }

  /* ================================================================ Loop */

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.stats.frames++;
    const info = this.renderer.webgl.info;
    info.autoReset = false;
    this.lastCalls = info.render.calls;
    this.lastTris = info.render.triangles;
    info.reset();
    this.input.pollGamepad();
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fpsText = `${Math.round(this.fpsFrames / this.fpsTimer)} FPS · ${this.lastCalls} draw · ${Math.round(this.lastTris / 1000)}k tri · ${this.vfx.count} prt`;
      this.fpsTimer = 0;
      this.fpsFrames = 0;
    }
    this.ui.setFps(this.settings.data.showFps, this.fpsText);

    if (this.screen === 'match' && this.match) this.updateMatch(dt);
    else this.updateMenu(dt);

    this.arena.update(dt);
    this.vfx.update(dt * this.timeScale, this.cam.camera.position);
    this.updateDebug();
    this.arena.reflection.update(this.renderer.webgl, this.scene, this.cam.camera, [this.arena.floor, this.debugGroup]);
    this.renderer.render(dt);
  };

  private updateMenu(dt: number): void {
    this.menuTime += dt;
    if (!this.active) return;
    if (this.ui.topName === 'creator') {
      // Turntable preview of the player's own fighter.
      const d = this.dummies[0];
      d.prevYaw = d.yaw = -0.35 + Math.sin(this.menuTime * 0.5) * 0.45;
      this.active[0].update(d, 0, dt, false);
      this.cam.mode = 'manual';
      this.cam.manualPos.set(0.15, 1.35, 3.5);
      this.cam.manualTarget.set(0.45, 1.0, 0.4);
      this.cam.update(dt, { x: d.pos.x, y: 0, z: d.pos.z, yaw: d.yaw }, { x: d.pos.x, y: 0, z: d.pos.z, yaw: d.yaw }, 0, 0);
      return;
    }
    const inSelect = this.ui.topName === 'select' || this.ui.topName === 'difficulty';
    this.dummies.forEach((d, i) => {
      if (d.state === 'victory') {
        this.dummyTimers[i] += dt;
        d.stateFrame = Math.floor(this.dummyTimers[i] * 60);
        if (this.dummyTimers[i] > 2.4) d.setState('idle');
      }
      // Face the camera in select, face each other on the title screen.
      const want = inSelect ? (i === 0 ? 0.3 : -0.3) : i === 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 + 0.25;
      d.prevYaw = d.yaw = damp(d.yaw, want, 4, dt);
      const tx = inSelect ? (i === 0 ? -0.7 : 0.7) : i === 0 ? -1.25 : 1.25;
      d.pos.x = d.prevPos.x = damp(d.pos.x, tx, 4, dt);
      this.active![i].update(d, (this.dummyTimers[i] * 60) % 1, dt, false);
    });
    if (inSelect) {
      this.cam.mode = 'manual';
      const fx = this.selectSide === 0 ? -1 : 1;
      this.cam.manualPos.set(fx * 0.25, 1.5, 4.9);
      this.cam.manualTarget.set(fx * 0.2, 1.3, 0);
    } else if (this.screen === 'menu') this.cam.mode = 'menu';
    const a = this.dummies[0];
    const b = this.dummies[1];
    this.cam.update(dt, { x: a.pos.x, y: 0, z: a.pos.z, yaw: a.yaw }, { x: b.pos.x, y: 0, z: b.pos.z, yaw: b.yaw }, 0, 0);
  }

  private playerInput(af: ActionFrame): FighterInput {
    const m = this.match!;
    const f = m.fighters[0];
    const o = m.fighters[1];
    const { right, forward } = this.cam.groundAxes();
    let mx = af.moveX;
    let my = af.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const wx = right.x * mx + forward.x * my;
    const wz = right.z * mx + forward.z * my;
    const dx = o.pos.x - f.pos.x;
    const dz = o.pos.z - f.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const tx = dx / d;
    const tz = dz / d;
    const fwd = wx * tx + wz * tz;
    const lat = wx * tz - wz * tx;
    const pressed = new Set<Button>();
    for (const b of BUTTONS) if (af.pressed.has(b as Action)) pressed.add(b);
    return {
      fwd: Math.abs(fwd) < 0.3 ? 0 : Math.sign(fwd) * Math.min(1, Math.abs(fwd) * 1.2),
      lat: Math.abs(lat) < 0.3 ? 0 : Math.sign(lat) * Math.min(1, Math.abs(lat) * 1.2),
      block: af.held.has('block'),
      pressed,
      dodge: af.pressed.has('dodge'),
    };
  }

  private updateMatch(dt: number): void {
    const m = this.match!;
    if (this.paused) {
      this.renderViews(1, 0);
      this.cam.update(0, ...this.camSubjects(), 0, 0);
      return;
    }
    // Slow motion (KO / specials).
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      this.timeScale = this.slowScale;
    } else this.timeScale = damp(this.timeScale, 1, 6, dt);

    this.acc += this.manualSim ? 0 : dt * this.timeScale;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      const af = this.input.consume();
      if (m.phase === 'intro' && m.phaseFrame > 20 && ['lp', 'hp', 'lk', 'hk'].some((b) => af.pressed.has(b as Action))) m.skipIntro();
      const p1 = this.playerInput(af);
      const p2 = this.ai!.update(m, 1);
      m.step([p1, p2]);
      this.stats.simSteps++;
      this.handleEvents(m.events);
      this.handlePhase();
      this.acc -= STEP;
      steps++;
      if (!this.match) return;
    }
    if (steps === 6) this.acc = 0;
    const alpha = m.hitStop > 0 ? 1 : clamp(this.acc / STEP, 0, 1);
    this.renderViews(alpha, dt * this.timeScale);

    // Phase-dependent camera.
    const phaseT = m.phase === 'intro' ? m.phaseFrame / 260 : m.phase === 'ko' || m.phase === 'timeup' ? m.phaseFrame / 230 : 0;
    const focus = m.phase === 'matchEnd' ? Math.max(0, m.matchWinner) : Math.max(0, m.roundWinner);
    this.cam.update(dt, ...this.camSubjects(), focus, phaseT);
    this.ui.hud.update(m, dt);
    this.audio.setIntensity(1 - Math.min(m.fighters[0].health / m.fighters[0].def.maxHealth, m.fighters[1].health / m.fighters[1].def.maxHealth));

    // Footsteps, limb trails, meter aura.
    this.auraTimer -= dt;
    m.fighters.forEach((f, i) => {
      const v = this.active![i];
      if (v.footstep) this.audio.footstep(f.def.id === 'ironfang');
      const mv = f.move;
      if (f.state === 'attack' && mv && f.moveFrame >= mv.startup - 3 && f.moveFrame < mv.startup + mv.active && mv.sfx !== 'light') {
        v.limbPosition(mv.limb, this.tmpV);
        this.vfx.trail(this.tmpV.x, this.tmpV.y, this.tmpV.z, v.model.energy);
      }
      if (f.meter >= 100 && this.auraTimer <= 0) this.vfx.energy(f.pos.x, 1.0, f.pos.z, v.model.energy, 3, 0.45);
    });
    if (this.auraTimer <= 0) this.auraTimer = 0.12;

    if (m.phase === 'matchEnd' && m.phaseFrame > 170 && !this.resultsShown) {
      this.resultsShown = true;
      this.showResults();
    }
  }

  private camSubjects(): [{ x: number; y: number; z: number; yaw: number }, { x: number; y: number; z: number; yaw: number }] {
    const [a, b] = this.active!;
    return [
      { x: a.group.position.x, y: a.group.position.y, z: a.group.position.z, yaw: a.group.rotation.y },
      { x: b.group.position.x, y: b.group.position.y, z: b.group.position.z, yaw: b.group.rotation.y },
    ];
  }

  private renderViews(alpha: number, dt: number): void {
    const m = this.match!;
    m.fighters.forEach((f, i) => this.active![i].update(f, alpha, dt, f.meter >= 100));
  }

  private handlePhase(): void {
    const m = this.match!;
    const hud = this.ui.hud;
    if (m.phase !== this.lastPhase) {
      const prev = this.lastPhase;
      this.lastPhase = m.phase;
      switch (m.phase) {
        case 'intro':
          hud.setSkipHint(true);
          break;
        case 'ready':
          hud.setSkipHint(false);
          hud.setBarsVisible(true);
          this.cam.mode = 'fight';
          if (prev === 'ko' || prev === 'timeup') {
            this.cam.cut();
            this.vfx.clear();
            this.active!.forEach((v, i) => v.reset(m.fighters[i]));
          }
          this.ai?.reset();
          break;
        case 'fight':
          if (this.cam.mode === 'intro') this.cam.mode = 'fight';
          hud.setBarsVisible(true);
          hud.setSkipHint(false);
          break;
        case 'ko':
        case 'timeup':
          break;
        case 'matchEnd':
          this.cam.mode = 'victory';
          break;
      }
    }
    // Timed announcer beats.
    if (m.phase === 'ready') {
      if (m.phaseFrame === 1) {
        hud.announce(`ROUND ${m.round}`, m.wins[0] === 1 && m.wins[1] === 1 ? 'SON RAUND' : '', 'go');
        this.audio.gong();
      }
      if (m.phaseFrame === 75) {
        hud.announce('FIGHT!', '', 'go', true);
        this.audio.fight();
      }
    }
    if ((m.phase === 'ko' || m.phase === 'timeup') && m.phaseFrame === 95) this.cam.mode = 'victory';
    if (m.phase === 'matchEnd' && m.phaseFrame === 1) {
      const w = m.matchWinner;
      hud.announce(w < 0 ? 'BERABERE' : w === 0 ? 'ZAFER' : 'YENİLGİ', w < 0 ? '' : `${this.defOf(w === 0 ? this.p1 : this.p2).name} KAZANDI`, 'hold', w === 0);
      this.audio.stopMusic();
    }
  }

  private handleEvents(events: MatchEvent[]): void {
    const m = this.match!;
    for (const e of events) {
      switch (e.type) {
        case 'attackStart':
          this.audio.whoosh(e.move.sfx === 'medium' ? 'medium' : e.move.sfx === 'heavy' ? 'heavy' : 'light');
          break;
        case 'specialStart': {
          const f = m.fighters[e.fighter];
          const v = this.active![e.fighter];
          this.audio.special(f.def.id);
          this.cam.cinematic({ x: f.pos.x, y: 0, z: f.pos.z, yaw: f.yaw }, e.fighter, 1.0);
          this.slow(0.45, 0.45);
          this.vfx.energy(f.pos.x, 1, f.pos.z, v.model.energy, 60, 0.6);
          this.arena.runePulse = 1;
          const sp = this.project(f.pos.x, 2.2, f.pos.z);
          this.ui.hud.popup(e.move.name.toUpperCase(), 'name', sp.x, sp.y);
          break;
        }
        case 'hit':
          this.onHit(e);
          break;
        case 'land':
          this.vfx.dust(e.x, e.z, e.heavy ? 26 : 10, 0.6, 2);
          this.audio.bodyFall();
          this.cam.addShake(0.25);
          break;
        case 'dodge': {
          const f = m.fighters[e.fighter];
          this.audio.dodge();
          this.vfx.dust(f.pos.x, f.pos.z, 6, 0.3, 1.2);
          break;
        }
        case 'guardbreak': {
          const f = m.fighters[e.fighter];
          const sp = this.project(f.pos.x, 2.0, f.pos.z);
          this.ui.hud.popup('GUARD BREAK', 'back', sp.x, sp.y);
          this.audio.block(true);
          this.cam.addShake(0.5);
          break;
        }
        case 'shockwave':
          this.vfx.shockwave(e.x, e.z, e.radius, this.active![e.fighter].model.energy);
          this.audio.shockwave();
          this.cam.addShake(0.9);
          this.arena.runePulse = 1.5;
          break;
        case 'comboName': {
          const f = m.fighters[e.fighter];
          const sp = this.project(f.pos.x, 2.4, f.pos.z);
          this.ui.hud.popup(e.name, 'name', sp.x, sp.y);
          break;
        }
        case 'ko':
          this.audio.ko();
          this.slow(0.22, 1.5);
          this.cam.addShake(0.6);
          this.ui.hud.announce('K.O.', m.perfect ? 'PERFECT' : '', 'go', true);
          break;
        case 'timeUp':
          this.ui.hud.announce('SÜRE DOLDU', '', 'go');
          this.audio.gong();
          break;
        case 'whiff':
          break;
      }
    }
  }

  private onHit(e: Extract<MatchEvent, { type: 'hit' }>): void {
    const m = this.match!;
    const att = m.fighters[e.attacker];
    const def = m.fighters[e.defender];
    const dv = this.active![e.defender];
    const av = this.active![e.attacker];
    const dx = def.pos.x - att.pos.x;
    const dz = def.pos.z - att.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const kind: HitKind = e.blocked ? 'block' : (e.move.sfx as HitKind);
    this.vfx.hit(e.x, e.y, e.z, dx / d, dz / d, kind, av.model.energy);
    if (e.blocked) {
      this.audio.block(def.def.id === 'ironfang');
      this.cam.addShake(e.move.shake * 0.35);
    } else {
      this.audio.hit(e.move.sfx as HitSize, e.counter);
      this.cam.addShake(e.move.shake);
      dv.hitFlash(new THREE.Color(1, 0.85, 0.7), e.move.sfx === 'light' ? 0.5 : 0.9);
      // Flinch in the defender's local frame.
      const fx = Math.sin(def.yaw);
      const fz = Math.cos(def.yaw);
      const lz = (dx / d) * fx + (dz / d) * fz; // knockback along defender's forward (negative = pushed back)
      const lx = (dx / d) * fz - (dz / d) * fx;
      dv.animator.flinchImpulse(lx, lz, e.move.sfx === 'light' ? 0.6 : 1.1);
      if (e.effect === 'knockdown' || e.ko) this.vfx.dust(def.pos.x, def.pos.z, 10, 0.4, 1.5);
      if (e.counter && e.move.sfx === 'heavy') this.slow(0.5, 0.18);
    }
    const sp = this.project(e.x, e.y + 0.35, e.z);
    if (e.counter) this.ui.hud.popup('COUNTER', 'counter', sp.x, sp.y);
    else if (e.back) this.ui.hud.popup('BACK HIT', 'back', sp.x, sp.y);
    else if (e.armored) this.ui.hud.popup('ARMOR', 'armor', sp.x, sp.y);
  }

  private slow(scale: number, seconds: number): void {
    this.slowScale = scale;
    this.slowTimer = seconds;
  }

  private project(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.tmpV.set(x, y, z).project(this.cam.camera);
    return { x: clamp((v.x + 1) / 2, 0.05, 0.95), y: clamp((1 - v.y) / 2, 0.08, 0.9) };
  }

  /* ============================================================= Settings */

  private applySettings(): void {
    if (!this.renderer) return;
    const s = this.settings.data;
    this.renderer.applySettings(s);
    this.arena.applySettings(s);
    this.vfx.density = s.particles;
    this.cam.shakeScale = s.cameraShake;
    this.updateReflectionSize();
  }

  private updateReflectionSize(): void {
    if (!this.renderer) return;
    const s = this.settings.data;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * s.resolutionScale;
    const f = s.quality === 'ultra' ? 0.75 : 0.5;
    this.arena.reflection.setSize(window.innerWidth * pr * f, window.innerHeight * pr * f);
  }

  /* ============================================================== Debug */

  private updateDebug(): void {
    const on = this.settings.data.debugHitboxes && !!this.match;
    this.debugGroup.visible = on;
    if (!on) return;
    const m = this.match!;
    const items: { x: number; y: number; z: number; r: number; color: number; sy?: number }[] = [];
    for (const hb of m.debugHitboxes) items.push({ ...hb, color: 0xff3030 });
    for (const f of m.fighters) {
      const s = f.def.scale;
      if (f.isInvulnerable()) continue;
      items.push({ x: f.pos.x, y: (0.15 + 0.9) / 2 * s + f.y, z: f.pos.z, r: 0.2 * s, color: 0x30ff60, sy: ((0.9 - 0.15) * s) / (0.2 * s) / 2 + 1 });
      items.push({ x: f.pos.x, y: (0.9 + 1.42) / 2 * s + f.y, z: f.pos.z, r: 0.27 * s, color: 0x30ff60, sy: ((1.42 - 0.9) * s) / (0.27 * s) / 2 + 1 });
      items.push({ x: f.pos.x, y: 1.62 * s + f.y, z: f.pos.z, r: 0.15 * s, color: 0x30ff60, sy: 1.3 });
    }
    while (this.debugSpheres.length < items.length) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff, depthTest: false, transparent: true, opacity: 0.6 }));
      this.debugSpheres.push(mesh);
      this.debugGroup.add(mesh);
    }
    this.debugSpheres.forEach((s, i) => {
      const it = items[i];
      s.visible = !!it;
      if (!it) return;
      s.position.set(it.x, it.y, it.z);
      s.scale.set(it.r, it.r * (it.sy ?? 1), it.r);
      (s.material as THREE.MeshBasicMaterial).color.setHex(it.color);
    });
  }

  /* ========================================================== Test hooks */

  /** Start a match directly (used by automated browser tests). */
  quickMatch(p1: FighterId, p2: FighterId, difficulty: Difficulty, skipIntro = true): void {
    this.p1 = p1;
    this.p2 = p2;
    this.settings.update({ difficulty });
    this.startMatch();
    if (skipIntro) this.match!.skipIntro();
  }

  /** When true the simulation only advances through `debugStep` (tests/screenshots). */
  manualSim = false;

  /** Advance the match by n frames; P1 presses `buttons` on the first frame. CPU idles unless `ai`. */
  debugStep(n: number, buttons: Button[] = [], hold: Partial<FighterInput> = {}, ai = false): void {
    const m = this.match;
    if (!m) return;
    for (let i = 0; i < n; i++) {
      const p1: FighterInput = { fwd: 0, lat: 0, block: false, dodge: false, ...hold, pressed: new Set(i === 0 ? buttons : []) };
      const p2 = ai && this.ai ? this.ai.update(m, 1) : { fwd: 0, lat: 0, block: false, dodge: false, pressed: new Set<Button>() };
      m.step([p1, p2]);
      this.handleEvents(m.events);
      this.handlePhase();
    }
    this.renderViews(1, 1 / 60);
  }

  get screenName(): string {
    return this.ui.topName ?? this.screen;
  }
}

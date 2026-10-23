import * as THREE from 'three';
import { Audio } from '../audio/Audio';
import { Voice } from '../audio/Voice';
import { Character } from '../characters/Character';
import { CAST } from '../characters/cast';
import { Input } from '../core/Input';
import { clamp, damp } from '../core/rng';
import { PRESETS, Settings, isTouchDevice } from '../core/Settings';
import { formatClock } from '../core/time';
import { t } from '../i18n/strings';
import type { Ending, LegalResult } from '../legal/LegalSystem';
import { labReport } from '../medical/Patient';
import { LIBRARY } from '../narrative/content';
import { NarrativeEngine, type ShownLine } from '../narrative/Engine';
import { CameraRig } from '../render/CameraRig';
import { Renderer } from '../render/Renderer';
import { GameState } from '../state/GameState';
import { TRUTHS, type Truth } from '../medical/Patient';
import { SaveSystem, type SlotId } from '../state/Save';
import type { LText, SaveData } from '../state/types';
import { UI } from '../ui/UI';
import type { Area, Shot } from '../world/Area';
import { CarArea } from '../world/CarArea';
import { HomeArea } from '../world/HomeArea';
import { HospitalArea } from '../world/HospitalArea';
import { MATERIAL_LEVEL, collide } from '../world/kit';
import { OfficeArea, ORArea } from '../world/ORArea';
import { SCENE_AREA, Story, type SceneId } from './Story';

/** Game minutes that pass per real second while the player walks around. */
const TIME_SCALE = 0.12;
const RING_SECONDS = 20;

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromRot: THREE.Euler;
  toRot: THREE.Euler;
  t: number;
  dur: number;
  done?: () => void;
}

export interface Report {
  at: number;
  map: number;
  hr: number;
  cvp: number;
  drain: number;
  hb: number;
  lactate: number;
  labs?: string;
  echo?: string;
}

/**
 * Owns the main loop and wires the systems together: world areas, the protagonist, the camera,
 * narrative engine, story director, UI, audio and saving.
 */
export class Game {
  readonly settings = new Settings();
  readonly saves = new SaveSystem();
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio: Audio;
  readonly voice = new Voice();
  readonly ui: UI;
  readonly rig: CameraRig;
  readonly scene = new THREE.Scene();
  readonly touch = isTouchDevice();
  state: GameState | null = null;
  engine: NarrativeEngine | null = null;
  story: Story | null = null;
  area: Area | null = null;
  player: Character;
  inMenu = true;
  lastReport: Report | null = null;
  stats = { frames: 0, time: 0 };
  private clock = new THREE.Clock();
  private tween: Tween | null = null;
  private ring = { active: false, elapsed: 0, count: 0, pause: 0 };
  private busy = false;
  private stepPhase = 0;
  private menuT = 0;
  private aylaMoved = false;
  /** Active camera shot, re-solved every frame so it follows moving characters. */
  private shotName: string | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, this.settings.data.quality);
    this.rig = new CameraRig(container.clientWidth / Math.max(1, container.clientHeight));
    this.renderer.onResize = (a) => {
      this.rig.camera.aspect = a;
      this.rig.camera.updateProjectionMatrix();
    };
    this.renderer.resize();
    this.input = new Input(this.renderer.gl.domElement);
    this.audio = new Audio(this.settings.data);
    this.ui = new UI(this, container);
    MATERIAL_LEVEL.value = this.settings.data.quality;
    this.player = new Character(CAST.self.look);
    this.scene.environment = this.renderer.envMap;
    this.scene.environmentIntensity = 0.35;
    this.applySettings();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.settings.onChange(() => {
      this.audio.applyVolumes();
      this.ui.updateHud();
      if (this.engine?.active) this.ui.renderDialogue();
      if (this.ui.phoneView !== 'closed') this.ui.renderPhone();
    });
    (window as unknown as { __game: Game }).__game = this;
  }

  start() {
    this.showMenu();
    this.renderer.gl.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------------
  // Menu, new game, load
  // ---------------------------------------------------------------------------

  private showMenu() {
    this.inMenu = true;
    this.state = null;
    this.engine = null;
    this.story = null;
    this.stopRing();
    this.voice.stop();
    // A quiet, dark bedroom behind the menu.
    const bg = new GameState(GameState.fresh(1));
    this.setArea('home', bg);
    this.placePlayerInBed();
    (this.area as HomeArea).setPhone('off', '05:12');
    this.ui.showMenu(true);
    this.ui.setTouchVisible(false);
    this.ui.setFade(0);
    this.audio.setAmbience('menu');
    this.audio.monitorOn = false;
  }

  quitToMenu() {
    this.ui.closePhone();
    this.showMenu();
  }

  newGame(seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) & 0x7fffffff) {
    this.audio.unlock();
    // Testing aids: ?seed=123 and ?truth=surgical|coagulopathy|tamponade make a run reproducible.
    const q = new URLSearchParams(location.search);
    const qSeed = Number(q.get('seed'));
    const qTruth = q.get('truth') as Truth | null;
    if (qSeed) seed = qSeed;
    this.begin(new GameState(GameState.fresh(seed, qTruth && TRUTHS.includes(qTruth) ? qTruth : undefined)));
    this.lastReport = null;
    void this.intro();
  }

  private begin(state: GameState) {
    this.state = state;
    this.inMenu = false;
    this.aylaMoved = false;
    this.engine = new NarrativeEngine(state, LIBRARY, {
      update: () => this.ui.renderDialogue(),
      action: (a) => this.onAction(a),
      end: (id) => this.onDialogueEnd(id),
    });
    this.story = new Story(state, {
      goScene: (s) => void this.goScene(s),
      startDialogue: (id) => this.startDialogue(id),
      showEnding: (e, l) => this.showEnding(e, l),
      standUp: () => this.standUp(),
      outfit: (o) => this.player.setOutfit(o === 'shirt' ? 'shirt' : 'casual'),
      anim: (a) => this.playAnim(a),
    });
    state.on((kind, data) => {
      if (kind === 'message') {
        this.audio.sfx('notify');
        const m = state.data.messages.find((x) => x.id === data);
        if (m) this.ui.toast(`✉ ${CAST[m.from]?.name[this.settings.data.lang] ?? m.from}: ${t('newMessage', this.settings.data.lang)}`, 'msg');
      }
      if (kind === 'consequence') this.ui.toast('↻ ' + t('consequence', this.settings.data.lang), 'cons');
      if (kind === 'history' || kind === 'objective') this.ui.updateHud();
    });
    this.ui.showMenu(false);
    this.ui.setTouchVisible(this.touch);
  }

  private async intro() {
    const s = this.state!;
    this.busy = true;
    this.ui.setFade(1);
    this.setArea('home', s);
    this.placePlayerInBed();
    this.audio.setAmbience('home');
    const lang = this.settings.data.lang;
    this.ui.setHudVisible(false);
    await this.ui.titleCardShow([t('introPlace', lang), `${t('introDay', lang)} · 05:12`], 2600);
    this.fadeTo(0, 2.5);
    this.shot('bedWide');
    await wait(1500);
    this.ui.setHudVisible(true);
    this.busy = false;
    this.startRing();
  }

  async continueGame() {
    const l = this.saves.latest();
    if (l) await this.loadFrom(l.slot);
  }

  async loadFrom(slot: SlotId) {
    const d = this.saves.load(slot);
    if (!d) return;
    this.audio.unlock();
    this.ui.closePhone();
    this.engine?.reset();
    this.stopRing();
    this.voice.stop();
    this.begin(new GameState(d));
    this.lastReport = null;
    await this.restoreScene(d);
  }

  private async restoreScene(d: SaveData) {
    const s = this.state!;
    this.ui.setFade(1);
    const scene = d.scene as SceneId;
    if (scene === 'ending') {
      this.setArea('office', s);
      this.fadeTo(0, 1);
      this.story!.finish();
      return;
    }
    this.setArea(SCENE_AREA[scene] ?? 'home', s);
    this.setupScene(scene);
    if (scene === 'bedroom' || (scene === 'hospital' && d.pose.area === 'hospital')) {
      if (s.flag('outOfBed') || scene === 'hospital') {
        this.player.root.position.set(d.pose.x, 0, d.pose.z);
        this.player.root.rotation.set(0, d.pose.yaw, 0);
        this.player.pose = 'idle';
      }
    }
    if (scene === 'bedroom') {
      this.player.setOutfit(s.flag('dressed') ? (s.flag('outfit') === 'shirt' ? 'shirt' : 'casual') : 'pajamas');
      if (!s.flag('callAnswered') && !s.flag('declinedCall') && !s.flag('missedTwice')) this.startRing();
    }
    this.rig.snap(this.cameraTarget(), this.area!.blockers);
    this.fadeTo(0, 1);
    const start: Partial<Record<SceneId, string>> = { car: 'commute', or: 'or', family: 'family', evening: 'evening', office: 'epilogue' };
    const dlg = start[scene];
    if (dlg) this.startDialogue(dlg);
    this.ui.updateHud();
  }

  // ---------------------------------------------------------------------------
  // Areas and scenes
  // ---------------------------------------------------------------------------

  private setArea(id: string, state: GameState) {
    MATERIAL_LEVEL.value = this.settings.data.quality;
    this.tween = null;
    this.area?.dispose();
    this.scene.clear();
    const ctx = { preset: PRESETS[this.settings.data.quality], state };
    const area: Area = id === 'home' ? new HomeArea(ctx) : id === 'car' ? new CarArea(ctx) : id === 'hospital' ? new HospitalArea(ctx) : id === 'or' ? new ORArea(ctx) : new OfficeArea(ctx);
    area.build();
    this.area = area;
    this.scene.add(area.group);
    this.scene.background = area.background;
    const preset = PRESETS[this.settings.data.quality];
    this.scene.fog = area.fog && preset.atmosphere ? new THREE.FogExp2(area.fog.color, area.fog.density) : null;
    this.renderer.setGrade(area.grade);
    this.renderer.gl.toneMappingExposure = area.exposure;
    this.scene.add(this.player.root);
    this.player.root.visible = true;
    this.player.setGear({ cap: false, mask: false, phone: false });
    this.player.lookAt = null;
    this.audio.setAmbience(area.ambience);
    this.audio.monitorOn = false;
    this.shot(null);
    if (area instanceof HospitalArea || area instanceof ORArea) area.monitor.patient = state.patient();
    // Point every material at the environment map for reflections on the higher presets.
    this.scene.environmentIntensity = this.settings.data.quality === 'performance' ? 0.25 : 0.4;
  }

  private placePlayerInBed() {
    const sp = (this.area as HomeArea).spawns.bed;
    this.player.root.position.set(sp.x, sp.y ?? 0, sp.z);
    this.player.root.rotation.set(-Math.PI / 2, 0, -0.2);
    this.player.pose = 'lie';
    this.player.expression = 'sleep';
    this.player.setOutfit('pajamas');
    this.player.snap();
  }

  /** Scene transition: fade, swap area, place the protagonist, autosave. */
  private async goScene(scene: SceneId) {
    const s = this.state!;
    this.busy = true;
    this.ui.closePhone();
    await this.fadeTo(1, 0.7);
    const areaId = SCENE_AREA[scene];
    if (!this.area || this.area.constructor !== areaClass(areaId)) this.setArea(areaId, s);
    this.setupScene(scene);
    this.rig.snap(this.cameraTarget(), this.area!.blockers);
    if (scene === 'office') await this.ui.titleCardShow([t('threeWeeks', this.settings.data.lang)], 1800);
    if (scene === 'hospital') {
      // Arrival is a checkpoint for chapter 3.
      this.autosave();
    } else if (scene !== 'ending') this.autosave();
    this.fadeTo(0, 0.9);
    this.busy = false;
    this.ui.updateHud();
  }

  private setupScene(scene: SceneId) {
    const s = this.state!;
    const a = this.area!;
    const p = this.player;
    p.lookAt = null;
    switch (scene) {
      case 'bedroom':
        this.placePlayerInBed();
        if (s.flag('outOfBed')) {
          const sp = a.spawns.bedside;
          p.root.position.set(sp.x, 0, sp.z);
          p.root.rotation.set(0, sp.yaw, 0);
          p.pose = 'idle';
          p.expression = 'tired';
        }
        if (s.flag('aylaInKitchen')) this.moveAylaToKitchen();
        (a as HomeArea).setPhone('lock', formatClock(s.clock));
        (a as HomeArea).setLamp(!!s.flag('callAnswered'));
        break;
      case 'car': {
        const car = a as CarArea;
        car.car.add(p.root);
        p.root.position.set(0.37, 0.18, 0.05);
        p.root.rotation.set(0, 0, 0);
        p.pose = 'drive';
        p.expression = 'focused';
        p.snap();
        this.shot('carWide');
        break;
      }
      case 'hospital': {
        const sp = a.spawns.plaza;
        p.root.position.set(sp.x, 0, sp.z);
        p.root.rotation.set(0, sp.yaw, 0);
        p.pose = 'idle';
        p.expression = 'focused';
        this.rig.yaw = 0;
        break;
      }
      case 'family':
      case 'evening': {
        const h = a as HospitalArea;
        h.setMode(scene);
        const sp = scene === 'family' ? a.spawns.waiting : a.spawns.corridor;
        p.root.position.set(sp.x, 0, sp.z);
        p.root.rotation.set(0, sp.yaw, 0);
        p.pose = 'idle';
        p.setOutfit('coat');
        p.expression = 'tired';
        if (scene === 'family') p.lookAt = h.npcs.sevim?.headWorld() ?? null;
        this.shot(scene === 'family' ? 'family' : 'corridor');
        break;
      }
      case 'or': {
        const sp = a.spawns.surgeon;
        p.root.position.set(sp.x, 0, sp.z);
        p.root.rotation.set(0, sp.yaw, 0);
        p.setOutfit('scrubs');
        p.setGear({ cap: true, mask: true });
        p.pose = 'surgeon';
        p.expression = 'focused';
        p.snap();
        this.audio.monitorOn = true;
        this.shot('orWide');
        break;
      }
      case 'office': {
        const sp = a.spawns.chair;
        p.root.position.set(sp.x, 0, sp.z);
        p.root.rotation.set(0, sp.yaw, 0);
        p.setOutfit('shirt');
        p.pose = 'sit';
        p.expression = 'neutral';
        p.snap();
        this.shot('office');
        break;
      }
    }
  }

  applyQuality() {
    this.renderer.apply(this.settings.data.quality);
    if (!this.area) return;
    MATERIAL_LEVEL.value = this.settings.data.quality;
    this.player.root.removeFromParent();
    this.player = new Character(CAST.self.look);
    const pos = this.player.root.position.clone();
    const rot = this.player.root.rotation.clone();
    const st = this.state ?? new GameState(GameState.fresh(1));
    const areaId = this.inMenu ? 'home' : SCENE_AREA[(st.data.scene as SceneId) ?? 'bedroom'];
    this.setArea(areaId, st);
    if (this.inMenu) this.placePlayerInBed();
    else {
      this.setupScene(st.data.scene as SceneId);
      this.player.root.position.copy(pos);
      this.player.root.rotation.copy(rot);
    }
  }

  applySettings() {
    this.voice.enabled = this.settings.data.voice;
    this.rig.reduceMotion = this.settings.data.reduceMotion;
    this.ui.applyTextSize();
  }

  // ---------------------------------------------------------------------------
  // Phone
  // ---------------------------------------------------------------------------

  private startRing() {
    const s = this.state;
    if (!s) return;
    this.ring = { active: true, elapsed: 0, count: this.ring.count, pause: 0 };
    const home = this.area as HomeArea;
    home.setPhone('ringing', formatClock(s.clock), t('icuCaller', this.settings.data.lang));
    home.setVibrating(true);
    this.audio.setVibrating(true);
    this.ui.openPhone('ring');
    s.apply({ objective: 'answerPhone' });
    this.player.expression = this.ring.count ? 'drowsy' : 'sleep';
  }

  private stopRing() {
    this.ring.active = false;
    this.audio.setVibrating(false);
    if (this.area instanceof HomeArea) {
      this.area.setVibrating(false);
      this.area.setPhone('lock', this.state ? formatClock(this.state.clock) : '05:12');
    }
  }

  answerCall() {
    const s = this.state!;
    if (this.ring.count > 0) s.data.flags.missedCall = true;
    this.stopRing();
    this.ui.closePhone();
    s.apply({ flags: { inCall: true } });
    this.sitUpForCall();
    this.startDialogue('call');
  }

  declineCall() {
    this.stopRing();
    this.ui.closePhone();
    this.audio.sfx('click');
    this.player.expression = 'tired';
    this.startDialogue('declined');
  }

  private ringTimeout() {
    this.ring.count++;
    this.stopRing();
    this.ui.closePhone();
    this.state!.data.flags.missedCall = true;
    this.ui.toast('☎ ' + t('missedCall', this.settings.data.lang));
    if (this.ring.count >= 2) {
      this.startDialogue('missed');
    } else {
      this.ring.pause = 6;
    }
  }

  canCall(id: string): boolean {
    const s = this.state;
    if (!s || this.ring.active || this.engine?.active) return false;
    const sc = s.data.scene;
    if (['or', 'office', 'ending', 'family', 'evening'].includes(sc)) return false;
    if (sc === 'hospital' && s.flag('arrivedHospital')) return false;
    if (id === 'icu') return true;
    if (id === 'ece') return !!s.flag('eceWantsCall');
    if (id === 'ayla') return sc !== 'bedroom';
    return false;
  }

  callContact(id: string) {
    const s = this.state!;
    if (!this.canCall(id)) return;
    this.ui.closePhone();
    if (id === 'icu') {
      if (!s.flag('ordersGiven')) {
        s.apply({ flags: { callingBack: true, inCall: true } });
        if (!s.flag('outOfBed')) this.sitUpForCall();
        else this.player.setGear({ phone: true });
        this.startDialogue('call');
      } else {
        this.player.setGear({ phone: true });
        this.startDialogue('phoneIcu');
      }
    } else if (id === 'ece') {
      this.player.setGear({ phone: true });
      this.startDialogue('phoneEce');
    } else if (id === 'ayla') this.startDialogue('phoneAyla');
  }

  onPhoneClosed() {
    this.ui.updateHud();
  }

  private sitUpForCall() {
    const home = this.area as HomeArea;
    const sp = home.spawns.bedSit;
    this.player.pose = 'bedSit';
    this.player.setGear({ phone: true });
    this.player.expression = 'drowsy';
    home.setLamp(true);
    home.phoneMesh.visible = false;
    this.tweenRoot(new THREE.Vector3(sp.x, sp.y ?? 0.5, sp.z), new THREE.Euler(0, 0, 0), 1.2);
  }

  private standUp() {
    const home = this.area as HomeArea;
    const sp = home.spawns.bedside;
    this.player.pose = 'idle';
    this.player.setGear({ phone: false });
    this.tweenRoot(new THREE.Vector3(sp.x, 0, sp.z), new THREE.Euler(0, sp.yaw, 0), 1.4);
    this.rig.yaw = sp.yaw + Math.PI;
  }

  private playAnim(a: string) {
    if (a === 'drink') {
      this.player.pose = 'drink';
      setTimeout(() => (this.player.pose = 'idle'), 3500);
    }
  }

  private tweenRoot(to: THREE.Vector3, toRot: THREE.Euler, dur: number, done?: () => void) {
    this.tween = { from: this.player.root.position.clone(), to, fromRot: this.player.root.rotation.clone(), toRot, t: 0, dur, done };
  }

  // ---------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------

  startDialogue(id: string) {
    if (!this.engine) return;
    if (this.engine.active || this.busy) {
      // Queue behind the current dialogue or scene transition.
      const ready = () => {
        if (this.engine?.active || this.busy) setTimeout(ready, 200);
        else this.startDialogue(id);
      };
      setTimeout(ready, 200);
      return;
    }
    this.ui.closePhone();
    if (id === 'aylaWake' && this.area instanceof HomeArea) {
      const ay = this.area.npcs.ayla;
      ay.root.position.set(-3.25, 0.52, -1.85);
      ay.root.rotation.set(0, 0, 0);
      ay.pose = 'bedSit';
      ay.expression = 'worried';
      this.player.lookAt = ay.headWorld();
    }
    if (['washFace'].includes(id)) {
      this.player.pose = 'wash';
      this.audio.sfx('water');
    }
    if (id === 'dress') this.player.pose = 'dress';
    if (id === 'leaveHome') this.audio.sfx('door');
    this.engine.start(id);
    this.ui.renderDialogue();
  }

  onLineShown(line: ShownLine, text: string) {
    const s = this.state;
    if (!s) return;
    const sp = line.speaker;
    const npc = sp && sp !== 'self' ? this.area?.npcs[sp] : null;
    // Expressions and talking
    for (const n of Object.values(this.area?.npcs ?? {})) n.talking = false;
    this.player.talking = sp === 'self';
    if (npc) {
      npc.talking = true;
      if (line.expr) npc.expression = line.expr;
      npc.lookAt = this.player.headWorld();
      this.player.lookAt = npc.headWorld();
    } else if (sp === 'self' && line.expr) this.player.expression = line.expr;
    if (line.selfExpr) this.player.expression = line.selfExpr;
    if (line.sfx) this.audio.sfx(line.sfx);
    if (line.result) this.audio.sfx('select');
    // Camera
    if (line.shot) this.shot(line.shot);
    else if (npc && this.area?.walkable) this.shot('ots:' + sp);
    else if (sp && this.area?.walkable && (!this.shotName || this.shotName.startsWith('ots:'))) this.shot('faceClose');
    // A line that reports vitals updates the patient panel.
    if (/\{(map|drain|labs)\}/.test(line.text.en) || line.result) this.captureReport(line.result ? text : undefined);
    this.voice.speak(text, sp, this.settings.data.lang);
    this.ui.updateHud();
  }

  private captureReport(resultText?: string) {
    const s = this.state!;
    const p = s.patient();
    const lang = this.settings.data.lang;
    const prev = this.lastReport;
    this.lastReport = {
      at: Math.floor(s.clock),
      map: p.map,
      hr: p.hr,
      cvp: p.cvp,
      drain: p.drainRate,
      hb: p.hb,
      lactate: p.lactate,
      labs: p.labsSent ? labReport(p)[lang] : prev?.labs,
      echo: resultText && /eko|echo/i.test(resultText) ? resultText : prev?.echo,
    };
  }

  private onAction(a: string) {
    const s = this.state!;
    if (a === 'callEnded') {
      s.apply({ flags: { inCall: false } });
      this.player.setGear({ phone: false });
      this.player.pose = this.player.pose === 'bedSit' ? 'bedSit' : 'idle';
    }
    this.story?.action(a);
  }

  private onDialogueEnd(id: string) {
    const s = this.state;
    if (!s) return;
    s.markDone('dlg:' + id);
    this.voice.stop();
    for (const n of Object.values(this.area?.npcs ?? {})) {
      n.talking = false;
      n.lookAt = null;
    }
    this.player.talking = false;
    this.player.lookAt = null;
    if (['phoneIcu', 'phoneEce', 'call', 'declined', 'missed'].includes(id)) {
      this.player.setGear({ phone: false });
      s.apply({ flags: { inCall: false } });
    }
    if (['washFace', 'dress', 'coffee'].includes(id) && this.player.pose !== 'drink') this.player.pose = 'idle';
    if (id === 'aylaWake' && this.area instanceof HomeArea) {
      const ay = this.area.npcs.ayla;
      ay.root.position.set(-3.25, 0.72, -0.5);
      ay.root.rotation.set(-Math.PI / 2, 0, 0.25);
      ay.pose = 'lie';
      ay.expression = 'tired';
    }
    if (id === 'aylaKitchen') s.markDone('talkedAylaKitchen');
    if (id === 'call' && !s.flag('outOfBed')) this.player.expression = 'worried';
    if (this.area?.walkable && !this.busy) this.shot(null);
    this.ui.updateHud();
    // Autosave after the first decision (chapter 2 checkpoint).
    if (id === 'call' || id === 'aylaWake') this.autosave();
  }

  /** Pick the camera shot by name (area shots first, then generic ones). */
  private shot(name: string | null) {
    this.shotName = name;
    if (!name) return this.rig.setShot(null);
    this.rig.setShot(this.resolveShot(name), name);
  }

  private resolveShot(name: string): Shot | null {
    const fromArea = this.area?.shot(name);
    if (fromArea) return fromArea;
    const head = this.player.headWorld();
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.root.quaternion);
    if (this.player.pose === 'lie') face.set(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(face, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    side.normalize();
    if (name === 'faceClose' || name === 'faceTense') {
      const d = name === 'faceTense' ? 0.62 : 0.85;
      const pos = head.clone().addScaledVector(face, d).addScaledVector(side, d * 0.35).add(new THREE.Vector3(0, 0.04, 0));
      return { pos, target: head.clone().add(new THREE.Vector3(0, -0.01, 0)), fov: name === 'faceTense' ? 34 : 38, roll: name === 'faceTense' ? 0.06 : 0 };
    }
    if (name.startsWith('ots:')) {
      const npc = this.area?.npcs[name.slice(4)];
      if (!npc) return null;
      const nh = npc.headWorld();
      const dir = head.clone().sub(nh).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const pos = head.clone().addScaledVector(dir, 1.05).addScaledVector(right, -0.55).add(new THREE.Vector3(0, 0.12, 0));
      const target = nh.clone().lerp(head, 0.18).add(new THREE.Vector3(0, -0.05, 0));
      return { pos, target, fov: 40 };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Interaction and movement
  // ---------------------------------------------------------------------------

  private nearestInteractable() {
    const s = this.state;
    const a = this.area;
    if (!s || !a || this.engine?.active || this.busy || this.ring.active) return null;
    const p = this.player.root.position;
    let best: (typeof a.interactables)[number] | null = null;
    let bd = Infinity;
    for (const it of a.interactables) {
      if (it.when && !it.when(s)) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < it.radius && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  interact() {
    const it = this.nearestInteractable();
    if (!it) return;
    this.audio.sfx('click');
    if (it.dialogue) this.startDialogue(it.dialogue);
  }

  private movePlayer(dt: number) {
    const a = this.area!;
    const s = this.state!;
    const p = this.player;
    if (!a.walkable || !s.flag('outOfBed') && a instanceof HomeArea) return 0;
    const m = this.input.move();
    const len = Math.hypot(m.x, m.y);
    if (len < 0.05) {
      p.speed = damp(p.speed, 0, 10, dt);
      if (p.pose === 'walk' && p.speed < 0.1) p.pose = 'idle';
      return 0;
    }
    // Camera-relative direction.
    const fwd = new THREE.Vector3();
    this.rig.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = fwd.multiplyScalar(m.y).addScaledVector(right, m.x).normalize();
    // Fatigue slows the protagonist; very high fatigue prevents hurrying.
    const fatigue = s.stat('fatigue');
    const canRun = fatigue < 85;
    const speed = (m.run && canRun ? 2.5 : 1.35) * (1 - Math.max(0, fatigue - 60) / 200) * len;
    p.speed = damp(p.speed, speed, 8, dt);
    let x = p.root.position.x + dir.x * p.speed * dt;
    let z = p.root.position.z + dir.z * p.speed * dt;
    [x, z] = collide(x, z, 0.28, a.colliders);
    p.root.position.x = x;
    p.root.position.z = z;
    const yaw = Math.atan2(dir.x, dir.z);
    let dy = yaw - p.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    p.root.rotation.y += dy * Math.min(1, dt * 10);
    p.pose = 'walk';
    this.stepPhase += p.speed * dt * 1.6;
    if (this.stepPhase > 1) {
      this.stepPhase = 0;
      this.audio.sfx('step');
    }
    return p.speed;
  }

  private moveAylaToKitchen() {
    if (!(this.area instanceof HomeArea)) return;
    const ay = this.area.npcs.ayla;
    ay.root.position.set(6.1, 0, -1.0);
    ay.root.rotation.set(0, -Math.PI / 2 - 0.3, 0);
    ay.pose = 'idle';
    ay.expression = 'neutral';
    this.aylaMoved = true;
  }

  private cameraTarget() {
    const p = this.player.root.position;
    const y = this.player.pose === 'lie' || this.player.pose === 'bedSit' ? p.y + 0.5 : 1.45;
    return new THREE.Vector3(p.x, y, p.z);
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  canSave() {
    return !!this.state && !this.engine?.active && !this.ring.active && !this.busy && this.saves.available && this.state.data.scene !== 'ending';
  }

  private syncPose() {
    const s = this.state!;
    const r = this.player.root;
    s.data.pose = { area: SCENE_AREA[s.data.scene as SceneId] ?? 'home', x: r.position.x, z: r.position.z, yaw: r.rotation.y };
  }

  saveTo(slot: SlotId): boolean {
    if (!this.canSave()) {
      this.ui.toast(t('cannotSaveNow', this.settings.data.lang));
      return false;
    }
    this.syncPose();
    return this.saves.save(slot, this.state!.data, slot);
  }

  private autosave() {
    if (!this.state || !this.settings.data.autosave || !this.saves.available) return;
    this.syncPose();
    if (this.saves.save('auto', this.state.data, 'auto')) this.ui.toast('💾 ' + t('autosaving', this.settings.data.lang), 'save');
  }

  private showEnding(e: Ending, l: LegalResult) {
    this.audio.sfx('end');
    if (this.saves.available) {
      this.syncPose();
      this.saves.save('auto', this.state!.data, 'ending');
    }
    this.ui.showEnding(e, l);
  }

  onModalClosed() {
    this.ui.updateHud();
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  private async fadeTo(v: number, secs: number) {
    const start = parseFloat(getComputedStyle(this.ui.root.querySelector('.fade')!).opacity || '0');
    const steps = Math.max(1, Math.round(secs * 30));
    for (let i = 1; i <= steps; i++) {
      this.ui.setFade(start + ((v - start) * i) / steps);
      await wait(secs * 1000 / steps);
    }
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.stats.frames++;
    this.stats.time += dt;
    const s = this.state;
    const ui = this.ui;
    const input = this.input;
    if (input.consume('pause')) {
      if (ui.modalOpen) ui.closeModal();
      else if (ui.phoneView !== 'closed' && ui.phoneView !== 'ring') ui.closePhone();
      else if (!this.inMenu) ui.openPause();
    }
    const modal = !!ui.modalOpen;
    if (s && !this.inMenu && !modal) {
      if (input.consume('advance')) ui.advance();
      if (input.consume('interact')) {
        if (this.engine?.active) ui.advance();
        else this.interact();
      }
      if (input.consume('phone')) ui.togglePhone();
      if (input.consume('journal')) ui.openJournal();
    }
    const paused = modal || this.inMenu;
    if (s && !paused) this.updateGame(dt);
    if (this.inMenu) {
      this.menuT += dt;
      this.rig.setShot({ pos: new THREE.Vector3(-0.8 + Math.sin(this.menuT * 0.1) * 0.4, 1.9, 1.2), target: new THREE.Vector3(-2.6, 0.7, -1.4), fov: 45 }, 'menu');
    }
    // Character and area animation run even when paused for the menu backdrop.
    if (!modal) {
      this.player.update(dt);
      this.area?.update(dt, this.player.root.position);
      ui.tick(dt);
    }
    if (this.shotName && !this.inMenu && this.stats.frames % 3 === 0) this.rig.setShot(this.resolveShot(this.shotName), this.shotName);
    if (input.lookDX || input.lookDY) this.rig.orbit(input.lookDX, input.lookDY, this.settings.data.lookSensitivity, this.settings.data.invertY);
    if (input.zoom) this.rig.zoomBy(input.zoom);
    this.rig.update(dt, this.cameraTarget(), this.area?.blockers ?? []);
    this.renderer.fx.dof = this.inMenu ? 0 : this.rig.dof;
    this.renderer.fx.focus = this.rig.focus;
    // Letterbox bars during dialogue and cinematic shots.
    ui.setCinema(!this.inMenu && !!this.state && (!!this.engine?.active || !!this.shotName) && !ui.modalOpen);
    this.renderer.render(this.scene, this.rig.camera, this.stats.time, dt);
    input.endFrame();
  }

  private updateGame(dt: number) {
    const s = this.state!;
    const ui = this.ui;
    // Root tween (sitting up, standing up)
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this.player.root.position.lerpVectors(tw.from, tw.to, k);
      this.player.root.rotation.set(
        tw.fromRot.x + (tw.toRot.x - tw.fromRot.x) * k,
        tw.fromRot.y + (tw.toRot.y - tw.fromRot.y) * k,
        tw.fromRot.z + (tw.toRot.z - tw.fromRot.z) * k,
      );
      if (tw.t >= 1) {
        this.tween = null;
        tw.done?.();
      }
    }
    // Phone ringing state machine
    if (this.ring.active) {
      this.ring.elapsed += dt;
      if (this.ring.elapsed > RING_SECONDS) this.ringTimeout();
      if (this.ring.count > 0 || this.ring.elapsed > 6) this.player.expression = 'drowsy';
    } else if (this.ring.pause > 0) {
      this.ring.pause -= dt;
      if (this.ring.pause <= 0) this.startRing();
    }
    const talking = !!this.engine?.active;
    const freeRoam = !talking && !this.busy && !this.ring.active && ui.phoneView === 'closed' && !this.tween;
    this.input.enabled = freeRoam;
    let moving = 0;
    if (freeRoam && this.area?.walkable) moving = this.movePlayer(dt);
    else if (this.player.pose === 'walk') this.player.pose = 'idle';
    // Time flows while exploring (the patient does not wait).
    if (freeRoam && this.area?.walkable && (s.flag('outOfBed') || !(this.area instanceof HomeArea))) s.advance(dt * TIME_SCALE * (moving > 0 ? 1 : 0.7));
    // Area-specific updates
    if (this.area instanceof HomeArea) {
      this.area.updateTime(s.clock);
      if (!this.ring.active && this.area.phone.mode !== 'off') this.area.phone.time = formatClock(s.clock);
      if (!this.aylaMoved && s.flag('outOfBed') && (this.player.root.position.x > -0.5 || s.flag('dressed')) && !this.engine?.active) {
        s.data.flags.aylaInKitchen = true;
        this.moveAylaToKitchen();
      }
    }
    if (this.area instanceof CarArea) {
      this.area.display.time = formatClock(s.clock);
      this.area.display.line = 'Yeşilvadi E.A.H. · 6 km';
    }
    if (this.area instanceof HospitalArea) {
      const p = this.player.root.position;
      this.audio.monitorOn = p.z < -16;
      const ip = this.area.interactables.find((i) => i.id === 'icu');
      if (ip && freeRoam && ip.when?.(s) && Math.hypot(ip.pos.x - p.x, ip.pos.z - p.z) < 1.3) this.startDialogue('icu');
    }
    const pt = s.patient();
    this.audio.hr = pt.arrested ? 0 : pt.hr;
    this.audio.alarm = pt.map < 55 && !pt.outcome;
    // Stress shapes the image, the sound and the camera.
    const stress = s.stat('stress');
    this.audio.stress = stress;
    const fx = this.renderer.fx;
    fx.stress = damp(fx.stress, clamp((stress - 30) / 70, 0, 1) * 0.8, 2, dt);
    fx.pulse = stress > 60 ? (Math.sin(this.stats.time * (1 + stress / 50) * Math.PI) * 0.5 + 0.5) * ((stress - 60) / 40) : 0;
    fx.warm = this.area instanceof HomeArea ? 0.15 : 0;
    this.rig.shake = clamp((stress - 50) / 50, 0, 1) * 0.6;
    // Interaction prompt
    const it = freeRoam ? this.nearestInteractable() : null;
    ui.setPrompt(it ? it.label[this.settings.data.lang] : null);
    if (this.stats.frames % 15 === 0) ui.updateHud();
  }

  /** Test hook: teleport near an interactable. */
  debugTeleport(id: string) {
    const it = this.area?.interactables.find((i) => i.id === id);
    if (!it) return false;
    this.player.root.position.set(it.pos.x, 0, it.pos.z + 0.2);
    return true;
  }

  /** Localised helper for other modules. */
  tx(l: LText) {
    return l[this.settings.data.lang];
  }
}

function areaClass(id: string) {
  return id === 'home' ? HomeArea : id === 'car' ? CarArea : id === 'hospital' ? HospitalArea : id === 'or' ? ORArea : OfficeArea;
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

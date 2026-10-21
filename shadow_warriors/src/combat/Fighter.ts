import { angleDelta, clamp } from '../core/math';
import type { Button, CharacterDef, FighterInput, FighterState, MoveDef } from './types';

export const FPS = 60;
const DT = 1 / FPS;
const GRAVITY = 20;
const BUFFER_FRAMES = 8;

const DASH_FRAMES = 16;
const BACKDASH_FRAMES = 18;
const SIDESTEP_FRAMES = 20;
const SIDESTEP_INVULN: [number, number] = [2, 13];
const BACKDASH_INVULN: [number, number] = [1, 7];
const DOWN_FRAMES = 38;
const GETUP_FRAMES = 30;
const STAGGER_FRAMES = 42;
const GUARDBREAK_FRAMES = 46;

export interface Vec2 {
  x: number;
  z: number;
}

/** Ground-plane distance-integrated ease used by dashes: returns progress 0..1. */
const dashCurve = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 2.2);

export class Fighter {
  readonly def: CharacterDef;
  readonly index: number;

  pos: Vec2 = { x: 0, z: 0 };
  prevPos: Vec2 = { x: 0, z: 0 };
  /** Facing angle: 0 = +Z. */
  yaw = 0;
  prevYaw = 0;
  /** Height above ground (launch arcs). */
  y = 0;
  prevY = 0;
  vy = 0;
  /** Knockback / external velocity in world space (m/s). */
  vel: Vec2 = { x: 0, z: 0 };
  /** Smoothed locomotion velocity in fighter-local axes (m/s). */
  walkFwd = 0;
  walkLat = 0;

  health = 0;
  displayHealth = 0;
  meter = 0;
  guard = 100;

  state: FighterState = 'idle';
  stateFrame = 0;
  stunFrames = 0;

  move: MoveDef | null = null;
  moveFrame = 0;
  hitConsumed: boolean[] = [];
  moveConnected = false;
  moveBlocked = false;
  armorUsed = false;
  /** Move ids of the current chain (for named combos). */
  chain: string[] = [];
  chainAllHit = true;

  /** As a defender: hits taken in the current combo. */
  comboHits = 0;
  comboDamage = 0;
  koFlag = false;
  /** Frames since the last time this fighter got hit (for UI flashes). */
  hitFlash = 0;
  lastHitDir: Vec2 = { x: 0, z: 1 };
  lastHitHeavy = false;
  /** Sidestep direction (+1 left / -1 right). */
  dodgeDir = 1;
  dodgeStart: Vec2 = { x: 0, z: 0 };
  private dashLastProgress = 0;
  private lungeLastProgress = 0;

  private buffer: { button: Button; frames: number } | null = null;
  /** Counts consecutive frames block is held (used for AI/analytics). */
  blockHeld = 0;

  constructor(def: CharacterDef, index: number) {
    this.def = def;
    this.index = index;
    this.resetForRound({ x: 0, z: 0 }, 0, true);
  }

  resetForRound(pos: Vec2, yaw: number, fullReset: boolean): void {
    this.pos = { ...pos };
    this.prevPos = { ...pos };
    this.yaw = this.prevYaw = yaw;
    this.y = this.prevY = this.vy = 0;
    this.vel = { x: 0, z: 0 };
    this.walkFwd = this.walkLat = 0;
    this.health = this.displayHealth = this.def.maxHealth;
    if (fullReset) this.meter = 0;
    this.guard = 100;
    this.state = 'idle';
    this.stateFrame = 0;
    this.stunFrames = 0;
    this.move = null;
    this.moveFrame = 0;
    this.hitConsumed = [];
    this.moveConnected = this.moveBlocked = this.armorUsed = false;
    this.chain = [];
    this.comboHits = 0;
    this.comboDamage = 0;
    this.koFlag = false;
    this.hitFlash = 0;
    this.buffer = null;
    this.blockHeld = 0;
  }

  setState(s: FighterState): void {
    if (s !== this.state) {
      this.state = s;
      this.stateFrame = 0;
    }
    if (s !== 'attack') this.move = null;
  }

  get forward(): Vec2 {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
  /** Fighter's left (+lat). */
  get left(): Vec2 {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  get isAirborne(): boolean {
    return this.y > 0.05 || this.state === 'launch';
  }

  /** True while the fighter can be hit by attacks. */
  isInvulnerable(): boolean {
    switch (this.state) {
      case 'launch':
      case 'down':
      case 'getup':
      case 'ko':
      case 'victory':
      case 'defeat':
      case 'intro':
        return true;
      case 'sidestep':
        return this.stateFrame >= SIDESTEP_INVULN[0] && this.stateFrame <= SIDESTEP_INVULN[1];
      case 'backdash':
        return this.stateFrame >= BACKDASH_INVULN[0] && this.stateFrame <= BACKDASH_INVULN[1];
      case 'attack': {
        const inv = this.move?.invuln;
        return !!inv && this.moveFrame >= inv[0] && this.moveFrame <= inv[1];
      }
      default:
        return false;
    }
  }

  hasArmor(): boolean {
    if (this.state !== 'attack' || !this.move?.armor || this.armorUsed) return false;
    const [a, b] = this.move.armor;
    return this.moveFrame >= a && this.moveFrame <= b;
  }

  isBlocking(): boolean {
    return this.state === 'block' || this.state === 'blockstun';
  }

  /** In the startup/active frames of an attack: hits here are counter hits. */
  isCounterable(): boolean {
    return this.state === 'attack' && !!this.move && this.moveFrame < this.move.startup + this.move.active;
  }

  isActionable(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'block';
  }

  bufferPresses(input: FighterInput): void {
    for (const b of input.pressed) this.buffer = { button: b, frames: BUFFER_FRAMES };
  }

  /** Frame-advance of the fighter for one simulation tick. */
  update(input: FighterInput, opp: Fighter, canAct: boolean, events: (e: FighterSimEvent) => void): void {
    this.prevPos = { ...this.pos };
    this.prevYaw = this.yaw;
    this.prevY = this.y;
    this.stateFrame++;
    if (this.hitFlash > 0) this.hitFlash--;

    // Input buffer: edge presses survive a few frames so timing feels fair.
    if (canAct) {
      for (const b of input.pressed) this.buffer = { button: b, frames: BUFFER_FRAMES };
    }
    if (this.buffer && --this.buffer.frames <= 0) this.buffer = null;
    this.blockHeld = input.block ? this.blockHeld + 1 : 0;

    // Guard regenerates when not blocking.
    if (!this.isBlocking() && this.state !== 'guardbreak') this.guard = Math.min(100, this.guard + 0.35);
    // Health "ghost" bar for the HUD.
    if (this.displayHealth > this.health) {
      const busy = this.state === 'hitstun' || this.state === 'stagger';
      if (!busy) this.displayHealth = Math.max(this.health, this.displayHealth - 6);
    } else this.displayHealth = this.health;

    const toOpp = { x: opp.pos.x - this.pos.x, z: opp.pos.z - this.pos.z };
    const oppYaw = Math.atan2(toOpp.x, toOpp.z);

    switch (this.state) {
      case 'intro':
      case 'victory':
      case 'defeat':
        this.slowVelocity(0.8);
        break;

      case 'idle':
      case 'walk':
      case 'block': {
        this.turnToward(oppYaw, 0.22);
        if (!canAct) {
          this.locomote(0, 0, toOpp);
          if (this.state !== 'idle') this.setState('idle');
          break;
        }
        if (this.tryStartFromNeutral(input, events)) break;
        if (input.dodge) {
          this.startDodge(input, events);
          break;
        }
        if (input.block) {
          if (this.state !== 'block') this.setState('block');
          this.locomote(0, 0, toOpp);
          break;
        }
        const moving = Math.abs(input.fwd) > 0.2 || Math.abs(input.lat) > 0.2;
        this.locomote(input.fwd, input.lat, toOpp);
        if (moving && this.state !== 'walk') this.setState('walk');
        else if (!moving && this.state !== 'idle' && Math.hypot(this.walkFwd, this.walkLat) < 0.3) this.setState('idle');
        break;
      }

      case 'dash':
      case 'backdash': {
        this.turnToward(oppYaw, 0.15);
        const frames = this.state === 'dash' ? DASH_FRAMES : BACKDASH_FRAMES;
        const dist = this.state === 'dash' ? this.def.dashDist : -this.def.backdashDist;
        const p = dashCurve(this.stateFrame / frames);
        const step = (p - this.dashLastProgress) * dist;
        this.dashLastProgress = p;
        const f = this.forward;
        this.pos.x += f.x * step;
        this.pos.z += f.z * step;
        this.walkFwd = (step / DT) * 0.6;
        this.walkLat = 0;
        // Dash can be cancelled into an attack after a few frames.
        if (this.state === 'dash' && this.stateFrame > 6 && canAct && this.tryStartFromNeutral(input, events)) break;
        if (this.stateFrame >= frames) this.setState('idle');
        break;
      }

      case 'sidestep': {
        // Circle around the opponent: move along the perpendicular of the line between fighters.
        const len = Math.hypot(toOpp.x, toOpp.z) || 1;
        const lx = toOpp.z / len;
        const lz = -toOpp.x / len;
        const p = dashCurve(this.stateFrame / SIDESTEP_FRAMES);
        const step = (p - this.dashLastProgress) * this.def.sidestepDist * this.dodgeDir;
        this.dashLastProgress = p;
        this.pos.x += lx * step;
        this.pos.z += lz * step;
        this.walkLat = (step / DT) * 0.6;
        this.walkFwd = 0;
        this.turnToward(oppYaw, 0.3);
        if (this.stateFrame >= SIDESTEP_FRAMES) this.setState('idle');
        break;
      }

      case 'attack':
        this.updateAttack(input, oppYaw, canAct, events);
        break;

      case 'blockstun':
        this.turnToward(oppYaw, 0.1);
        this.slowVelocity(0.82);
        if (this.stateFrame >= this.stunFrames) this.setState(input.block ? 'block' : 'idle');
        break;

      case 'hitstun':
        this.slowVelocity(0.86);
        if (this.stateFrame >= this.stunFrames) this.recoverToNeutral();
        break;

      case 'stagger':
        this.slowVelocity(0.85);
        if (this.stateFrame >= STAGGER_FRAMES) this.recoverToNeutral();
        break;

      case 'guardbreak':
        this.slowVelocity(0.8);
        if (this.stateFrame >= GUARDBREAK_FRAMES) {
          this.guard = 60;
          this.recoverToNeutral();
        }
        break;

      case 'launch':
        this.vy -= GRAVITY * DT;
        this.y += this.vy * DT;
        this.slowVelocity(0.985);
        if (this.y <= 0 && this.vy < 0) {
          this.y = 0;
          this.vy = 0;
          events({ type: 'land', heavy: true });
          this.setState(this.koFlag ? 'ko' : 'down');
        }
        break;

      case 'down':
        this.slowVelocity(0.8);
        if (this.stateFrame >= DOWN_FRAMES) {
          this.setState('getup');
          this.comboHits = 0;
          this.comboDamage = 0;
        }
        break;

      case 'getup':
        this.turnToward(oppYaw, 0.12);
        if (this.stateFrame >= GETUP_FRAMES) this.recoverToNeutral();
        break;

      case 'ko':
        this.slowVelocity(0.8);
        break;
    }

    // Integrate external velocity (knockback).
    this.pos.x += this.vel.x * DT;
    this.pos.z += this.vel.z * DT;
  }

  private recoverToNeutral(): void {
    this.comboHits = 0;
    this.comboDamage = 0;
    this.setState('idle');
  }

  private slowVelocity(f: number, decayWalk = true): void {
    this.vel.x *= f;
    this.vel.z *= f;
    if (decayWalk) {
      this.walkFwd *= 0.8;
      this.walkLat *= 0.8;
    }
  }

  private turnToward(target: number, rate: number): void {
    const d = angleDelta(this.yaw, target);
    this.yaw += clamp(d, -rate, rate);
  }

  private locomote(fwd: number, lat: number, toOpp: Vec2): void {
    const tf = fwd > 0 ? fwd * this.def.walkFwd : fwd * this.def.walkBack;
    let tl = lat * this.def.walkLat;
    // Normalise diagonal movement.
    if (Math.abs(fwd) > 0.2 && Math.abs(lat) > 0.2) tl *= 0.75;
    // Don't walk into the opponent's body.
    const dist = Math.hypot(toOpp.x, toOpp.z);
    let targetF = tf;
    if (dist < 0.95 && targetF > 0) targetF *= 0.2;
    const accel = 0.22;
    this.walkFwd += (targetF - this.walkFwd) * accel;
    this.walkLat += (tl - this.walkLat) * accel;
    const f = this.forward;
    const l = this.left;
    this.pos.x += (f.x * this.walkFwd + l.x * this.walkLat) * DT;
    this.pos.z += (f.z * this.walkFwd + l.z * this.walkLat) * DT;
    this.slowVelocity(0.82, false);
  }

  private startDodge(input: FighterInput, events: (e: FighterSimEvent) => void): void {
    this.dashLastProgress = 0;
    if (input.fwd > 0.5) {
      this.setState('dash');
      events({ type: 'dodge', kind: 'dash' });
    } else if (input.fwd < -0.5) {
      this.setState('backdash');
      events({ type: 'dodge', kind: 'backdash' });
    } else {
      this.dodgeDir = input.lat < -0.2 ? -1 : 1;
      this.dodgeStart = { ...this.pos };
      this.setState('sidestep');
      events({ type: 'dodge', kind: 'sidestep' });
    }
  }

  /** Consumes a buffered press from neutral; returns true if a move started. */
  private tryStartFromNeutral(_input: FighterInput, events: (e: FighterSimEvent) => void): boolean {
    if (!this.buffer) return false;
    const b = this.buffer.button;
    const id = this.def.normals[b];
    if (b === 'special' && this.meter < 100) {
      this.buffer = null;
      events({ type: 'specialDenied' });
      return false;
    }
    this.buffer = null;
    this.chain = [];
    this.chainAllHit = true;
    this.startMove(this.def.moves[id], events);
    return true;
  }

  private startMove(move: MoveDef, events: (e: FighterSimEvent) => void): void {
    if (move.sfx === 'special') {
      this.meter = 0;
      events({ type: 'specialStart', move });
    } else events({ type: 'attackStart', move });
    this.setState('attack');
    this.move = move;
    this.moveFrame = 0;
    this.hitConsumed = new Array((move.multiHit?.length ?? 1) as number).fill(false);
    this.moveConnected = false;
    this.moveBlocked = false;
    this.armorUsed = false;
    this.lungeLastProgress = 0;
    this.chain.push(move.id);
  }

  private updateAttack(input: FighterInput, oppYaw: number, canAct: boolean, events: (e: FighterSimEvent) => void): void {
    const m = this.move!;
    this.moveFrame++;
    // Attacks track during the first frames of startup only.
    if (this.moveFrame <= Math.min(4, m.startup)) this.turnToward(oppYaw, 0.12);
    else if (m.sfx === 'special' && this.moveFrame < m.startup) this.turnToward(oppYaw, 0.06);

    // Root motion: lunge distributed over startup + active with ease-out.
    const lungeFrames = m.startup + m.active;
    const p = dashCurve(this.moveFrame / lungeFrames);
    const step = (p - this.lungeLastProgress) * m.lunge;
    this.lungeLastProgress = p;
    const f = this.forward;
    this.pos.x += f.x * step;
    this.pos.z += f.z * step;
    this.walkFwd = (step / DT) * 0.5;
    this.walkLat *= 0.8;
    this.slowVelocity(0.85, false);

    // Chains: on hit or block, within the cancel window.
    if (canAct && this.buffer && this.moveConnected) {
      const [c0, c1] = m.cancelWindow;
      if (this.moveFrame >= c0 && this.moveFrame <= c1) {
        const next = this.def.chains[m.id]?.[this.buffer.button];
        if (next) {
          const nm = this.def.moves[next];
          if (nm.sfx !== 'special' || this.meter >= 100) {
            this.buffer = null;
            this.startMove(nm, events);
            return;
          }
        }
      }
    }

    const total = m.startup + m.active + m.recovery;
    if (this.moveFrame === m.startup + m.active && !this.moveConnected) events({ type: 'whiff', move: m });
    if (this.moveFrame >= total) {
      this.move = null;
      this.setState(input.block ? 'block' : 'idle');
    }
  }

  /** Index of the hit that is active this frame, or -1. */
  activeHitIndex(): number {
    const m = this.move;
    if (this.state !== 'attack' || !m) return -1;
    if (m.multiHit) {
      for (let i = m.multiHit.length - 1; i >= 0; i--) {
        const s = m.multiHit[i];
        if (this.moveFrame >= s && this.moveFrame < s + 4 && !this.hitConsumed[i]) return i;
      }
      return -1;
    }
    if (this.moveFrame >= m.startup && this.moveFrame < m.startup + m.active && !this.hitConsumed[0]) return 0;
    return -1;
  }

  /** Normalised 0..1 position inside the active window (for sweeping hitboxes). */
  activeProgress(): number {
    const m = this.move;
    if (!m) return 0;
    return clamp((this.moveFrame - m.startup) / Math.max(1, m.active - 1), 0, 1);
  }

  addMeter(v: number): void {
    this.meter = clamp(this.meter + v, 0, 100);
  }
}

export type FighterSimEvent =
  | { type: 'attackStart'; move: MoveDef }
  | { type: 'specialStart'; move: MoveDef }
  | { type: 'specialDenied' }
  | { type: 'whiff'; move: MoveDef }
  | { type: 'land'; heavy: boolean }
  | { type: 'dodge'; kind: 'dash' | 'backdash' | 'sidestep' };

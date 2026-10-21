import { clamp } from '../core/math';
import { ARENA_RADIUS, ROUND_TIME, ROUNDS_TO_WIN } from './data';
import { FPS, Fighter, type FighterSimEvent } from './Fighter';
import type { CharacterDef, FighterInput, MatchEvent, MoveDef } from './types';

export type MatchPhase = 'intro' | 'ready' | 'fight' | 'ko' | 'timeup' | 'matchEnd';

const INTRO_FRAMES = 260;
const READY_FRAMES = 120;
const KO_FRAMES = 230;
const START_DISTANCE = 3.2;

/** Hurt capsule: vertical segment [y0, y1] with radius r around the fighter centre. */
interface HurtCapsule {
  y0: number;
  y1: number;
  r: number;
  fwd: number;
}

const HURTBOXES: HurtCapsule[] = [
  { y0: 0.15, y1: 0.9, r: 0.2, fwd: 0 }, // legs
  { y0: 0.9, y1: 1.42, r: 0.27, fwd: 0.02 }, // torso
  { y0: 1.52, y1: 1.72, r: 0.15, fwd: 0.04 }, // head
];

const comboScale = (hitIndex: number): number => Math.max(0.45, 1 - 0.1 * Math.max(0, hitIndex - 1));

export interface HitboxDebug {
  x: number;
  y: number;
  z: number;
  r: number;
}

export class Match {
  readonly fighters: [Fighter, Fighter];
  phase: MatchPhase = 'intro';
  phaseFrame = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timerFrames = ROUND_TIME * FPS;
  /** Global freeze frames after a hit (hit-stop). */
  hitStop = 0;
  /** Winner of the last round (-1 draw), and of the match when decided. */
  roundWinner = -1;
  matchWinner = -1;
  perfect = false;
  frame = 0;
  events: MatchEvent[] = [];
  /** Hitboxes active this frame (debug overlay). */
  debugHitboxes: HitboxDebug[] = [];
  /** Stats used by tests / results screen. */
  stats = { hits: [0, 0], blocks: [0, 0], maxCombo: [0, 0], specials: [0, 0] };

  constructor(p1: CharacterDef, p2: CharacterDef, skipIntro = false) {
    this.fighters = [new Fighter(p1, 0), new Fighter(p2, 1)];
    this.placeFighters(true);
    if (skipIntro) this.setPhase('ready');
    else for (const f of this.fighters) f.setState('intro');
  }

  private placeFighters(full: boolean): void {
    const [a, b] = this.fighters;
    a.resetForRound({ x: -START_DISTANCE / 2, z: 0 }, Math.PI / 2, full);
    b.resetForRound({ x: START_DISTANCE / 2, z: 0 }, -Math.PI / 2, full);
  }

  private setPhase(p: MatchPhase): void {
    this.phase = p;
    this.phaseFrame = 0;
  }

  get timerSeconds(): number {
    return Math.ceil(this.timerFrames / FPS);
  }

  /** Skip the cinematic intro (button press). */
  skipIntro(): void {
    if (this.phase === 'intro') {
      for (const f of this.fighters) f.setState('idle');
      this.setPhase('ready');
    }
  }

  /** Advance one fixed 1/60 s step. */
  step(inputs: [FighterInput, FighterInput]): void {
    this.events = [];
    this.frame++;
    this.phaseFrame++;
    if (this.hitStop > 0) {
      this.hitStop--;
      // Presses made during hit-stop are buffered so combos feel responsive.
      if (this.phase === 'fight') this.fighters.forEach((f, i) => f.bufferPresses(inputs[i]));
      return;
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseFrame >= INTRO_FRAMES) {
          for (const f of this.fighters) f.setState('idle');
          this.setPhase('ready');
        }
        break;
      case 'ready':
        if (this.phaseFrame >= READY_FRAMES) this.setPhase('fight');
        break;
      case 'fight':
        if (--this.timerFrames <= 0) {
          this.timerFrames = 0;
          this.events.push({ type: 'timeUp' });
          this.endRound(this.decideByHealth(), 'timeup');
        }
        break;
      case 'ko':
      case 'timeup':
        this.updateRoundEnd();
        break;
      case 'matchEnd':
        break;
    }

    const canAct = this.phase === 'fight';
    const [a, b] = this.fighters;
    const sink = (idx: number) => (e: FighterSimEvent) => this.onFighterEvent(idx, e);
    a.update(canAct ? inputs[0] : idleInput, b, canAct, sink(0));
    b.update(canAct ? inputs[1] : idleInput, a, canAct, sink(1));

    this.debugHitboxes = [];
    if (this.phase === 'fight' || this.phase === 'ko') {
      // Resolve both attacks against the pre-hit state so trades are fair.
      const hitA = this.checkHit(a, b);
      const hitB = this.checkHit(b, a);
      const moveA = a.move;
      const moveB = b.move;
      if (hitA && moveA) this.applyHit(a, b, moveA, hitA.index, hitA.x, hitA.y, hitA.z);
      if (hitB && moveB) this.applyHit(b, a, moveB, hitB.index, hitB.x, hitB.y, hitB.z);
    }
    this.resolveBodies();
  }

  private onFighterEvent(idx: number, e: FighterSimEvent): void {
    switch (e.type) {
      case 'attackStart':
        this.events.push({ type: 'attackStart', fighter: idx, move: e.move });
        break;
      case 'specialStart':
        this.stats.specials[idx]++;
        this.events.push({ type: 'specialStart', fighter: idx, move: e.move });
        break;
      case 'whiff':
        this.events.push({ type: 'whiff', fighter: idx, move: e.move });
        break;
      case 'land': {
        const f = this.fighters[idx];
        this.events.push({ type: 'land', fighter: idx, x: f.pos.x, z: f.pos.z, heavy: e.heavy });
        break;
      }
      case 'dodge':
        this.events.push({ type: 'dodge', fighter: idx, kind: e.kind });
        break;
      case 'specialDenied':
        break;
    }
  }

  private hitboxWorld(att: Fighter, m: MoveDef): HitboxDebug {
    const t = att.activeProgress();
    const hb = m.hitbox;
    const he = m.hitboxEnd;
    const s = att.def.scale;
    const fwd = (he?.fwd !== undefined ? hb.fwd + (he.fwd - hb.fwd) * t : hb.fwd) * s;
    const up = (he?.up !== undefined ? hb.up + (he.up - hb.up) * t : hb.up) * s;
    const lat = (he?.lat !== undefined ? hb.lat + (he.lat - hb.lat) * t : hb.lat) * s;
    const r = hb.r * s;
    const f = att.forward;
    const l = att.left;
    return { x: att.pos.x + f.x * fwd + l.x * lat, y: up + att.y, z: att.pos.z + f.z * fwd + l.z * lat, r };
  }

  private checkHit(att: Fighter, def: Fighter): { index: number; x: number; y: number; z: number } | null {
    const idx = att.activeHitIndex();
    if (idx < 0 || !att.move) return null;
    const m = att.move;
    if (def.isInvulnerable()) return null;

    if (m.areaRadius) {
      // Shockwave: grounded opponents within radius of the impact point.
      const f = att.forward;
      const cx = att.pos.x + f.x * m.hitbox.fwd * att.def.scale;
      const cz = att.pos.z + f.z * m.hitbox.fwd * att.def.scale;
      this.debugHitboxes.push({ x: cx, y: 0.2, z: cz, r: m.areaRadius });
      const d = Math.hypot(def.pos.x - cx, def.pos.z - cz);
      if (d <= m.areaRadius + def.def.pushRadius && def.y < 0.4) return { index: idx, x: def.pos.x, y: 0.8, z: def.pos.z };
      return null;
    }

    const hb = this.hitboxWorld(att, m);
    this.debugHitboxes.push(hb);
    const ds = def.def.scale;
    const df = def.forward;
    for (const c of HURTBOXES) {
      const cx = def.pos.x + df.x * c.fwd * ds;
      const cz = def.pos.z + df.z * c.fwd * ds;
      const y0 = c.y0 * ds + def.y;
      const y1 = c.y1 * ds + def.y;
      const cy = clamp(hb.y, y0, y1);
      const dx = hb.x - cx;
      const dy = hb.y - cy;
      const dz = hb.z - cz;
      const rr = hb.r + c.r * ds;
      if (dx * dx + dy * dy + dz * dz <= rr * rr) {
        // Contact point: on the hurt surface toward the hitbox.
        const len = Math.hypot(dx, dy, dz) || 1;
        const k = (c.r * ds) / len;
        return { index: idx, x: cx + dx * k, y: cy + dy * k, z: cz + dz * k };
      }
    }
    return null;
  }

  private applyHit(att: Fighter, def: Fighter, m: MoveDef, index: number, x: number, y: number, z: number): void {
    att.hitConsumed[index] = true;
    const isLast = !m.multiHit || index === m.multiHit.length - 1;
    let damage = m.multiDamage ? m.multiDamage[index] : m.damage;
    const effect = isLast ? m.effect : 'normal';

    // Facing relation: is the attacker in front of the defender?
    const dx = att.pos.x - def.pos.x;
    const dz = att.pos.z - def.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const df = def.forward;
    const frontDot = (df.x * dx + df.z * dz) / dl;
    const back = frontDot < -0.25;
    const blocked = def.isBlocking() && frontDot > 0.2;
    const counter = !blocked && def.isCounterable();
    const armored = !blocked && def.hasArmor();

    const dir = { x: -dx / dl, z: -dz / dl };
    def.lastHitDir = dir;
    att.moveConnected = true;

    let ko = false;
    if (blocked) {
      att.moveBlocked = true;
      att.chainAllHit = false;
      damage = Math.round(damage * m.chip);
      def.health = Math.max(1, def.health - damage); // chip never kills
      def.guard -= m.guardDamage;
      def.addMeter(3);
      att.addMeter(m.meterGain * 0.4);
      this.stats.blocks[def.index]++;
      if (def.guard <= 0) {
        def.guard = 0;
        def.setState('guardbreak');
        def.vel = { x: dir.x * 2.5, z: dir.z * 2.5 };
        this.events.push({ type: 'guardbreak', fighter: def.index });
      } else {
        def.setState('blockstun');
        def.stunFrames = m.blockstun;
        const push = m.pushBlock / def.def.weight;
        def.vel = { x: dir.x * push, z: dir.z * push };
      }
      this.hitStop = Math.max(this.hitStop, Math.round(m.hitStop * 0.6));
    } else {
      def.comboHits++;
      let mult = comboScale(def.comboHits);
      if (counter) mult *= 1.2;
      if (back) mult *= 1.25;
      // Named combo finisher bonus.
      const named = this.matchNamedCombo(att);
      if (named) {
        mult *= 1.15;
        this.events.push({ type: 'comboName', fighter: att.index, name: named });
      }
      damage = Math.max(1, Math.round(damage * mult * (armored ? 0.6 : 1)));
      def.health = Math.max(0, def.health - damage);
      def.comboDamage += damage;
      def.hitFlash = 8;
      def.lastHitHeavy = m.sfx === 'heavy' || m.sfx === 'special';
      def.addMeter(damage * 0.07);
      att.addMeter(m.meterGain);
      this.stats.hits[att.index]++;
      this.stats.maxCombo[att.index] = Math.max(this.stats.maxCombo[att.index], def.comboHits);
      ko = def.health <= 0;

      if (ko) {
        def.koFlag = true;
        def.setState('launch');
        def.vy = 5.2;
        def.y = 0.01;
        const push = 4.5 / def.def.weight;
        def.vel = { x: dir.x * push, z: dir.z * push };
      } else if (armored) {
        def.armorUsed = true;
      } else {
        const push = (m.pushHit / def.def.weight) * (counter ? 1.2 : 1);
        def.vel = { x: dir.x * push, z: dir.z * push };
        if (effect === 'knockdown' || (counter && m.sfx === 'heavy' && effect === 'push' && def.comboHits <= 1 && m.damage >= 120)) {
          def.setState('launch');
          def.vy = effect === 'knockdown' ? 4.6 : 3.8;
          def.y = 0.01;
        } else if (counter && m.sfx === 'heavy') {
          def.setState('stagger');
        } else {
          def.setState('hitstun');
          def.stunFrames = m.hitstun + (counter ? 6 : 0);
        }
        // Restart stun animations even when already in hitstun.
        def.stateFrame = 0;
      }
      this.hitStop = Math.max(this.hitStop, ko ? 22 : m.hitStop + (counter ? 3 : 0));
    }

    this.events.push({
      type: 'hit',
      attacker: att.index,
      defender: def.index,
      x,
      y,
      z,
      damage,
      blocked,
      counter,
      back,
      armored,
      combo: def.comboHits,
      move: m,
      effect,
      ko,
    });
    if (m.areaRadius) {
      const f = att.forward;
      this.events.push({
        type: 'shockwave',
        fighter: att.index,
        x: att.pos.x + f.x * m.hitbox.fwd,
        z: att.pos.z + f.z * m.hitbox.fwd,
        radius: m.areaRadius,
      });
    }
    if (ko && this.phase === 'fight') {
      this.events.push({ type: 'ko', loser: def.index, winner: att.index });
      this.endRound(att.index, 'ko');
    } else if (ko && this.phase === 'ko' && this.phaseFrame === 0 && this.roundWinner === def.index) {
      // Double KO on the same frame: undo the first award and call it a draw.
      this.wins[def.index]--;
      this.endRound(-1, 'ko');
    }
  }

  private matchNamedCombo(att: Fighter): string | null {
    if (!att.chainAllHit) return null;
    for (const c of att.def.namedCombos) {
      if (c.seq.length !== att.chain.length) continue;
      if (c.seq.every((id, i) => att.chain[i] === id)) {
        // Only on the final hit of the last move.
        const last = att.hitConsumed.every(Boolean);
        if (last) return c.name;
      }
    }
    return null;
  }

  private decideByHealth(): number {
    const [a, b] = this.fighters;
    const ra = a.health / a.def.maxHealth;
    const rb = b.health / b.def.maxHealth;
    if (Math.abs(ra - rb) < 1e-6) return -1;
    return ra > rb ? 0 : 1;
  }

  private endRound(winner: number, kind: 'ko' | 'timeup'): void {
    this.roundWinner = winner;
    if (winner >= 0) {
      this.wins[winner]++;
      const w = this.fighters[winner];
      this.perfect = w.health >= w.def.maxHealth;
    } else {
      this.wins[0]++;
      this.wins[1]++;
      this.perfect = false;
    }
    this.setPhase(kind);
  }

  private updateRoundEnd(): void {
    const [a, b] = this.fighters;
    const w = this.roundWinner;
    const loser = w >= 0 ? this.fighters[1 - w] : null;
    // Winner celebrates once the loser is down (or right away on time up).
    if (this.phaseFrame === (this.phase === 'ko' ? 95 : 40)) {
      if (w >= 0) {
        const winner = this.fighters[w];
        winner.setState('victory');
        if (loser && loser.state !== 'ko') loser.setState('defeat');
      } else {
        a.setState('defeat');
        b.setState('defeat');
      }
    }
    if (this.phaseFrame >= KO_FRAMES) {
      const decided = this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN;
      if (decided) {
        this.matchWinner = this.wins[0] === this.wins[1] ? -1 : this.wins[0] > this.wins[1] ? 0 : 1;
        this.setPhase('matchEnd');
      } else {
        this.round++;
        this.timerFrames = ROUND_TIME * FPS;
        this.hitStop = 0;
        this.placeFighters(false);
        this.setPhase('ready');
      }
    }
  }

  /** Push-box separation and arena boundary. */
  private resolveBodies(): void {
    const [a, b] = this.fighters;
    for (const f of this.fighters) this.clampToArena(f);
    if (a.isAirborne || b.isAirborne) return;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = a.def.pushRadius * a.def.scale + b.def.pushRadius * b.def.scale;
    if (d < min) {
      const nx = d > 1e-5 ? dx / d : 1;
      const nz = d > 1e-5 ? dz / d : 0;
      const overlap = min - d;
      // Heavier fighters get displaced less.
      const wa = b.def.weight / (a.def.weight + b.def.weight);
      a.pos.x -= nx * overlap * wa;
      a.pos.z -= nz * overlap * wa;
      b.pos.x += nx * overlap * (1 - wa);
      b.pos.z += nz * overlap * (1 - wa);
      // If one is pinned at the arena edge, push the other instead.
      for (const f of this.fighters) this.clampToArena(f);
      const d2 = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      if (d2 < min - 1e-3) {
        const fix = min - d2;
        const ra = Math.hypot(a.pos.x, a.pos.z);
        const rb = Math.hypot(b.pos.x, b.pos.z);
        const mover = ra < rb ? a : b;
        const sign = mover === a ? -1 : 1;
        mover.pos.x += sign * nx * fix;
        mover.pos.z += sign * nz * fix;
        this.clampToArena(mover);
      }
    }
  }

  private clampToArena(f: Fighter): void {
    const r = Math.hypot(f.pos.x, f.pos.z);
    const max = ARENA_RADIUS - f.def.pushRadius;
    if (r > max) {
      f.pos.x *= max / r;
      f.pos.z *= max / r;
      // Kill outward velocity so knockback doesn't "stick" against the edge.
      const nx = f.pos.x / max;
      const nz = f.pos.z / max;
      const vOut = f.vel.x * nx + f.vel.z * nz;
      if (vOut > 0) {
        f.vel.x -= nx * vOut;
        f.vel.z -= nz * vOut;
      }
    }
  }
}

const idleInput: FighterInput = { fwd: 0, lat: 0, block: false, pressed: new Set(), dodge: false };

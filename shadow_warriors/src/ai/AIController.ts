import { Rng } from '../core/math';
import type { Fighter } from '../combat/Fighter';
import type { Match } from '../combat/Match';
import type { Button, FighterInput, FighterState, MoveDef } from '../combat/types';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Profile {
  /** Perception delay in frames: the AI only "sees" the opponent this many frames late. */
  reaction: number;
  decision: [number, number];
  block: number;
  evade: number;
  combo: number;
  punish: number;
  aggression: number;
  spacing: number;
  /** Chance to pick a sub-optimal option / mistime a chain. */
  mistake: number;
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy: { reaction: 26, decision: [32, 56], block: 0.22, evade: 0.05, combo: 0.25, punish: 0.12, aggression: 0.32, spacing: 0.3, mistake: 0.3 },
  normal: { reaction: 16, decision: [16, 32], block: 0.55, evade: 0.18, combo: 0.62, punish: 0.45, aggression: 0.5, spacing: 0.6, mistake: 0.12 },
  hard: { reaction: 9, decision: [8, 18], block: 0.82, evade: 0.36, combo: 0.9, punish: 0.82, aggression: 0.6, spacing: 0.85, mistake: 0.03 },
};

type Mode = 'neutral' | 'approach' | 'retreat' | 'circle' | 'defend' | 'pressure';

interface Snapshot {
  state: FighterState;
  move: MoveDef | null;
  moveFrame: number;
  x: number;
  z: number;
  connected: boolean;
}

/**
 * Finite-state AI. It plays through the same FighterInput interface as a
 * human, reads the opponent through a delayed snapshot buffer (reaction
 * time), and adapts weights to what the player keeps doing.
 */
export class AIController {
  readonly difficulty: Difficulty;
  readonly profile: Profile;
  private rng: Rng;
  private history: Snapshot[] = [];
  mode: Mode = 'neutral';
  private modeTimer = 0;
  private decisionTimer = 20;
  private moveIntent = { fwd: 0, lat: 0 };
  private blockTimer = 0;
  private pending: { button: Button | 'dodge'; at: number }[] = [];
  private frame = 0;
  private lastReactedTo: MoveDef | null = null;
  private lastReactedFrame = -1;
  private recentMoves: string[] = [];
  private comboPlannedFor: MoveDef | null = null;
  /** Rolling read of the player's habits (0..1 each). */
  readonly read = { aggression: 0.3, blocking: 0.3, evasive: 0.1, distance: 0.5 };

  constructor(difficulty: Difficulty, seed = 1234) {
    this.difficulty = difficulty;
    this.profile = PROFILES[difficulty];
    this.rng = new Rng(seed);
  }

  reset(): void {
    this.history = [];
    this.mode = 'neutral';
    this.pending = [];
    this.blockTimer = 0;
    this.decisionTimer = 30;
    this.moveIntent = { fwd: 0, lat: 0 };
    this.recentMoves = [];
    this.comboPlannedFor = null;
  }

  update(match: Match, selfIdx: number): FighterInput {
    this.frame++;
    const self = match.fighters[selfIdx];
    const opp = match.fighters[1 - selfIdx];
    const input: FighterInput = { fwd: 0, lat: 0, block: false, pressed: new Set(), dodge: false };

    this.history.push({
      state: opp.state,
      move: opp.move,
      moveFrame: opp.moveFrame,
      x: opp.pos.x,
      z: opp.pos.z,
      connected: opp.moveConnected,
    });
    if (this.history.length > 64) this.history.shift();
    if (match.phase !== 'fight') {
      this.pending = [];
      this.blockTimer = 0;
      return input;
    }
    const seen = this.history[Math.max(0, this.history.length - 1 - this.profile.reaction)];
    this.observePlayer(opp);

    const dist = Math.hypot(seen.x - self.pos.x, seen.z - self.pos.z);
    const hpRatio = self.health / self.def.maxHealth;
    const oppHp = opp.health / opp.def.maxHealth;
    const cautious = hpRatio < 0.3 && oppHp > hpRatio + 0.1;

    // 1) Execute queued presses (combo timing, punishes).
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (this.frame >= p.at) {
        if (p.button === 'dodge') input.dodge = true;
        else input.pressed.add(p.button);
        this.pending.splice(i, 1);
      }
    }

    // 2) Combo continuation when our move connected.
    if (self.state === 'attack' && self.move && self.moveConnected && this.comboPlannedFor !== self.move) {
      this.comboPlannedFor = self.move;
      this.planChain(self);
    }

    // 3) Defensive reaction to a perceived attack.
    const threat = seen.state === 'attack' && seen.move && seen.moveFrame < seen.move.startup + seen.move.active;
    if (threat && seen.move && (seen.move !== this.lastReactedTo || this.frame - this.lastReactedFrame > 40)) {
      const reach = this.moveReach(opp, seen.move);
      if (dist < reach + 0.6) {
        this.lastReactedTo = seen.move;
        this.lastReactedFrame = this.frame;
        const canDefend = self.isActionable() || self.state === 'blockstun';
        if (canDefend) {
          const blockP = Math.min(0.97, this.profile.block * (cautious ? 1.2 : 1) * (0.85 + this.read.aggression * 0.3));
          const evadeP = this.profile.evade * (seen.move.sfx === 'heavy' || seen.move.sfx === 'special' ? 1.6 : 0.8);
          const r = this.rng.next();
          if (r < evadeP) {
            this.pending.push({ button: 'dodge', at: this.frame });
            this.moveIntent = { fwd: 0, lat: this.rng.chance(0.5) ? 1 : -1 };
            this.blockTimer = 0;
          } else if (r < evadeP + blockP) {
            const remaining = seen.move.startup + seen.move.active - seen.moveFrame;
            this.blockTimer = remaining + 8 + Math.floor(this.rng.range(0, 10));
          }
        }
      }
    }

    // 4) Punish: opponent recovering from a blocked or whiffed move close to us.
    if (
      self.isActionable() &&
      opp.state === 'attack' &&
      opp.move &&
      opp.moveFrame >= opp.move.startup + opp.move.active &&
      (!opp.moveConnected || opp.moveBlocked) &&
      this.pending.length === 0 &&
      seen.state === 'attack'
    ) {
      const recoveryLeft = opp.move.startup + opp.move.active + opp.move.recovery - opp.moveFrame;
      const jab = self.def.moves[self.def.normals.lp];
      if (recoveryLeft > jab.startup + 1 && dist < this.moveReach(self, jab) + 0.2 && this.rng.chance(this.profile.punish * 0.25)) {
        const pick = this.chooseMove(self, dist, recoveryLeft);
        if (pick) {
          this.pending.push({ button: pick, at: this.frame + 1 });
          this.blockTimer = 0;
        }
      }
    }

    // 5) Neutral decisions.
    if (--this.decisionTimer <= 0 && self.isActionable() && this.blockTimer <= 0) {
      this.decide(self, opp, dist, cautious);
      const [a, b] = this.profile.decision;
      this.decisionTimer = Math.round(this.rng.range(a, b));
    }
    if (--this.modeTimer <= 0 && this.mode !== 'neutral') this.mode = 'neutral';

    // 6) Movement / block output.
    if (this.blockTimer > 0) {
      this.blockTimer--;
      input.block = true;
    } else {
      switch (this.mode) {
        case 'approach':
          input.fwd = 1;
          input.lat = this.moveIntent.lat * 0.3;
          if (dist < this.preferredRange(self) * 0.9) this.mode = 'neutral';
          break;
        case 'retreat':
          input.fwd = -1;
          input.lat = this.moveIntent.lat * 0.4;
          break;
        case 'circle':
          input.lat = this.moveIntent.lat;
          input.fwd = this.moveIntent.fwd * 0.4;
          break;
        case 'pressure':
          input.fwd = dist > 1.2 ? 1 : 0;
          break;
        case 'defend':
          input.block = true;
          break;
        case 'neutral': {
          // Footsies: hover around preferred range with small drift.
          const pref = this.preferredRange(self) * (cautious ? 1.3 : 1);
          const err = dist - pref;
          if (Math.abs(err) > 0.35 * (1.2 - this.profile.spacing)) input.fwd = err > 0 ? 0.7 : -0.6;
          input.lat = this.moveIntent.lat * 0.25;
          break;
        }
      }
    }
    if (input.dodge) {
      if (this.dashForward) {
        input.fwd = 1;
        input.lat = 0;
        this.dashForward = false;
      } else {
        input.fwd = 0;
        input.lat = this.moveIntent.lat || 1;
      }
    }
    return input;
  }

  private observePlayer(opp: Fighter): void {
    const k = 0.004;
    const attacking = opp.state === 'attack' && opp.moveFrame === 1 ? 1 : 0;
    this.read.aggression += (attacking - this.read.aggression) * (attacking ? 0.08 : 0.003);
    this.read.blocking += ((opp.isBlocking() ? 1 : 0) - this.read.blocking) * k;
    const evasive = opp.state === 'sidestep' || opp.state === 'backdash' ? 1 : 0;
    this.read.evasive += (evasive - this.read.evasive) * k;
  }

  private preferredRange(self: Fighter): number {
    return (self.def.id === 'ironfang' ? 1.45 : 1.3) + (this.read.aggression > 0.55 ? 0.35 : 0);
  }

  private moveReach(f: Fighter, m: MoveDef): number {
    if (m.areaRadius) return m.hitbox.fwd * f.def.scale + m.areaRadius + m.lunge * 0.7;
    const fwd = Math.max(m.hitbox.fwd, m.hitboxEnd?.fwd ?? 0);
    return (fwd + m.hitbox.r) * f.def.scale + m.lunge + 0.25;
  }

  private decide(self: Fighter, opp: Fighter, dist: number, cautious: boolean): void {
    const p = this.profile;
    const pref = this.preferredRange(self);
    this.moveIntent.lat = this.rng.chance(0.5) ? 1 : -1;

    // Opponent is down / getting up: reposition, don't mash into invulnerability.
    if (opp.state === 'down' || opp.state === 'getup' || opp.state === 'launch') {
      this.mode = dist > pref + 0.4 ? 'approach' : 'neutral';
      this.modeTimer = 30;
      return;
    }
    // Opponent stunned / guard broken: free attack.
    if (opp.state === 'stagger' || opp.state === 'guardbreak') {
      const b = this.chooseMove(self, dist, 30);
      if (b && !this.rng.chance(p.mistake)) {
        this.queuePress(b, 0);
        return;
      }
    }

    let aggression = p.aggression;
    if (cautious) aggression *= 0.55;
    if (opp.health / opp.def.maxHealth < 0.25) aggression *= 1.3;
    // Adapt: turtling players get pressured with heavy attacks, mashers get blocked.
    if (this.read.blocking > 0.35) aggression *= 1.15;
    if (this.read.aggression > 0.5) aggression *= 0.85;

    const special = self.def.moves[self.def.normals.special];
    if (self.meter >= 100 && dist < this.moveReach(self, special) - 0.2 && this.rng.chance(0.35 + (opp.health < special.damage * 1.1 ? 0.4 : 0))) {
      if (opp.isActionable() && opp.state === 'block' && this.difficulty !== 'easy' && this.rng.chance(0.6)) {
        // Specials into a guard are wasteful; wait.
      } else {
        this.queuePress('special', 0);
        return;
      }
    }

    const inRange = dist < this.moveReach(self, self.def.moves[self.def.normals.lp]) + 0.05;
    const r = this.rng.next();
    if (dist > 3.8) {
      if (this.rng.chance(0.3 + p.aggression * 0.3)) {
        this.pending.push({ button: 'dodge', at: this.frame });
        this.moveIntent.lat = 0;
        this.mode = 'neutral';
        this.dashForward = true;
      } else {
        this.mode = 'approach';
        this.modeTimer = 40;
      }
      return;
    }
    if (inRange || dist < pref + 0.25) {
      if (r < aggression) {
        const b = this.chooseMove(self, dist, 0);
        if (b) {
          this.queuePress(b, Math.floor(this.rng.range(0, 4)));
          return;
        }
      }
      if (r < aggression + 0.15 * (1 + this.read.aggression)) {
        // Bait / guard.
        this.mode = 'defend';
        this.modeTimer = Math.round(this.rng.range(14, 34));
        return;
      }
      if (this.rng.chance(p.evade * 0.6 + this.read.blocking * 0.2)) {
        // Sidestep to set up a back/side hit.
        this.pending.push({ button: 'dodge', at: this.frame });
        return;
      }
      this.mode = this.rng.chance(cautious ? 0.6 : 0.35) ? 'retreat' : 'circle';
      this.modeTimer = Math.round(this.rng.range(14, 30));
      return;
    }
    // Mid range.
    if (r < aggression * 0.9 + this.read.evasive * 0.2) {
      this.mode = 'approach';
      this.modeTimer = 36;
    } else if (r < 0.85) {
      this.mode = 'circle';
      this.modeTimer = Math.round(this.rng.range(18, 40));
    } else {
      this.mode = 'neutral';
    }
  }

  /** Flag consumed by `update` when the AI wants a forward dash instead of a sidestep. */
  private dashForward = false;

  private queuePress(b: Button, delay: number): void {
    this.pending.push({ button: b, at: this.frame + delay });
  }

  /** Choose a normal attack that reaches, weighting variety and the player's habits. */
  private chooseMove(self: Fighter, dist: number, window: number): Button | null {
    const opts: { b: Button; w: number }[] = [];
    for (const b of ['lp', 'hp', 'lk', 'hk'] as Button[]) {
      const m = self.def.moves[self.def.normals[b]];
      const reach = this.moveReach(self, m);
      if (dist > reach) continue;
      if (window > 0 && m.startup > window) continue;
      let w = 1;
      // Fast moves when close or punishing; heavy moves vs blockers.
      w *= window > 0 ? 30 / (m.startup + 5) : 1;
      if (this.read.blocking > 0.3 && (m.guardDamage >= 20 || m.effect === 'knockdown')) w *= 1.8;
      if (dist < 1.0 && m.startup <= 8) w *= 1.5;
      // Variety: penalise recently used moves.
      const used = this.recentMoves.filter((id) => id === m.id).length;
      w *= Math.pow(0.4, used);
      opts.push({ b, w });
    }
    if (!opts.length) return null;
    if (this.rng.chance(this.profile.mistake)) return this.rng.pick(opts).b;
    let total = 0;
    for (const o of opts) total += o.w;
    let r = this.rng.next() * total;
    for (const o of opts) {
      r -= o.w;
      if (r <= 0) {
        this.remember(self.def.normals[o.b]);
        return o.b;
      }
    }
    return opts[opts.length - 1].b;
  }

  private remember(id: string): void {
    this.recentMoves.push(id);
    if (this.recentMoves.length > 5) this.recentMoves.shift();
  }

  /** On hit/block, decide whether and how to continue the chain. */
  private planChain(self: Fighter): void {
    const m = self.move!;
    const chains = self.def.chains[m.id];
    if (!chains) return;
    const onHit = !self.moveBlocked;
    if (!this.rng.chance(onHit ? this.profile.combo : this.profile.combo * 0.35)) return;
    const opts = Object.entries(chains) as [Button, string][];
    // Prefer finishing a named combo, use special only on hit with full meter.
    let best: Button | null = null;
    let bestScore = -1;
    for (const [b, id] of opts) {
      const nm = self.def.moves[id];
      if (nm.sfx === 'special' && (self.meter < 100 || !onHit)) continue;
      let score = this.rng.next();
      const seq = [...self.chain, id];
      for (const c of self.def.namedCombos) {
        if (c.seq.slice(0, seq.length).every((s, i) => s === seq[i])) score += 1;
      }
      if (nm.sfx === 'special') score += 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (!best) return;
    const [c0, c1] = m.cancelWindow;
    let at = Math.max(c0, self.moveFrame + 1) + Math.floor(this.rng.range(0, 4));
    if (this.rng.chance(this.profile.mistake)) at = c1 + 6; // dropped combo
    this.pending.push({ button: best, at: this.frame + (at - self.moveFrame) });
    this.remember(self.def.chains[m.id]![best]!);
  }
}

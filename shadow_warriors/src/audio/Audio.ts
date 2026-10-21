import { Rng } from '../core/math';
import type { SettingsData } from '../core/Settings';

/*
 * Procedural sound design with the Web Audio API. The project ships no
 * licensed sample library, so every sound here is synthesised at runtime
 * (filtered noise, pitched oscillators, waveshaping, convolution reverb).
 * These are placeholder-quality effects, not recorded foley. Each call
 * randomises pitch/filtering and rotates variants to avoid repetition.
 */

export type HitSize = 'light' | 'medium' | 'heavy' | 'special';

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private rng = new Rng(77);
  private lastVariant: Record<string, number> = {};
  private ambienceNodes: AudioNode[] = [];
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private settings: SettingsData;
  private intensity = 0;

  constructor(settings: SettingsData) {
    this.settings = settings;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.music.connect(this.master);
    // Temple reverb: generated exponentially-decaying stereo noise IR.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
    this.startAmbience();
  }

  apply(s: SettingsData): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambienceVolume * 0.7, t, 0.05);
    this.music.gain.setTargetAtTime(s.musicVolume * 0.6, t, 0.05);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private variant(key: string, n: number): number {
    let v = Math.floor(this.rng.next() * n);
    if (v === this.lastVariant[key]) v = (v + 1) % n;
    this.lastVariant[key] = v;
    return v;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(opts: {
    t: number;
    dur: number;
    gain: number;
    type: BiquadFilterType;
    freq: number;
    freqEnd?: number;
    q?: number;
    attack?: number;
    out?: AudioNode;
    rate?: number;
    send?: number;
  }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.setValueAtTime(opts.freq, opts.t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, opts.t + opts.dur);
    f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g, opts.t, opts.gain, opts.attack ?? 0.003, opts.dur);
    src.connect(f).connect(g).connect(opts.out ?? this.sfx);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(opts.t, this.rng.range(0, 1.5));
    src.stop(opts.t + opts.dur + 0.05);
  }

  private tone(opts: {
    t: number;
    type: OscillatorType;
    freq: number;
    freqEnd?: number;
    dur: number;
    gain: number;
    attack?: number;
    out?: AudioNode;
    send?: number;
    detune?: number;
  }): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.freq, opts.t);
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, opts.t + opts.dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    this.env(g, opts.t, opts.gain, opts.attack ?? 0.004, opts.dur);
    o.connect(g).connect(opts.out ?? this.sfx);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(opts.t);
    o.stop(opts.t + opts.dur + (opts.attack ?? 0.004) + 0.05);
  }

  private get now(): number {
    return this.ctx!.currentTime;
  }

  /* ---------------------------------------------------------------- SFX */

  whoosh(size: HitSize): void {
    if (!this.ctx) return;
    const t = this.now;
    const p = this.rng.range(0.85, 1.15);
    const heavy = size === 'heavy' || size === 'special';
    this.noiseBurst({ t, dur: heavy ? 0.28 : 0.16, gain: heavy ? 0.22 : 0.13, type: 'bandpass', freq: 500 * p, freqEnd: (heavy ? 1800 : 3200) * p, q: 1.6, attack: 0.04 });
  }

  hit(size: HitSize, counter = false): void {
    if (!this.ctx) return;
    const t = this.now;
    const v = this.variant('hit' + size, 3);
    const p = this.rng.range(0.9, 1.1) * (1 + v * 0.06);
    const lvl = size === 'light' ? 0.5 : size === 'medium' ? 0.7 : 0.95;
    // Body: pitched thump.
    this.tone({ t, type: 'sine', freq: (size === 'light' ? 190 : 140) * p, freqEnd: 45, dur: size === 'light' ? 0.12 : 0.22, gain: lvl * 0.9 });
    // Slap transient.
    this.noiseBurst({ t, dur: 0.05, gain: lvl * 0.7, type: 'highpass', freq: 1800 * p, attack: 0.001 });
    this.noiseBurst({ t, dur: size === 'light' ? 0.08 : 0.16, gain: lvl * 0.5, type: 'lowpass', freq: 900 * p, freqEnd: 200, attack: 0.002, send: 0.3 });
    if (size === 'heavy' || size === 'special') {
      this.tone({ t, type: 'triangle', freq: 70 * p, freqEnd: 30, dur: 0.45, gain: 0.8, send: 0.4 });
      this.noiseBurst({ t: t + 0.01, dur: 0.4, gain: 0.25, type: 'lowpass', freq: 400, freqEnd: 80, send: 0.6 });
    }
    if (counter) this.tone({ t, type: 'square', freq: 1320, freqEnd: 900, dur: 0.12, gain: 0.08, send: 0.4 });
  }

  block(metal: boolean): void {
    if (!this.ctx) return;
    const t = this.now;
    const p = this.rng.range(0.92, 1.08);
    this.noiseBurst({ t, dur: 0.07, gain: 0.45, type: 'bandpass', freq: 2400 * p, q: 2, attack: 0.001 });
    this.tone({ t, type: 'sine', freq: 160 * p, freqEnd: 70, dur: 0.1, gain: 0.5 });
    if (metal) {
      for (const r of [1, 2.76, 5.4]) this.tone({ t, type: 'triangle', freq: 520 * r * p, dur: 0.35 / r, gain: 0.12 / r, send: 0.5 });
    }
  }

  footstep(heavy: boolean): void {
    if (!this.ctx) return;
    const t = this.now;
    this.noiseBurst({ t, dur: heavy ? 0.09 : 0.05, gain: heavy ? 0.12 : 0.06, type: 'lowpass', freq: heavy ? 500 : 900, attack: 0.002, rate: this.rng.range(0.8, 1.2) });
  }

  bodyFall(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ t, type: 'sine', freq: 90, freqEnd: 35, dur: 0.35, gain: 0.9 });
    this.noiseBurst({ t, dur: 0.5, gain: 0.35, type: 'lowpass', freq: 600, freqEnd: 90, send: 0.5 });
  }

  dodge(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.noiseBurst({ t, dur: 0.18, gain: 0.08, type: 'bandpass', freq: 900, freqEnd: 2600, q: 1.2, attack: 0.03 });
  }

  special(character: 'phantom' | 'ironfang'): void {
    if (!this.ctx) return;
    const t = this.now;
    this.noiseBurst({ t, dur: 0.7, gain: 0.25, type: 'bandpass', freq: 300, freqEnd: 4000, q: 2, attack: 0.25, send: 0.6 });
    if (character === 'phantom') {
      for (const [f, d] of [
        [440, 0],
        [554, 7],
        [659, -6],
        [880, 4],
      ])
        this.tone({ t: t + 0.05, type: 'sawtooth', freq: f, freqEnd: f * 1.5, dur: 0.6, gain: 0.05, attack: 0.2, send: 0.8, detune: d });
    } else {
      for (const [f, d] of [
        [55, 0],
        [82, 8],
        [110, -6],
      ])
        this.tone({ t, type: 'sawtooth', freq: f, freqEnd: f * 0.7, dur: 0.9, gain: 0.12, attack: 0.15, send: 0.5, detune: d });
    }
  }

  shockwave(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ t, type: 'sine', freq: 60, freqEnd: 25, dur: 1.0, gain: 1.0, send: 0.6 });
    this.noiseBurst({ t, dur: 1.1, gain: 0.5, type: 'lowpass', freq: 1200, freqEnd: 60, send: 0.8 });
  }

  menuMove(): void {
    if (!this.ctx) return;
    this.tone({ t: this.now, type: 'sine', freq: 880, freqEnd: 760, dur: 0.06, gain: 0.08 });
  }

  menuSelect(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ t, type: 'triangle', freq: 660, dur: 0.12, gain: 0.12, send: 0.3 });
    this.tone({ t: t + 0.07, type: 'triangle', freq: 990, dur: 0.2, gain: 0.1, send: 0.4 });
  }

  menuBack(): void {
    if (!this.ctx) return;
    this.tone({ t: this.now, type: 'triangle', freq: 520, freqEnd: 330, dur: 0.12, gain: 0.1 });
  }

  /** Temple gong for "ROUND n". */
  gong(): void {
    if (!this.ctx) return;
    const t = this.now;
    for (const [r, g] of [
      [1, 0.4],
      [1.48, 0.25],
      [2.1, 0.18],
      [2.92, 0.12],
      [4.1, 0.06],
    ])
      this.tone({ t, type: 'sine', freq: 98 * r, dur: 3.2 / Math.sqrt(r), gain: g, attack: 0.01, send: 0.9 });
    this.noiseBurst({ t, dur: 0.2, gain: 0.2, type: 'lowpass', freq: 800, send: 0.6 });
  }

  fight(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ t, type: 'sine', freq: 70, freqEnd: 40, dur: 0.6, gain: 0.9, send: 0.5 });
    this.noiseBurst({ t, dur: 0.6, gain: 0.35, type: 'bandpass', freq: 3000, freqEnd: 300, q: 0.7, send: 0.7 });
  }

  ko(): void {
    if (!this.ctx) return;
    const t = this.now;
    this.tone({ t, type: 'sine', freq: 50, freqEnd: 22, dur: 2.0, gain: 1.0, send: 0.9 });
    this.noiseBurst({ t, dur: 1.6, gain: 0.4, type: 'lowpass', freq: 900, freqEnd: 50, send: 1 });
    this.gong();
  }

  /* ----------------------------------------------------------- Ambience */

  private startAmbience(): void {
    const ctx = this.ctx!;
    // Wind: looping noise through a slowly modulated lowpass.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    const wg = ctx.createGain();
    wg.gain.value = 0.18;
    src.connect(lp).connect(wg).connect(this.amb);
    src.start();
    lfo.start();
    // Low temple drone (two detuned sines + fifth).
    for (const [f, g] of [
      [55, 0.08],
      [55.4, 0.06],
      [82.4, 0.03],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.amb);
      o.start();
      this.ambienceNodes.push(o);
    }
    this.ambienceNodes.push(src, lfo);
    // Fire crackle + distant chimes, scheduled sparsely.
    const crackle = () => {
      if (!this.ctx) return;
      const t = this.now;
      const n = 1 + Math.floor(this.rng.next() * 3);
      for (let i = 0; i < n; i++)
        this.noiseBurst({ t: t + i * this.rng.range(0.02, 0.08), dur: 0.02, gain: this.rng.range(0.03, 0.07), type: 'highpass', freq: 2500, out: this.amb });
      if (this.rng.chance(0.06)) {
        const base = this.rng.pick([523, 587, 659, 784]);
        this.tone({ t, type: 'sine', freq: base * 2, dur: 2.5, gain: 0.025, attack: 0.01, out: this.amb, send: 1 });
      }
      window.setTimeout(crackle, this.rng.range(120, 600));
    };
    crackle();
  }

  /* -------------------------------------------------------------- Music */

  /** Sparse taiko-style pulse during fights; `intensity` 0..1 adds layers. */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextBeat = this.now + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setIntensity(v: number): void {
    this.intensity = v;
  }

  private scheduleMusic(): void {
    if (!this.ctx) return;
    const spb = 60 / 92 / 2; // eighth notes at 92 bpm
    while (this.nextBeat < this.now + 0.2) {
      const b = this.beat % 16;
      const t = this.nextBeat;
      if (b === 0 || b === 6 || b === 10) this.drum(t, 0.55, 62);
      if (b === 8) this.drum(t, 0.4, 90);
      if (this.intensity > 0.4 && (b === 3 || b === 13)) this.drum(t, 0.25, 140);
      if (this.intensity > 0.7 && b % 2 === 1) this.noiseBurst({ t, dur: 0.03, gain: 0.04, type: 'highpass', freq: 6000, out: this.music });
      if (b === 0 && this.beat % 64 === 0) {
        for (const f of [110, 164.8, 220]) this.tone({ t, type: 'sawtooth', freq: f, dur: 5.5, gain: 0.018, attack: 1.5, out: this.music, send: 0.6 });
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private drum(t: number, gain: number, freq: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.25);
    const g = ctx.createGain();
    this.env(g, t, gain, 0.003, 0.35);
    o.connect(g).connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.25;
    g.connect(s).connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.45);
  }
}

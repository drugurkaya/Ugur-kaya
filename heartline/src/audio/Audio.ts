import type { SettingsData } from '../core/Settings';

/*
 * Procedural sound with the Web Audio API. The project ships no recorded samples, so every
 * sound here is synthesised at runtime: room tones, the phone buzzing on wood, ICU monitor
 * beeps locked to the simulated heart rate, alarms, heartbeat, footsteps, car engine.
 * These are stylised approximations, not recorded foley.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noise!: AudioBuffer;
  private ambNodes: AudioNode[] = [];
  private ambId = '';
  private vibTimer: number | null = null;
  hr = 0;
  alarm = false;
  monitorOn = false;
  stress = 0;

  constructor(private settings: SettingsData) {}

  /** Must be called from a user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = this.ctx.createGain();
    this.ambBus.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      // pinkish noise
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
      d[i] = b * 3 + (Math.random() * 2 - 1) * 0.15;
    }
    this.applyVolumes();
    this.startLoops();
    if (this.ambId) {
      const id = this.ambId;
      this.ambId = '';
      this.setAmbience(id);
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.master;
    this.sfxBus.gain.value = this.settings.sfx;
    this.ambBus.gain.value = this.settings.ambience * 0.6;
  }

  private now() {
    return this.ctx!.currentTime;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, bus: GainNode = this.sfxBus, attack = 0.005) {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, q: number, vol: number, when = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx) return;
    const t0 = this.now() + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  sfx(name: string) {
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        this.tone(1400, 0.05, 'triangle', 0.05);
        break;
      case 'select':
        this.tone(660, 0.08, 'sine', 0.08);
        this.tone(990, 0.12, 'sine', 0.06, 0.05);
        break;
      case 'notify':
        this.tone(880, 0.15, 'sine', 0.1);
        this.tone(1320, 0.25, 'sine', 0.08, 0.12);
        break;
      case 'tension':
        this.tone(55, 3.5, 'sawtooth', 0.06, 0, this.sfxBus, 1.2);
        this.tone(58.3, 3.5, 'sawtooth', 0.05, 0, this.sfxBus, 1.2);
        this.tone(220, 2.5, 'sine', 0.03, 0.4, this.sfxBus, 1.0);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone(988, 0.16, 'square', 0.06, i * 0.22);
          this.tone(784, 0.16, 'square', 0.06, i * 0.22 + 0.11);
        }
        break;
      case 'horn':
        this.tone(330, 0.6, 'sawtooth', 0.12);
        this.tone(415, 0.6, 'sawtooth', 0.1);
        this.noiseBurst(0.5, 800, 0.6, 0.15, 0.1);
        break;
      case 'vibrate':
        this.buzz();
        break;
      case 'step':
        this.noiseBurst(0.07, 500 + Math.random() * 200, 1.2, 0.08);
        break;
      case 'water':
        this.noiseBurst(1.6, 2500, 0.4, 0.12, 0, 'highpass');
        break;
      case 'door':
        this.noiseBurst(0.25, 200, 0.8, 0.2);
        this.tone(90, 0.3, 'sine', 0.15, 0.05);
        break;
      case 'defib':
        this.tone(1800, 0.9, 'sine', 0.05, 0, this.sfxBus, 0.8);
        this.noiseBurst(0.12, 300, 0.5, 0.35, 1.0);
        break;
      case 'stinger':
        this.tone(110, 2.5, 'triangle', 0.08, 0, this.sfxBus, 0.02);
        this.tone(116.5, 2.5, 'triangle', 0.06, 0, this.sfxBus, 0.02);
        break;
      case 'end':
        [261.6, 329.6, 392, 523.3].forEach((f, i) => this.tone(f, 2.5, 'sine', 0.06, i * 0.35, this.sfxBus, 0.2));
        break;
    }
  }

  /** The phone buzzing against a wooden nightstand. */
  private buzz() {
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) {
      const t0 = this.now() + i * 0.45;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 160;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 23;
      const lg = this.ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.setValueAtTime(0.12, t0 + 0.3);
      g.gain.linearRampToValueAtTime(0, t0 + 0.33);
      o.connect(f).connect(g).connect(this.sfxBus);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + 0.4);
      lfo.stop(t0 + 0.4);
    }
  }

  setVibrating(on: boolean) {
    if (this.vibTimer !== null) {
      clearInterval(this.vibTimer);
      this.vibTimer = null;
    }
    if (on) {
      this.sfx('vibrate');
      this.vibTimer = window.setInterval(() => this.sfx('vibrate'), 1400);
    }
  }

  private startLoops() {
    // ICU monitor beep locked to heart rate; an alarm tone when pressure is low.
    const beat = () => {
      const hr = this.monitorOn && this.hr > 0 ? this.hr : 0;
      if (hr > 0) this.tone(this.alarm ? 740 : 988, 0.08, 'sine', 0.045);
      window.setTimeout(beat, hr > 0 ? 60000 / hr : 500);
    };
    beat();
    let alarmTick = 0;
    window.setInterval(() => {
      alarmTick++;
      if (this.monitorOn && this.alarm && alarmTick % 4 === 0) this.sfx('alarm');
    }, 1000);
    // Heartbeat in the protagonist's ears when stressed.
    const heart = () => {
      const s = this.stress;
      if (s > 55 && this.ctx) {
        const vol = Math.min(0.25, (s - 55) / 120);
        this.tone(52, 0.18, 'sine', vol, 0, this.sfxBus, 0.01);
        this.tone(46, 0.2, 'sine', vol * 0.7, 0.22, this.sfxBus, 0.01);
      }
      const bpm = 60 + s * 0.6;
      window.setTimeout(heart, 60000 / bpm);
    };
    heart();
  }

  setAmbience(id: string) {
    if (id === this.ambId) return;
    this.ambId = id;
    if (!this.ctx) return;
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambNodes = [];
    const layer = (freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass') => {
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx!.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = this.ctx!.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.ambBus);
      src.start(0, Math.random() * 1.5);
      this.ambNodes.push(src, f, g);
    };
    const hum = (freq: number, vol: number, type: OscillatorType = 'sine') => {
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = this.ctx!.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.ambBus);
      o.start();
      this.ambNodes.push(o, g);
    };
    switch (id) {
      case 'home':
        layer(180, 0.5, 0.18);
        layer(900, 0.3, 0.015, 'bandpass');
        break;
      case 'car':
        layer(120, 0.7, 0.5);
        layer(600, 0.4, 0.06, 'bandpass');
        hum(42, 0.08, 'sawtooth');
        break;
      case 'hospital':
        layer(250, 0.4, 0.22);
        hum(100, 0.012);
        hum(120, 0.01);
        break;
      case 'or':
        layer(320, 0.3, 0.26);
        hum(60, 0.02, 'triangle');
        break;
      case 'office':
        layer(400, 0.4, 0.08);
        break;
      case 'menu':
        hum(110, 0.025);
        hum(164.8, 0.018);
        hum(220, 0.012);
        break;
    }
  }
}

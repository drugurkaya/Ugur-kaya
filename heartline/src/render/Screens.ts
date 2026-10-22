import * as THREE from 'three';
import type { PatientSnapshot } from '../state/types';

/** Canvas-backed screens inside the 3D world: phone, ICU monitor, car display, wall clock. */

abstract class CanvasScreen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private acc = 0;
  constructor(w: number, h: number, private interval = 1 / 15) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  tick(dt: number) {
    this.acc += dt;
    if (this.acc < this.interval) return;
    this.draw(this.acc);
    this.acc = 0;
    this.texture.needsUpdate = true;
  }
  protected abstract draw(dt: number): void;
}

export class PhoneScreen extends CanvasScreen {
  time = '05:12';
  caller = '';
  mode: 'off' | 'ringing' | 'call' | 'lock' = 'off';
  private t = 0;
  constructor() {
    super(128, 256, 1 / 10);
  }
  protected draw(dt: number) {
    this.t += dt;
    const c = this.ctx;
    const W = 128;
    const H = 256;
    if (this.mode === 'off') {
      c.fillStyle = '#050505';
      c.fillRect(0, 0, W, H);
      return;
    }
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f2a44');
    g.addColorStop(1, '#2a1238');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = '600 34px system-ui, sans-serif';
    c.fillText(this.time, W / 2, 62);
    if (this.mode === 'ringing' || this.mode === 'call') {
      c.font = '500 12px system-ui, sans-serif';
      c.fillStyle = '#cfe2ff';
      c.fillText(this.caller, W / 2, 112);
      const pulse = this.mode === 'ringing' ? 0.5 + 0.5 * Math.sin(this.t * 8) : 1;
      c.fillStyle = `rgba(52,199,89,${0.5 + 0.5 * pulse})`;
      c.beginPath();
      c.arc(W / 2 + 30, 205, 14, 0, Math.PI * 2);
      c.fill();
      if (this.mode === 'ringing') {
        c.fillStyle = 'rgba(255,59,48,0.9)';
        c.beginPath();
        c.arc(W / 2 - 30, 205, 14, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

/** Bedside monitor with an animated ECG, arterial line, CVP and numbers from the patient model. */
export class MonitorScreen extends CanvasScreen {
  patient: PatientSnapshot | null = null;
  private x = 0;
  private phaseEcg = 0;
  private phaseArt = 0;
  private last: { ecg: number; art: number; cvp: number } = { ecg: 120, art: 200, cvp: 250 };
  constructor() {
    super(512, 320, 1 / 30);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, 512, 320);
  }
  protected draw(dt: number) {
    const c = this.ctx;
    const p = this.patient;
    const hr = p ? (p.arrested ? 0 : p.hr) : 72;
    const map = p ? p.map : 80;
    const cvp = p ? p.cvp : 8;
    const waveW = 360;
    const speed = 120; // px per second
    const steps = Math.max(1, Math.round(dt * speed));
    for (let i = 0; i < steps; i++) {
      this.x = (this.x + 1) % waveW;
      const x = this.x;
      c.fillStyle = '#000';
      c.fillRect(x, 0, 6, 320);
      const beatDt = 1 / speed;
      const vf = p?.arrested;
      this.phaseEcg += beatDt * (vf ? 5 : hr / 60);
      this.phaseArt += beatDt * (vf ? 0 : hr / 60);
      const ph = this.phaseEcg % 1;
      let ecg = 0;
      if (vf) ecg = Math.sin(this.phaseEcg * 6.28) * 18 + Math.sin(this.phaseEcg * 17) * 8;
      else {
        if (ph < 0.08) ecg = Math.sin((ph / 0.08) * Math.PI) * 6; // P
        else if (ph > 0.16 && ph < 0.19) ecg = -6;
        else if (ph >= 0.19 && ph < 0.22) ecg = 52; // R
        else if (ph >= 0.22 && ph < 0.25) ecg = -14;
        else if (ph > 0.38 && ph < 0.52) ecg = Math.sin(((ph - 0.38) / 0.14) * Math.PI) * 11; // T
      }
      const pa = this.phaseArt % 1;
      const sys = map + 22;
      const dia = map - 14;
      const art = dia + (sys - dia) * (pa < 0.15 ? Math.sin((pa / 0.15) * Math.PI * 0.5) : Math.max(0, 1 - (pa - 0.15) * 1.6) * 0.9 + (pa > 0.3 && pa < 0.38 ? 0.08 : 0));
      const ecgY = 80 - ecg;
      const artY = 210 - (art - 20) * 0.75;
      const cvpY = 290 - cvp * 1.5 - (pa < 0.3 ? 3 : 0);
      const line = (y0: number, y1: number, col: string) => {
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 1, y0);
        c.lineTo(x, y1);
        c.stroke();
      };
      if (x > 0) {
        line(this.last.ecg, ecgY, '#3cff6a');
        line(this.last.art, artY, '#ff4d4d');
        line(this.last.cvp, cvpY, '#4dc3ff');
      }
      this.last = { ecg: ecgY, art: artY, cvp: cvpY };
    }
    // numbers panel
    c.fillStyle = '#000';
    c.fillRect(waveW + 6, 0, 512 - waveW - 6, 320);
    c.textAlign = 'right';
    const alarm = map < 55 && Math.floor(performance.now() / 400) % 2 === 0;
    c.fillStyle = '#3cff6a';
    c.font = '600 18px monospace';
    c.fillText('HR', 420, 30);
    c.font = '700 52px monospace';
    c.fillText(String(hr), 506, 80);
    c.fillStyle = alarm ? '#fff' : '#ff4d4d';
    if (alarm) {
      c.fillStyle = '#b00000';
      c.fillRect(waveW + 8, 104, 140, 92);
      c.fillStyle = '#fff';
    }
    c.font = '600 18px monospace';
    c.fillText('ABP', 420, 124);
    c.font = '700 26px monospace';
    c.fillText(`${map + 22}/${map - 14}`, 506, 156);
    c.font = '700 34px monospace';
    c.fillText(`(${map})`, 506, 192);
    c.fillStyle = '#4dc3ff';
    c.font = '600 18px monospace';
    c.fillText('CVP', 420, 240);
    c.font = '700 40px monospace';
    c.fillText(String(cvp), 506, 285);
  }
}

export class CarDisplay extends CanvasScreen {
  time = '05:30';
  line = '';
  constructor() {
    super(256, 128, 1 / 4);
  }
  protected draw() {
    const c = this.ctx;
    c.fillStyle = '#0a0d14';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#1d3b5c';
    c.fillRect(8, 8, 150, 112);
    c.strokeStyle = '#4da3ff';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(30, 110);
    c.bezierCurveTo(60, 70, 110, 80, 130, 20);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = '600 26px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(this.time, 206, 50);
    c.font = '12px system-ui, sans-serif';
    c.fillStyle = '#9fb7d0';
    c.fillText(this.line, 206, 80);
  }
}

export class ClockFace extends CanvasScreen {
  minutes = 312;
  constructor() {
    super(128, 128, 1);
  }
  protected draw() {
    const c = this.ctx;
    c.fillStyle = '#f4f1ea';
    c.beginPath();
    c.arc(64, 64, 62, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#333';
    c.lineWidth = 3;
    c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillStyle = '#333';
      c.fillRect(64 + Math.sin(a) * 52 - 2, 64 - Math.cos(a) * 52 - 2, 4, 4);
    }
    const m = this.minutes % 60;
    const h = (this.minutes / 60) % 12;
    const hand = (a: number, len: number, w: number) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(64, 64);
      c.lineTo(64 + Math.sin(a) * len, 64 - Math.cos(a) * len);
      c.stroke();
    };
    hand((h / 12) * Math.PI * 2, 30, 5);
    hand((m / 60) * Math.PI * 2, 46, 3);
  }
}

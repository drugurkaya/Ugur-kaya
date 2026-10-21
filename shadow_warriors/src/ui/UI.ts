import type { Audio } from '../audio/Audio';
import { CHARACTERS, ROUNDS_TO_WIN, type CharacterId } from '../combat/data';
import type { Match } from '../combat/Match';
import { keyLabel, type Input } from '../core/Input';
import type { Action, Settings } from '../core/Settings';

export type MenuItem =
  | { kind: 'button'; label: string; onSelect: () => void; disabled?: boolean }
  | { kind: 'slider'; label: string; get: () => number; set: (v: number) => void; min: number; max: number; step: number; fmt?: (v: number) => string }
  | { kind: 'choice'; label: string; options: { value: string; label: string }[]; get: () => string; set: (v: string) => void }
  | { kind: 'toggle'; label: string; get: () => boolean; set: (v: boolean) => void }
  | { kind: 'key'; label: string; action: Action }
  | { kind: 'header'; label: string };

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Keyboard/gamepad/mouse navigable vertical menu. */
class MenuList {
  readonly el = h('div', 'menu');
  private rows: { item: MenuItem; el: HTMLElement }[] = [];
  focus = 0;
  private waitingKey: Action | null = null;

  constructor(
    private items: MenuItem[],
    private ui: UI,
  ) {
    this.build();
  }

  private build(): void {
    this.el.innerHTML = '';
    this.rows = [];
    this.items.forEach((item) => {
      const el = h('div', item.kind === 'header' ? 'header' : 'item');
      this.el.appendChild(el);
      this.rows.push({ item, el });
      if (item.kind !== 'header') {
        el.addEventListener('mouseenter', () => {
          const i = this.rows.findIndex((r) => r.el === el);
          if (i !== this.focus) {
            this.focus = i;
            this.render();
          }
        });
        el.addEventListener('click', (ev) => {
          const i = this.rows.findIndex((r) => r.el === el);
          this.focus = i;
          const target = ev.target as HTMLElement;
          if (target.dataset.dir) this.adjust(Number(target.dataset.dir));
          else this.confirm();
        });
      }
    });
    if (this.rows[this.focus]?.item.kind === 'header') this.move(1);
    this.render();
  }

  render(): void {
    const s = this.ui.settings.data;
    this.rows.forEach(({ item, el }, i) => {
      el.classList.toggle('focus', i === this.focus);
      if (item.kind === 'header') {
        el.textContent = item.label;
        return;
      }
      if (item.kind === 'button') {
        el.classList.toggle('disabled', !!item.disabled);
        el.innerHTML = `<span>${item.label}</span>`;
        return;
      }
      let val = '';
      if (item.kind === 'slider') {
        const v = item.get();
        const pct = ((v - item.min) / (item.max - item.min)) * 100;
        val = `<span class="arrow" data-dir="-1">◀</span><span class="slider"><i style="width:${pct}%"></i></span><span style="min-width:44px;text-align:right">${item.fmt ? item.fmt(v) : Math.round(v * 100) + '%'}</span><span class="arrow" data-dir="1">▶</span>`;
      } else if (item.kind === 'choice') {
        const cur = item.options.find((o) => o.value === item.get());
        val = `<span class="arrow" data-dir="-1">◀</span><span>${cur?.label ?? ''}</span><span class="arrow" data-dir="1">▶</span>`;
      } else if (item.kind === 'toggle') {
        val = `<span class="arrow" data-dir="-1">◀</span><span>${item.get() ? 'AÇIK' : 'KAPALI'}</span><span class="arrow" data-dir="1">▶</span>`;
      } else if (item.kind === 'key') {
        val = this.waitingKey === item.action ? '<span class="rebind-wait">Bir tuşa basın…</span>' : `<span>${keyLabel(s.bindings[item.action])}</span>`;
      }
      el.innerHTML = `<span>${item.label}</span><span class="val">${val}</span>`;
    });
  }

  move(d: number): void {
    if (this.waitingKey) return;
    const n = this.rows.length;
    let i = this.focus;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      const it = this.rows[i].item;
      if (it.kind !== 'header' && !(it.kind === 'button' && it.disabled)) break;
    }
    if (i !== this.focus) this.ui.audio.menuMove();
    this.focus = i;
    this.render();
  }

  adjust(d: number): void {
    const it = this.rows[this.focus]?.item;
    if (!it) return;
    if (it.kind === 'slider') {
      const v = Math.min(it.max, Math.max(it.min, Math.round((it.get() + d * it.step) / it.step) * it.step));
      it.set(Number(v.toFixed(3)));
    } else if (it.kind === 'choice') {
      const idx = it.options.findIndex((o) => o.value === it.get());
      const n = it.options.length;
      it.set(it.options[(idx + d + n) % n].value);
    } else if (it.kind === 'toggle') it.set(!it.get());
    else return;
    this.ui.audio.menuMove();
    this.render();
  }

  confirm(): void {
    const it = this.rows[this.focus]?.item;
    if (!it || this.waitingKey) return;
    if (it.kind === 'button' && !it.disabled) {
      this.ui.audio.menuSelect();
      it.onSelect();
    } else if (it.kind === 'toggle') this.adjust(1);
    else if (it.kind === 'choice') this.adjust(1);
    else if (it.kind === 'key') {
      this.waitingKey = it.action;
      this.render();
      this.ui.input.captureNextKey((code) => {
        const action = this.waitingKey!;
        this.waitingKey = null;
        if (code !== 'Escape' || action === 'pause') {
          const b = { ...this.ui.settings.data.bindings };
          // Swap if the key is already bound elsewhere.
          for (const k in b) if (b[k as Action] === code) b[k as Action] = b[action];
          b[action] = code;
          this.ui.settings.update({ bindings: b });
        }
        this.ui.audio.menuSelect();
        this.render();
      });
    }
  }
}

interface ScreenDef {
  el: HTMLElement;
  menu?: MenuList;
  onBack?: () => void;
  onNav?: (a: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back') => boolean;
}

/** DOM overlay: menus, settings, character select, HUD, announcer, results. */
export class UI {
  readonly root: HTMLElement;
  private screens = new Map<string, ScreenDef>();
  private stack: string[] = [];
  readonly hud: HUD;
  private loadingBar: HTMLElement;
  private loadingStatus: HTMLElement;
  private fpsEl: HTMLElement;

  constructor(
    readonly settings: Settings,
    readonly input: Input,
    readonly audio: Audio,
  ) {
    this.root = document.getElementById('ui')!;
    const loading = h(
      'div',
      'screen active',
      `<div class="brand">SHADOW WARRIORS</div><div class="bar"><i></i></div><div class="status">Yükleniyor</div>`,
    );
    loading.id = 'loading';
    this.root.appendChild(loading);
    this.screens.set('loading', { el: loading });
    this.loadingBar = loading.querySelector('.bar i')!;
    this.loadingStatus = loading.querySelector('.status')!;
    this.hud = new HUD(this.root);
    this.fpsEl = h('div');
    this.fpsEl.id = 'fps';
    document.body.appendChild(this.fpsEl);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const map: Record<string, 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        Enter: 'confirm',
        Backspace: 'back',
      };
      const a = map[e.code];
      if (a && this.top) {
        e.preventDefault();
        this.nav(a);
      }
    });
    input.onAction = (a) => {
      if (!this.top) return;
      const m: Partial<Record<Action, 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'>> = {
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
        lp: 'confirm',
        lk: 'confirm',
        dodge: 'confirm',
        pause: 'back',
        hk: 'back',
      };
      const n = m[a];
      if (n) this.nav(n);
    };
  }

  setLoading(p: number, status: string): void {
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
    this.loadingStatus.textContent = status;
  }

  showError(msg: string): void {
    const el = this.screens.get('loading')!.el;
    el.classList.add('active');
    el.querySelector('.status')!.innerHTML = `<div class="error">${msg}</div>`;
  }

  get top(): ScreenDef | null {
    const k = this.stack[this.stack.length - 1];
    return k ? this.screens.get(k)! : null;
  }

  get topName(): string | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  private nav(a: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): void {
    const s = this.top;
    if (!s) return;
    if (s.onNav && s.onNav(a)) return;
    const m = s.menu;
    if (a === 'up') m?.move(-1);
    else if (a === 'down') m?.move(1);
    else if (a === 'left') m?.adjust(-1);
    else if (a === 'right') m?.adjust(1);
    else if (a === 'confirm') m?.confirm();
    else if (a === 'back' && s.onBack) {
      this.audio.menuBack();
      s.onBack();
    }
  }

  /** Register (or replace) a menu screen. */
  defineMenu(name: string, build: () => { title?: string; subtitle?: string; items: MenuItem[]; note?: string; onBack?: () => void; className?: string; extra?: HTMLElement }): void {
    const old = this.screens.get(name);
    if (old) old.el.remove();
    const d = build();
    const el = h('div', `screen ${d.className ?? 'panel-screen'}`);
    el.id = name;
    const menu = new MenuList(d.items, this);
    if (d.className === 'main') {
      el.id = 'main';
      el.className = 'screen';
      el.innerHTML = `<div class="title-block"><h1>SHADOW<br>WARRIORS<span>RISE OF THE LAST FIGHTER</span></h1></div>
        <div class="footer-hint"><b>↑↓</b> seç <b>Enter</b> onayla</div>`;
      el.appendChild(menu.el);
    } else {
      const panel = h('div', 'panel');
      if (d.title) panel.appendChild(h('h2', '', `${d.title}${d.subtitle ? `<small>${d.subtitle}</small>` : ''}`));
      if (d.extra) {
        const cols = h('div', 'columns');
        cols.appendChild(menu.el);
        cols.appendChild(d.extra);
        panel.appendChild(cols);
      } else panel.appendChild(menu.el);
      if (d.note) panel.appendChild(h('div', 'note', d.note));
      el.appendChild(panel);
    }
    this.root.appendChild(el);
    this.screens.set(name, { el, menu, onBack: d.onBack });
    if (this.stack.includes(name)) el.classList.add('active');
  }

  defineCustom(name: string, el: HTMLElement, opts: Omit<ScreenDef, 'el'>): void {
    const old = this.screens.get(name);
    if (old && old.el !== el) old.el.remove();
    el.classList.add('screen');
    el.id = name;
    if (!el.parentElement) this.root.appendChild(el);
    this.screens.set(name, { el, ...opts });
  }

  /** Replace the whole stack with one screen. */
  show(name: string): void {
    for (const k of this.stack) this.screens.get(k)?.el.classList.remove('active');
    this.screens.get('loading')!.el.classList.remove('active');
    this.stack = [name];
    this.screens.get(name)!.el.classList.add('active');
    this.screens.get(name)!.menu?.render();
  }

  push(name: string): void {
    const top = this.top;
    if (top) top.el.classList.remove('active');
    this.stack.push(name);
    const s = this.screens.get(name)!;
    s.el.classList.add('active');
    if (s.menu) {
      s.menu.focus = 0;
      s.menu.move(0);
      s.menu.render();
    }
  }

  pop(): void {
    const k = this.stack.pop();
    if (k) this.screens.get(k)?.el.classList.remove('active');
    const t = this.top;
    if (t) {
      t.el.classList.add('active');
      t.menu?.render();
    }
  }

  closeAll(): void {
    for (const k of this.stack) this.screens.get(k)?.el.classList.remove('active');
    this.stack = [];
  }

  refresh(): void {
    this.top?.menu?.render();
  }

  setFps(show: boolean, text: string): void {
    this.fpsEl.style.display = show ? 'block' : 'none';
    if (show) this.fpsEl.textContent = text;
  }
}

/* ------------------------------------------------------------------------ */
/* HUD                                                                       */
/* ------------------------------------------------------------------------ */

export class HUD {
  readonly el: HTMLElement;
  private hp: HTMLElement[] = [];
  private ghost: HTMLElement[] = [];
  private bars: HTMLElement[] = [];
  private guard: HTMLElement[] = [];
  private guardWrap: HTMLElement[] = [];
  private meter: HTMLElement[] = [];
  private meterWrap: HTMLElement[] = [];
  private pips: HTMLElement[][] = [[], []];
  private names: HTMLElement[] = [];
  private tags: HTMLElement[] = [];
  private timer: HTMLElement;
  private combo: HTMLElement[] = [];
  private comboTimer = [0, 0];
  private lastCombo = [0, 0];
  private popups: HTMLElement;
  private announcer: HTMLElement;
  private skip: HTMLElement;
  private lastHp = [1, 1];

  constructor(root: HTMLElement) {
    this.el = h('div', '');
    this.el.id = 'hud';
    const side = (s: 'left' | 'right') => `
      <div class="fighter-hud ${s}">
        <div class="row"><span class="nm"></span><span class="tag"></span></div>
        <div class="hpbar"><div class="ghost"></div><div class="fill"></div></div>
        <div class="guard"><i></i></div>
        <div class="pips-round">${'<i></i>'.repeat(ROUNDS_TO_WIN)}</div>
      </div>`;
    this.el.innerHTML = `
      <div class="hud-top">${side('left')}<div class="timer">99<small>ROUND 1</small></div>${side('right')}</div>
      <div class="hud-bottom">
        <div class="meter left"><div class="lbl"><span>ÖZEL GÜÇ</span><b></b></div><div class="bar"><i></i></div></div>
        <div class="meter right"><div class="lbl"><span>ÖZEL GÜÇ</span><b></b></div><div class="bar"><i></i></div></div>
      </div>
      <div class="combo left"><div class="n">0</div><div class="h">HITS</div><div class="d"></div></div>
      <div class="combo right"><div class="n">0</div><div class="h">HITS</div><div class="d"></div></div>
      <div class="popups"></div>
      <div class="announce"><div class="big"></div><div class="sub"></div></div>
      <div class="skip-hint" style="display:none">Geçmek için <b>Enter</b></div>`;
    root.appendChild(this.el);
    const fh = this.el.querySelectorAll<HTMLElement>('.fighter-hud');
    fh.forEach((f, i) => {
      this.bars[i] = f.querySelector('.hpbar')!;
      this.hp[i] = f.querySelector('.fill')!;
      this.ghost[i] = f.querySelector('.ghost')!;
      this.guard[i] = f.querySelector('.guard i')!;
      this.guardWrap[i] = f.querySelector('.guard')!;
      this.names[i] = f.querySelector('.nm')!;
      this.tags[i] = f.querySelector('.tag')!;
      this.pips[i] = Array.from(f.querySelectorAll<HTMLElement>('.pips-round i'));
    });
    const ms = this.el.querySelectorAll<HTMLElement>('.meter');
    ms.forEach((m, i) => {
      this.meterWrap[i] = m;
      this.meter[i] = m.querySelector('.bar i')!;
    });
    this.timer = this.el.querySelector('.timer')!;
    this.combo = Array.from(this.el.querySelectorAll<HTMLElement>('.combo'));
    this.popups = this.el.querySelector('.popups')!;
    this.announcer = this.el.querySelector('.announce')!;
    this.skip = this.el.querySelector('.skip-hint')!;
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('active', v);
  }

  setBarsVisible(v: boolean): void {
    for (const sel of ['.hud-top', '.hud-bottom']) (this.el.querySelector(sel) as HTMLElement).style.visibility = v ? 'visible' : 'hidden';
  }

  setSkipHint(v: boolean): void {
    this.skip.style.display = v ? 'block' : 'none';
  }

  setFighters(a: CharacterId, b: CharacterId, labels: [string, string]): void {
    const ids = [a, b];
    ids.forEach((id, i) => {
      this.names[i].textContent = CHARACTERS[id].name;
      this.tags[i].textContent = labels[i];
      this.meterWrap[i].style.setProperty('--c', id === 'phantom' ? 'var(--phantom)' : 'var(--fang)');
    });
    this.lastHp = [1, 1];
    this.comboTimer = [0, 0];
    this.combo.forEach((c) => c.classList.remove('show'));
  }

  update(m: Match, dt: number): void {
    m.fighters.forEach((f, i) => {
      const hp = f.health / f.def.maxHealth;
      const gh = f.displayHealth / f.def.maxHealth;
      this.hp[i].style.transform = `scaleX(${hp})`;
      this.ghost[i].style.transform = `scaleX(${gh})`;
      this.bars[i].classList.toggle('low', hp < 0.25);
      if (hp < this.lastHp[i] - 1e-4) {
        this.bars[i].classList.remove('flash');
        void this.bars[i].offsetWidth;
        this.bars[i].classList.add('flash');
      }
      this.lastHp[i] = hp;
      this.guard[i].style.width = `${f.guard}%`;
      this.guardWrap[i].classList.toggle('broken', f.state === 'guardbreak');
      this.meter[i].style.width = `${f.meter}%`;
      const full = f.meter >= 100;
      this.meterWrap[i].classList.toggle('full', full);
      (this.meterWrap[i].querySelector('.lbl b') as HTMLElement).textContent = full ? 'HAZIR' : `${Math.floor(f.meter)}%`;
      this.pips[i].forEach((p, k) => p.classList.toggle('on', k < m.wins[i]));

      // Combo counter belongs to the attacker (the other fighter's hits).
      const def = m.fighters[1 - i];
      const hits = def.comboHits;
      const c = this.combo[i];
      if (hits >= 2) {
        if (hits !== this.lastCombo[i]) {
          (c.querySelector('.n') as HTMLElement).textContent = String(hits);
          (c.querySelector('.d') as HTMLElement).textContent = `${def.comboDamage} HASAR`;
          c.classList.remove('bump');
          void c.offsetWidth;
          c.classList.add('bump');
        }
        c.classList.add('show');
        this.comboTimer[i] = 1.2;
      } else {
        this.comboTimer[i] -= dt;
        if (this.comboTimer[i] <= 0) c.classList.remove('show');
      }
      this.lastCombo[i] = hits;
    });
    const secs = m.timerSeconds;
    this.timer.firstChild!.textContent = String(secs);
    this.timer.classList.toggle('low', secs <= 10 && m.phase === 'fight');
    (this.timer.querySelector('small') as HTMLElement).textContent = `ROUND ${m.round}`;
  }

  /** Floating text near a screen position (0..1). */
  popup(text: string, cls: string, sx: number, sy: number): void {
    const p = h('div', `popup ${cls}`, text);
    p.style.left = `${sx * 100}%`;
    p.style.top = `${sy * 100}%`;
    this.popups.appendChild(p);
    window.setTimeout(() => p.remove(), 950);
  }

  announce(big: string, sub = '', mode: 'go' | 'hold' = 'go', ember = false): void {
    const b = this.announcer.querySelector('.big') as HTMLElement;
    const s = this.announcer.querySelector('.sub') as HTMLElement;
    b.textContent = big;
    s.textContent = sub;
    b.classList.toggle('ember', ember);
    this.announcer.classList.remove('go', 'hold');
    void this.announcer.offsetWidth;
    this.announcer.classList.add(mode);
  }

  clearAnnounce(): void {
    this.announcer.classList.remove('go', 'hold');
  }
}

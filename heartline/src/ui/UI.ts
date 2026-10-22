import { CAST, nameOf } from '../characters/cast';
import type { Quality } from '../core/Settings';
import { formatClock, dayOf } from '../core/time';
import { DEVIATIONS, type Ending, type LegalResult } from '../legal/LegalSystem';
import { SOURCES } from '../medical/research';
import { CHAPTERS, ENDINGS } from '../narrative/content';
import { interpolate } from '../narrative/Engine';
import type { ChoiceTag } from '../narrative/types';
import { GOOD_LABEL, OBJECTIVES, OUTCOME_LABEL, STAGE_LABEL, STAT_EFFECT, STAT_LABEL, t } from '../i18n/strings';
import { TRACKED_CHARACTERS } from '../state/GameState';
import { SLOTS, type SlotId } from '../state/Save';
import { STAT_KEYS, type Lang, type LText } from '../state/types';
import type { Game } from '../game/Game';
import { button, clear, el, show } from './dom';

const TAG_ICON: Record<ChoiceTag, string> = { time: '⏱', risk: '⚠', team: '🤝', family: '♥', care: '✚', self: '☯', record: '📝', money: '₺', career: '★' };

/** Messages that already exist on the phone at the start (sent the evening before). */
export const PRELOADED_MESSAGES: { id: string; from: string; at: number; text: LText; reply?: string }[] = [
  { id: 'deniz0', from: 'deniz', at: -6 * 60 - 46, text: { tr: 'Babacığım yarın konserime geliyorsun di mi? Solo kısmım var 🎻', en: 'Dad, you are coming to my concert tomorrow, right? I have a solo part 🎻' }, reply: 'msgDeniz' },
  { id: 'ergin0', from: 'ergin', at: -2 * 60 - 55, text: { tr: 'Kemal, 08:30 kalite toplantısını unutma.', en: 'Kemal, don’t forget the 08:30 quality meeting.' }, reply: 'msgErgin' },
  { id: 'bank0', from: 'bank', at: -4 * 60, text: { tr: 'Kredi kartı son ödeme tarihi bugün.', en: 'Credit-card payment due today.' }, reply: 'msgBank' },
  { id: 'offer0', from: 'offer', at: -5 * 60 - 30, text: { tr: 'Özel hastane İK: teklifimiz hâlâ geçerli.', en: 'Private hospital HR: our offer still stands.' }, reply: 'msgOffer' },
];

const SENDER: Record<string, LText> = {
  bank: { tr: 'Banka', en: 'Bank' },
  offer: { tr: 'Özel Hastane İK', en: 'Private Hospital HR' },
};

export class UI {
  root: HTMLElement;
  private fade: HTMLElement;
  private titleCard: HTMLElement;
  private menu: HTMLElement;
  private hud: HTMLElement;
  private clockEl: HTMLElement;
  private chapterEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private promptEl: HTMLElement;
  private badge: HTMLElement;
  private bars: Record<string, HTMLElement> = {};
  private dlg: HTMLElement;
  private dlgName: HTMLElement;
  private dlgRole: HTMLElement;
  private dlgText: HTMLElement;
  private dlgHint: HTMLElement;
  private choices: HTMLElement;
  private card: HTMLElement;
  private timerBar: HTMLElement;
  private phone: HTMLElement;
  private modal: HTMLElement;
  private toasts: HTMLElement;
  private touch: HTMLElement;
  private typing = { full: '', shown: 0, done: true };
  private timer = { total: 0, left: 0, active: false };
  private lastLineKey = '';
  phoneView: 'closed' | 'ring' | 'home' | 'messages' | 'thread' | 'contacts' = 'closed';
  private threadId = '';
  modalOpen: string | null = null;

  constructor(
    private game: Game,
    parent: HTMLElement,
  ) {
    this.root = el('div', 'ui', parent);
    this.fade = el('div', 'fade', this.root);
    this.titleCard = el('div', 'title-card hidden', this.root);
    this.hud = el('div', 'hud hidden', this.root);
    const tl = el('div', 'hud-tl', this.hud);
    this.clockEl = el('div', 'hud-clock', tl, '05:12');
    this.chapterEl = el('div', 'hud-chapter', tl);
    const meters = el('div', 'hud-meters', tl);
    for (const k of ['stress', 'fatigue'] as const) {
      const m = el('div', 'meter', meters);
      el('span', 'meter-label', m, '');
      const bar = el('div', 'meter-bar', m);
      this.bars[k] = el('div', 'meter-fill ' + k, bar);
      m.dataset.stat = k;
    }
    const tr = el('div', 'hud-tr', this.hud);
    const phoneBtn = button('📱', 'hud-btn', tr, () => this.togglePhone());
    phoneBtn.setAttribute('aria-label', 'phone');
    phoneBtn.dataset.testid = 'phone-btn';
    this.badge = el('span', 'badge hidden', phoneBtn, '0');
    const jb = button('📖', 'hud-btn', tr, () => this.openJournal());
    jb.setAttribute('aria-label', 'journal');
    const pb = button('⏸', 'hud-btn', tr, () => this.openPause());
    pb.setAttribute('aria-label', 'pause');
    this.objectiveEl = el('div', 'hud-objective', this.hud);
    this.promptEl = el('button', 'hud-prompt hidden', this.hud) as HTMLButtonElement;
    this.promptEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.interact();
    });

    this.dlg = el('div', 'dlg hidden', this.root);
    const head = el('div', 'dlg-head', this.dlg);
    this.dlgName = el('div', 'dlg-name', head);
    this.dlgRole = el('div', 'dlg-role', head);
    this.dlgText = el('div', 'dlg-text', this.dlg);
    this.dlgHint = el('div', 'dlg-hint', this.dlg);
    this.card = el('div', 'card-head hidden', this.dlg);
    this.timerBar = el('div', 'timer hidden', this.dlg);
    el('div', 'timer-fill', this.timerBar);
    this.choices = el('div', 'choices', this.dlg);
    this.dlg.addEventListener('click', () => this.advance());

    this.phone = el('div', 'phone hidden', this.root);
    this.modal = el('div', 'modal hidden', this.root);
    this.menu = el('div', 'menu hidden', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.touch = el('div', 'touch hidden', this.root);
    this.buildTouch();
    this.applyTextSize();
  }

  get lang(): Lang {
    return this.game.settings.data.lang;
  }

  applyTextSize() {
    this.root.style.setProperty('--text-scale', String(this.game.settings.data.textSize));
  }

  // ---------------------------------------------------------------------------
  // Fades and title cards
  // ---------------------------------------------------------------------------
  setFade(v: number) {
    this.fade.style.opacity = String(v);
  }

  async titleCardShow(lines: string[], ms = 2600) {
    clear(this.titleCard);
    lines.forEach((l, i) => el('div', i === 0 ? 'tc-big' : 'tc-small', this.titleCard, l));
    show(this.titleCard, true);
    this.titleCard.classList.remove('out');
    await new Promise((r) => setTimeout(r, ms));
    this.titleCard.classList.add('out');
    await new Promise((r) => setTimeout(r, 700));
    show(this.titleCard, false);
  }

  toast(text: string, kind = '') {
    const tEl = el('div', 'toast ' + kind, this.toasts, text);
    setTimeout(() => tEl.classList.add('out'), 3200);
    setTimeout(() => tEl.remove(), 3900);
  }

  // ---------------------------------------------------------------------------
  // Main menu
  // ---------------------------------------------------------------------------
  showMenu(on: boolean) {
    show(this.menu, on);
    show(this.hud, !on);
    if (!on) return;
    clear(this.menu);
    const box = el('div', 'menu-box', this.menu);
    el('div', 'menu-title', box, t('title', this.lang));
    const ecg = el('div', 'menu-ecg', box);
    ecg.innerHTML = '<svg viewBox="0 0 400 60" preserveAspectRatio="none"><path class="ecg-path" d="M0 30 L120 30 L135 30 L142 18 L150 30 L160 30 L168 4 L176 56 L184 30 L205 30 L215 22 L228 30 L400 30"/></svg>';
    el('div', 'menu-sub', box, t('subtitle', this.lang));
    const btns = el('div', 'menu-btns', box);
    const latest = this.game.saves.latest();
    if (latest) {
      const b = button(t('continue', this.lang), 'btn primary', btns, () => this.game.continueGame());
      b.dataset.testid = 'continue';
      el('small', 'btn-sub', b, `${formatClock(latest.data.clock)} · ${CHAPTERS.find((c) => c.id === latest.data.chapter)?.title[this.lang] ?? ''}`);
    }
    const ng = button(t('newGame', this.lang), latest ? 'btn' : 'btn primary', btns, () => this.game.newGame());
    ng.dataset.testid = 'new-game';
    button(t('load', this.lang), 'btn', btns, () => this.openSlots('load'));
    button(t('settings', this.lang), 'btn', btns, () => this.openSettings());
    button(t('about', this.lang), 'btn', btns, () => this.openAbout());
    const langRow = el('div', 'lang-row', box);
    for (const l of ['tr', 'en'] as Lang[]) {
      const b = button(l.toUpperCase(), 'chip' + (this.lang === l ? ' on' : ''), langRow, () => {
        this.game.settings.set('lang', l);
        this.showMenu(true);
      });
      b.dataset.testid = 'lang-' + l;
    }
    el('p', 'menu-disclaimer', box, t('disclaimer', this.lang));
    el('p', 'menu-controls', box, t(this.game.touch ? 'controlsTouch' : 'controlsDesktop', this.lang));
    if (!this.game.saves.available) el('p', 'menu-warn', box, t('storageUnavailable', this.lang));
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  updateHud() {
    const s = this.game.state;
    if (!s) return;
    const lang = this.lang;
    const day = dayOf(s.clock);
    this.clockEl.textContent = formatClock(s.clock) + (day > 0 ? `  +${day}${lang === 'tr' ? 'g' : 'd'}` : '');
    const ch = CHAPTERS.find((c) => c.id === s.data.chapter);
    this.chapterEl.textContent = ch ? `${ch.n}. ${ch.title[lang]}` : '';
    for (const k of ['stress', 'fatigue'] as const) {
      this.bars[k].style.width = `${s.stat(k)}%`;
      const label = this.bars[k].parentElement!.previousElementSibling as HTMLElement;
      label.textContent = STAT_LABEL[k][lang];
    }
    const obj = s.data.objective ? OBJECTIVES[s.data.objective] : null;
    this.objectiveEl.textContent = obj ? '◆ ' + obj[lang] : '';
    const unread = this.unreadTotal();
    this.badge.textContent = String(unread);
    show(this.badge, unread > 0);
  }

  setPrompt(label: string | null) {
    show(this.promptEl, !!label);
    if (label) this.promptEl.textContent = (this.game.touch ? '✋ ' : 'E · ') + label;
  }

  setHudVisible(on: boolean) {
    show(this.hud, on);
  }

  // ---------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------
  renderDialogue() {
    const e = this.game.engine;
    const s = this.game.state;
    if (!e || !s || !e.active) {
      show(this.dlg, false);
      this.timer.active = false;
      this.lastLineKey = '';
      return;
    }
    show(this.dlg, true);
    const lang = this.lang;
    const line = e.line;
    const node = e.node!;
    const choosing = e.choosing;
    this.dlg.classList.toggle('choosing', choosing);
    this.dlg.classList.toggle('result', !!line?.result);
    if (line) {
      const key = `${e.dialogue?.id}.${node.id}.${line.text.en}`;
      const speaker = line.speaker;
      this.dlgName.textContent = speaker ? nameOf(speaker, lang) : '';
      this.dlgRole.textContent = speaker && speaker !== 'self' ? CAST[speaker]?.role[lang] ?? '' : '';
      this.dlg.classList.toggle('narration', !speaker);
      const text = interpolate(line.text[lang], s, lang);
      if (key !== this.lastLineKey) {
        this.lastLineKey = key;
        this.typing = { full: text, shown: 0, done: false };
        this.game.onLineShown(line, text);
      }
      this.dlgHint.textContent = t('tapToContinue', lang);
    } else {
      this.typing = { full: '', shown: 0, done: true };
      this.dlgText.textContent = '';
      this.dlgName.textContent = '';
      this.dlgRole.textContent = '';
      this.dlgHint.textContent = '';
    }
    clear(this.choices);
    show(this.card, false);
    show(this.timerBar, false);
    if (choosing) {
      if (node.card) {
        show(this.card, true);
        clear(this.card);
        el('div', 'card-title', this.card, interpolate(node.card.title[lang], s, lang));
        if (node.card.context) el('div', 'card-context', this.card, interpolate(node.card.context[lang], s, lang));
      }
      const asCards = !!node.card;
      this.choices.classList.toggle('cards', asCards);
      for (const c of e.visibleChoices()) {
        const locked = e.isLocked(c);
        const b = el('button', 'choice' + (locked ? ' locked' : ''), this.choices) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.choice = c.id;
        const top = el('div', 'choice-text', b, interpolate(c.text[lang], s, lang));
        if (c.tags?.length) el('span', 'choice-tags', top, ' ' + c.tags.map((tg) => TAG_ICON[tg]).join(' '));
        if (c.detail) el('div', 'choice-detail', b, interpolate(c.detail[lang], s, lang));
        if (locked && c.lockedReason) el('div', 'choice-locked', b, '🔒 ' + c.lockedReason[lang]);
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (locked) return;
          this.game.audio.sfx('select');
          this.timer.active = false;
          e.choose(c.id);
        });
      }
      const secs = e.timerFor(node);
      if (secs > 0) {
        if (!this.timer.active) this.timer = { total: secs, left: secs, active: true };
        show(this.timerBar, true);
      } else this.timer.active = false;
    } else this.timer.active = false;
  }

  /** Called every frame: typewriter and decision timer. */
  tick(dt: number) {
    if (!this.typing.done) {
      const speed = 55 * this.game.settings.data.textSpeed;
      this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + dt * speed);
      this.dlgText.textContent = this.typing.full.slice(0, Math.floor(this.typing.shown));
      if (this.typing.shown >= this.typing.full.length) this.typing.done = true;
    }
    if (this.timer.active && !this.modalOpen && this.phoneView === 'closed') {
      this.timer.left -= dt;
      const fill = this.timerBar.firstElementChild as HTMLElement;
      fill.style.width = `${Math.max(0, (this.timer.left / this.timer.total) * 100)}%`;
      this.timerBar.classList.toggle('urgent', this.timer.left < 4);
      if (this.timer.left <= 0) {
        this.timer.active = false;
        this.game.engine?.timeout();
      }
    }
  }

  /** Space / click: finish the typewriter, or advance. */
  advance() {
    const e = this.game.engine;
    if (!e?.active || e.choosing) return;
    if (!this.typing.done) {
      this.typing.shown = this.typing.full.length;
      this.dlgText.textContent = this.typing.full;
      this.typing.done = true;
      return;
    }
    this.game.audio.sfx('click');
    e.next();
  }

  // ---------------------------------------------------------------------------
  // Phone
  // ---------------------------------------------------------------------------
  togglePhone() {
    if (this.phoneView === 'ring') return;
    if (this.phoneView !== 'closed') return this.closePhone();
    if (this.game.engine?.active) return;
    this.openPhone('home');
  }

  closePhone() {
    this.phoneView = 'closed';
    show(this.phone, false);
    this.game.onPhoneClosed();
  }

  openPhone(view: UI['phoneView'], arg = '') {
    this.phoneView = view;
    this.threadId = arg || this.threadId;
    show(this.phone, true);
    this.renderPhone();
  }

  renderPhone() {
    const s = this.game.state;
    if (!s || this.phoneView === 'closed') return;
    const lang = this.lang;
    clear(this.phone);
    const dev = el('div', 'device', this.phone);
    const bar = el('div', 'status-bar', dev);
    el('span', '', bar, formatClock(s.clock));
    el('span', '', bar, '▂▄▆ 5G  82%');
    const scr = el('div', 'screen', dev);
    if (this.phoneView === 'ring') {
      scr.classList.add('ringing');
      el('div', 'ring-time', scr, formatClock(s.clock));
      el('div', 'ring-name', scr, t('icuCaller', lang));
      el('div', 'ring-sub', scr, t('incoming', lang));
      const row = el('div', 'ring-row', scr);
      const dec = button(t('decline', lang), 'ring-btn decline', row, () => this.game.declineCall());
      dec.dataset.testid = 'decline';
      const ans = button(t('answer', lang), 'ring-btn answer', row, () => this.game.answerCall());
      ans.dataset.testid = 'answer';
      return;
    }
    const nav = el('div', 'phone-nav', scr);
    button('✉ ' + t('messages', lang), 'tab' + (this.phoneView === 'messages' || this.phoneView === 'thread' ? ' on' : ''), nav, () => this.openPhone('messages'));
    button('☎ ' + t('contacts', lang), 'tab' + (this.phoneView === 'contacts' ? ' on' : ''), nav, () => this.openPhone('contacts'));
    const body = el('div', 'phone-body', scr);
    if (this.phoneView === 'home' || this.phoneView === 'messages') {
      const all = this.allMessages();
      if (!all.length) el('div', 'empty', body, t('noMessages', lang));
      for (const m of all) {
        const row = button('', 'msg-row' + (m.read ? '' : ' unread'), body, () => this.openPhone('thread', m.id));
        row.dataset.msg = m.id;
        el('div', 'msg-from', row, this.senderName(m.from));
        el('div', 'msg-prev', row, interpolate(m.text[lang], s, lang).slice(0, 60));
        el('div', 'msg-time', row, m.at < 0 ? (lang === 'tr' ? 'dün' : 'yesterday') : formatClock(m.at));
      }
    } else if (this.phoneView === 'thread') {
      const m = this.allMessages().find((x) => x.id === this.threadId);
      if (m) {
        this.markRead(m.id);
        el('div', 'thread-from', body, this.senderName(m.from));
        el('div', 'bubble', body, interpolate(m.text[lang], s, lang));
        const pre = PRELOADED_MESSAGES.find((p) => p.id === m.id);
        if (pre?.reply && !s.done('reply:' + m.id)) {
          const rb = button(t('reply', lang), 'btn small', body, () => {
            s.markDone('reply:' + m.id);
            this.closePhone();
            this.game.startDialogue(pre.reply!);
          });
          rb.dataset.testid = 'reply';
        }
        if ((m.from === 'zeynep' || m.from === 'ece') && this.game.canCall(m.from === 'zeynep' ? 'icu' : 'ece')) {
          button(t('call', lang) + ' ☎', 'btn small', body, () => this.game.callContact(m.from === 'zeynep' ? 'icu' : 'ece'));
        }
      }
      button('‹ ' + t('back', lang), 'link', body, () => this.openPhone('messages'));
    } else if (this.phoneView === 'contacts') {
      const contacts: [string, LText][] = [
        ['icu', { tr: 'Yoğun Bakım (KVC)', en: 'ICU (Cardiac)' }],
        ['ece', { tr: 'Dr. Ece Yalçın', en: 'Dr. Ece Yalçın' }],
        ['ayla', { tr: 'Ayla ❤', en: 'Ayla ❤' }],
      ];
      for (const [id, label] of contacts) {
        const ok = this.game.canCall(id);
        const b = button('☎  ' + label[lang], 'contact' + (ok ? '' : ' disabled'), body, () => ok && this.game.callContact(id));
        b.dataset.contact = id;
      }
    }
    button(t('close', lang), 'phone-close', dev, () => this.closePhone());
  }

  private senderName(from: string) {
    return SENDER[from]?.[this.lang] ?? nameOf(from, this.lang);
  }

  private allMessages() {
    const s = this.game.state!;
    const pre = PRELOADED_MESSAGES.map((m) => ({ ...m, read: s.done('read:' + m.id) }));
    const live = s.data.messages.map((m) => ({ ...m, read: m.read }));
    return [...live].reverse().concat(pre);
  }

  private markRead(id: string) {
    const s = this.game.state!;
    const live = s.data.messages.find((m) => m.id === id);
    if (live) live.read = true;
    else s.markDone('read:' + id);
    this.updateHud();
  }

  /** Unread count including the preloaded messages. */
  unreadTotal() {
    return this.allMessages().filter((m) => !m.read).length;
  }

  // ---------------------------------------------------------------------------
  // Modals: pause, journal, settings, slots, about, ending
  // ---------------------------------------------------------------------------
  closeModal() {
    this.modalOpen = null;
    show(this.modal, false);
    clear(this.modal);
    this.game.onModalClosed();
  }

  private openModal(id: string, title: string): HTMLElement {
    this.modalOpen = id;
    clear(this.modal);
    show(this.modal, true);
    const box = el('div', 'modal-box ' + id, this.modal);
    const head = el('div', 'modal-head', box);
    el('h2', '', head, title);
    button('✕', 'modal-x', head, () => (this.game.state && !this.game.inMenu ? this.closeModal() : this.backToMenuModal()));
    return el('div', 'modal-body', box);
  }

  private backToMenuModal() {
    this.closeModal();
    if (this.game.inMenu) this.showMenu(true);
  }

  openPause() {
    if (!this.game.state || this.game.inMenu) return;
    const body = this.openModal('pause', t('paused', this.lang));
    const col = el('div', 'menu-btns', body);
    button(t('resume', this.lang), 'btn primary', col, () => this.closeModal());
    button(t('save', this.lang), 'btn', col, () => this.openSlots('save'));
    button(t('load', this.lang), 'btn', col, () => this.openSlots('load'));
    button(t('journal', this.lang), 'btn', col, () => this.openJournal());
    button(t('settings', this.lang), 'btn', col, () => this.openSettings());
    button(t('mainMenu', this.lang), 'btn', col, () => {
      this.closeModal();
      this.game.quitToMenu();
    });
  }

  openSlots(mode: 'save' | 'load') {
    const lang = this.lang;
    const body = this.openModal('slots', t(mode, lang));
    if (mode === 'save' && !this.game.canSave()) {
      el('p', 'warn', body, t('cannotSaveNow', lang));
    }
    for (const slot of SLOTS) {
      if (mode === 'save' && slot === 'auto') continue;
      const d = this.game.saves.load(slot);
      const row = el('div', 'slot', body);
      el('div', 'slot-name', row, slot === 'auto' ? t('autosave', lang) : `${t('slot', lang)} ${slot.slice(-1)}`);
      el(
        'div',
        'slot-info',
        row,
        d ? `${formatClock(d.clock)} · ${CHAPTERS.find((c) => c.id === d.chapter)?.title[lang] ?? ''} · ${new Date(d.savedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}` : t('empty', lang),
      );
      if (mode === 'save') {
        const b = button(t('save', lang), 'btn small', row, () => {
          if (this.game.saveTo(slot as SlotId)) {
            this.toast(t('saved', lang));
            this.openSlots('save');
          }
        });
        b.dataset.slot = slot;
        b.disabled = !this.game.canSave();
      } else if (d) {
        const b = button(t('load', lang), 'btn small', row, () => {
          this.closeModal();
          void this.game.loadFrom(slot as SlotId);
        });
        b.dataset.slot = slot;
      }
    }
  }

  openSettings() {
    const lang = this.lang;
    const st = this.game.settings;
    const body = this.openModal('settings', t('settings', lang));
    const row = (label: string) => {
      const r = el('div', 'set-row', body);
      el('label', '', r, label);
      return el('div', 'set-ctl', r);
    };
    const chips = <T extends string | boolean>(ctl: HTMLElement, opts: [T, string][], cur: T, on: (v: T) => void) => {
      for (const [v, label] of opts) {
        const b = button(label, 'chip' + (v === cur ? ' on' : ''), ctl, () => {
          on(v);
          this.openSettings();
        });
        b.dataset.value = String(v);
      }
    };
    chips(row(t('language', lang)), [['tr', 'Türkçe'], ['en', 'English']] as [Lang, string][], st.data.lang, (v) => st.set('lang', v));
    chips(
      row(t('quality', lang)),
      [
        ['performance', t('performance', lang)],
        ['balanced', t('balanced', lang)],
        ['quality', t('qualityHigh', lang)],
      ] as [Quality, string][],
      st.data.quality,
      (v) => {
        st.set('quality', v);
        this.game.applyQuality();
      },
    );
    const slider = (key: 'master' | 'sfx' | 'ambience' | 'textSize' | 'textSpeed' | 'lookSensitivity', min: number, max: number, step: number) => {
      const ctl = row(t(key, lang));
      const inp = el('input', '', ctl) as HTMLInputElement;
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(st.data[key]);
      inp.addEventListener('input', () => {
        st.set(key, Number(inp.value));
        this.game.audio.applyVolumes();
        this.applyTextSize();
      });
    };
    slider('master', 0, 1, 0.05);
    slider('sfx', 0, 1, 0.05);
    slider('ambience', 0, 1, 0.05);
    slider('textSize', 0.85, 1.4, 0.05);
    slider('textSpeed', 0.5, 3, 0.25);
    slider('lookSensitivity', 0.3, 2.5, 0.1);
    const toggles: ['voice' | 'invertY' | 'reduceMotion', string][] = [
      ['voice', t('voice', lang)],
      ['invertY', t('invertY', lang)],
      ['reduceMotion', t('reduceMotion', lang)],
    ];
    for (const [k, label] of toggles) {
      chips(row(label), [
        [true, t('on', lang)],
        [false, t('off', lang)],
      ], st.data[k], (v) => {
        st.set(k, v);
        this.game.applySettings();
      });
    }
  }

  openAbout() {
    const body = this.openModal('about', t('about', this.lang));
    el('p', '', body, t('disclaimer', this.lang));
    el('p', '', body, t('aboutText', this.lang));
    this.sourcesList(body);
  }

  private sourcesList(body: HTMLElement) {
    for (const s of SOURCES) {
      const d = el('div', 'source', body);
      const a = el('a', 'source-title', d, s.title) as HTMLAnchorElement;
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      el('div', 'source-meta', d, `${s.org} · ${s.date}`);
      el('div', 'source-lesson', d, s.lessons[this.lang]);
      el('div', 'source-adapt', d, '→ ' + s.adaptation[this.lang]);
    }
  }

  openJournal(tab = 'objectives') {
    const s = this.game.state;
    if (!s) return;
    const lang = this.lang;
    const body = this.openModal('journal', t('journal', lang));
    const tabs = el('div', 'tabs', body);
    const content = el('div', 'tab-body', body);
    const tabList: [string, string][] = [
      ['objectives', t('objectives', lang)],
      ['patient', t('patient', lang)],
      ['career', t('career', lang)],
      ['relationships', t('relationships', lang)],
      ['history', t('history', lang)],
      ['chapters', t('chapters', lang)],
      ['sources', t('sources', lang)],
    ];
    for (const [id, label] of tabList) {
      const b = button(label, 'tab' + (id === tab ? ' on' : ''), tabs, () => this.openJournal(id));
      b.dataset.tab = id;
    }
    if (tab === 'objectives') {
      const obj = s.data.objective ? OBJECTIVES[s.data.objective] : null;
      el('div', 'big', content, obj ? obj[lang] : '—');
      el('h3', '', content, t('pending', lang));
      el('p', 'muted', content, t('pendingHint', lang) + ` (${s.data.pending.length})`);
    }
    if (tab === 'patient') this.patientPanel(content);
    if (tab === 'career') {
      for (const k of STAT_KEYS) {
        const r = el('div', 'stat-row', content);
        el('div', 'stat-name', r, STAT_LABEL[k][lang]);
        const bar = el('div', 'stat-bar', r);
        const f = el('div', 'stat-fill ' + k, bar);
        f.style.width = `${s.stat(k)}%`;
        el('div', 'stat-val', r, String(Math.round(s.stat(k))));
        el('div', 'stat-effect', r, STAT_EFFECT[k][lang]);
      }
      if (s.data.goodPractice.length) {
        el('h3', '', content, t('goodTitle', lang));
        el('p', 'muted', content, s.data.goodPractice.map((g) => GOOD_LABEL[g]?.[lang] ?? g).join(' · '));
      }
    }
    if (tab === 'relationships') {
      for (const id of TRACKED_CHARACTERS) {
        const m = s.data.characters[id];
        const r = el('div', 'rel-row', content);
        el('div', 'rel-name', r, `${nameOf(id, lang)} — ${CAST[id].role[lang]}`);
        const bar = el('div', 'rel-bar', r);
        const f = el('div', 'rel-fill' + (m.affinity < 0 ? ' neg' : ''), bar);
        f.style.width = `${Math.abs(m.affinity) / 2}%`;
        f.style.left = m.affinity < 0 ? `${50 - Math.abs(m.affinity) / 2}%` : '50%';
        const mem = Object.keys(m.memories);
        if (mem.length) el('div', 'rel-mem', r, t('remembers', lang) + ': ' + mem.map((k) => MEMORY_LABEL[k]?.[lang] ?? k).join(', '));
      }
    }
    if (tab === 'history') {
      if (!s.data.history.length) el('p', 'muted', content, '—');
      for (const h of [...s.data.history].reverse()) {
        const r = el('div', 'hist-row tag-' + h.tag, content);
        el('span', 'hist-time', r, formatClock(h.at) + (dayOf(h.at) > 0 ? ` (+${dayOf(h.at)})` : ''));
        el('span', 'hist-text', r, h.text[lang]);
      }
    }
    if (tab === 'chapters') {
      const cur = CHAPTERS.findIndex((c) => c.id === s.data.chapter);
      CHAPTERS.forEach((c, i) => el('div', 'chapter-row' + (i < cur ? ' done' : i === cur ? ' current' : ''), content, `${c.n}. ${c.title[lang]}`));
    }
    if (tab === 'sources') this.sourcesList(content);
  }

  private patientPanel(content: HTMLElement) {
    const s = this.game.state!;
    const lang = this.lang;
    const rep = this.game.lastReport;
    el('div', 'big', content, `${CAST.ahmet.name[lang]} — ${CAST.ahmet.role[lang]}`);
    el('p', 'muted', content, lang === 'tr' ? 'Dün 13:40–16:10: KABG ×3 (LİMA-LAD, SVG-OM, SVG-RCA), pompalı. EF %45. Diyabet, hipertansiyon.' : 'Yesterday 13:40–16:10: CABG ×3 (LIMA-LAD, SVG-OM, SVG-RCA), on pump. EF 45%. Diabetes, hypertension.');
    if (!rep) {
      el('p', '', content, t('noReport', lang));
      return;
    }
    el('h3', '', content, `${t('lastReport', lang)} · ${formatClock(rep.at)}`);
    const grid = el('div', 'vitals', content);
    const cells: [string, string, string][] = [
      ['OAB / MAP', String(rep.map), rep.map < 60 ? 'bad' : rep.map < 65 ? 'warn' : ''],
      [lang === 'tr' ? 'Nabız' : 'HR', String(rep.hr), rep.hr > 115 ? 'bad' : rep.hr > 100 ? 'warn' : ''],
      ['CVP', String(rep.cvp), rep.cvp > 14 ? 'warn' : ''],
      [lang === 'tr' ? 'Dren ml/sa' : 'Drain ml/h', String(rep.drain), rep.drain > 200 ? 'bad' : rep.drain > 100 ? 'warn' : ''],
      ['Hb', rep.hb.toFixed(1), rep.hb < 8 ? 'warn' : ''],
      [lang === 'tr' ? 'Laktat' : 'Lactate', rep.lactate.toFixed(1), rep.lactate > 4 ? 'bad' : rep.lactate > 2 ? 'warn' : ''],
    ];
    for (const [k, v, cls] of cells) {
      const c = el('div', 'vital ' + cls, grid);
      el('div', 'v-k', c, k);
      el('div', 'v-v', c, v);
    }
    const p = s.patient();
    if (p.labsSent && rep.labs) el('p', '', content, rep.labs);
    if (p.echoDone && rep.echo) el('p', '', content, rep.echo);
  }

  // ---------------------------------------------------------------------------
  // Ending
  // ---------------------------------------------------------------------------
  showEnding(ending: Ending, legal: LegalResult) {
    const s = this.game.state!;
    const lang = this.lang;
    this.dlg.classList.add('hidden');
    const body = this.openModal('ending', `${t('ending', lang)}: ${ENDINGS[ending].title[lang]}`);
    body.parentElement!.querySelector('.modal-x')?.remove();
    el('p', 'ending-body', body, ENDINGS[ending].body[lang]);
    el('h3', '', body, t('outcome', lang));
    el('p', '', body, OUTCOME_LABEL[legal.outcome][lang] + (legal.unavoidable && legal.outcome !== 'recovered' ? (lang === 'tr' ? ' (önlenemez bir komplikasyon katkıda bulundu)' : ' (an unavoidable complication contributed)') : ''));
    el('h3', '', body, t('legalPath', lang));
    el('p', '', body, legal.stages.length ? legal.stages.map((st) => STAGE_LABEL[st][lang]).join(' → ') : t('none', lang));
    el('h3', '', body, t('deviationsTitle', lang));
    el('p', '', body, legal.deviations.length ? legal.deviations.map((d) => DEVIATIONS[d]?.label[lang] ?? d).join(' · ') : t('none', lang));
    el('h3', '', body, t('goodTitle', lang));
    el('p', '', body, s.data.goodPractice.length ? s.data.goodPractice.map((g) => GOOD_LABEL[g]?.[lang] ?? g).join(' · ') : t('none', lang));
    const stats = el('div', 'ending-stats', body);
    for (const k of STAT_KEYS) el('div', 'es', stats, `${STAT_LABEL[k][lang]}: ${Math.round(s.stat(k))}`);
    el('p', 'menu-disclaimer', body, t('disclaimer', lang));
    const row = el('div', 'menu-btns', body);
    button(t('playAgain', lang), 'btn primary', row, () => {
      this.closeModal();
      this.game.newGame();
    });
    button(t('mainMenu', lang), 'btn', row, () => {
      this.closeModal();
      this.game.quitToMenu();
    });
  }

  // ---------------------------------------------------------------------------
  // Touch controls
  // ---------------------------------------------------------------------------
  private buildTouch() {
    const stick = el('div', 'stick', this.touch);
    const knob = el('div', 'knob', stick);
    const look = el('div', 'look-zone', this.touch);
    const act = el('button', 'touch-act', this.touch, '✋') as HTMLButtonElement;
    act.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.interact();
    });
    let sid: number | null = null;
    let cx = 0;
    let cy = 0;
    stick.addEventListener('pointerdown', (e) => {
      sid = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const max = 50;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.game.input.stick.x = dx / max;
      this.game.input.stick.y = -dy / max;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== sid) return;
      sid = null;
      knob.style.transform = '';
      this.game.input.stick.x = 0;
      this.game.input.stick.y = 0;
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    let lid: number | null = null;
    let lx = 0;
    let ly = 0;
    look.addEventListener('pointerdown', (e) => {
      lid = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      look.setPointerCapture(e.pointerId);
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      this.game.input.addLook((e.clientX - lx) * 1.4, (e.clientY - ly) * 1.4);
      lx = e.clientX;
      ly = e.clientY;
    });
    look.addEventListener('pointerup', () => (lid = null));
  }

  setTouchVisible(on: boolean) {
    show(this.touch, on);
  }
}

const MEMORY_LABEL: Record<string, LText> = {
  dismissed: { tr: 'endişesinin geçiştirilmesi', en: 'having her concern dismissed' },
  ignored: { tr: 'cevapsız kalan çağrı', en: 'the unanswered call' },
  blamed: { tr: 'aileye suçlanması', en: 'being blamed to the family' },
  wokenAt5: { tr: 'sabah beşte uyandırılması', en: 'being woken at five' },
  snapped: { tr: 'azarlanması', en: 'being snapped at' },
  taught: { tr: 'birlikte düşünmeniz', en: 'reasoning it through together' },
  letClose: { tr: 'kapatmasına izin vermen', en: 'being allowed to close' },
  calmAtNight: { tr: 'gece sakin kalman', en: 'your calm at night' },
  leftAlone: { tr: 'gece yalnız bırakılması', en: 'being left alone at night' },
  ignoredMorning: { tr: 'sabahki sessizliğin', en: 'your silence that morning' },
  satMorning: { tr: 'sabah birlikte oturmanız', en: 'sitting together that morning' },
  notNow: { tr: '"Şimdi değil"', en: '"Not now"' },
  calledEarly: { tr: 'ameliyattan önce aranması', en: 'being called before surgery' },
  notInformed: { tr: 'haber verilmemesi', en: 'not being informed' },
  stonewalled: { tr: 'kayıtların geri çevrilmesi', en: 'being refused the records' },
  cameToConcert: { tr: 'konsere gelmen', en: 'you coming to the concert' },
  missedConcert: { tr: 'konseri kaçırman', en: 'you missing the concert' },
  skippedTimeOut: { tr: 'atlanan time-out', en: 'the skipped time-out' },
};

// Küçük DOM yardımcıları. Kullanıcı/cihaz kaynaklı metinler HER ZAMAN metin düğümü olarak eklenir
// (innerHTML kullanılmaz); böylece cihaz adlarına gömülü HTML/betik çalıştırılamaz.

import { icon } from './icons.js';

/**
 * h('button', {class: 'btn', onclick: fn, 'aria-label': 'x'}, 'metin', h('span'))
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') throw new Error('html prop is not allowed');
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function ic(name, cls) {
  const span = document.createElement('span');
  span.className = cls || 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.style.display = 'contents';
  span.innerHTML = icon(name); // yalnızca sabit, güvenilir SVG
  return span;
}

/** replaceChildren'ın null/false/dizi güvenli sürümü (null'ı "null" metnine çevirmez). */
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ---------- canlı bölgeler ----------
// Bir varlığın durumu değiştiğinde yalnızca o varlığa bağlı DOM parçaları yeniden çizilir.

const liveByEntity = new Map(); // entityId -> Set<{el, render}>
const liveAny = new Set();

export function live(entityId, render) {
  let el = render();
  const rec = { el, render };
  if (!liveByEntity.has(entityId)) liveByEntity.set(entityId, new Set());
  liveByEntity.get(entityId).add(rec);
  return el;
}

/** Herhangi bir değişiklikte (kısıtlanarak) yeniden çizilen bölge. */
export function liveSummary(render) {
  const rec = { el: render(), render };
  liveAny.add(rec);
  return rec.el;
}

function replace(rec) {
  if (!rec.el.isConnected) return false;
  const next = rec.render();
  const active = document.activeElement;
  const hadFocus = active && rec.el.contains(active);
  rec.el.replaceWith(next);
  rec.el = next;
  if (hadFocus) {
    const target = next.querySelector('[data-focus-key="' + (active.dataset.focusKey || '') + '"]');
    if (target) target.focus();
  }
  return true;
}

let summaryQueued = false;
export function notifyEntityChanged(entityId) {
  const set = liveByEntity.get(entityId);
  if (set) {
    for (const rec of [...set]) {
      if (!replace(rec)) set.delete(rec);
    }
  }
  if (!summaryQueued) {
    summaryQueued = true;
    requestAnimationFrame(() => {
      summaryQueued = false;
      for (const rec of [...liveAny]) if (!replace(rec)) liveAny.delete(rec);
    });
  }
}

export function resetLive() {
  liveByEntity.clear();
  liveAny.clear();
}

// ---------- alt sayfa, onay, bildirim ----------

export function openSheet(title, content, { onClose, label } = {}) {
  const prevFocus = document.activeElement;
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Pencere' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, title ? h('h3', { style: { flex: 1 } }, title) : h('div', { style: { flex: 1 } }), h('button', { class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => close() }, ic('x'))),
    content,
  );
  const scrim = h('div', { class: 'scrim', onclick: (e) => e.target === scrim && close() }, sheet);
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  const first = sheet.querySelector('input, select, textarea, button:not([aria-label="Kapat"])');
  (first || sheet.querySelector('button')).focus();
  return { close, sheet };
}

/** Hassas işlemler için açık onay. resolve(true|false) */
export function confirmDialog({ title, message, confirmText = 'Onayla', danger = false, requireHoldMs = 0, extra = null }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      sheetRef.close();
      resolve(v);
    };
    const confirmBtn = h('button', { class: `btn block ${danger ? 'danger' : 'primary'}` }, confirmText);
    if (requireHoldMs > 0) {
      // Yanlışlıkla dokunmayı önlemek için basılı tutma: tutma süresi dolmadan bırakılırsa işlem yapılmaz.
      let timer = null;
      const label = confirmText;
      confirmBtn.textContent = `${label} (basılı tutun)`;
      const start = (e) => {
        e.preventDefault();
        confirmBtn.textContent = 'Tutmaya devam edin…';
        timer = setTimeout(() => finish(true), requireHoldMs);
      };
      const stop = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (!done) confirmBtn.textContent = `${label} (basılı tutun)`;
      };
      confirmBtn.addEventListener('pointerdown', start);
      confirmBtn.addEventListener('pointerup', stop);
      confirmBtn.addEventListener('pointerleave', stop);
      confirmBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (!timer) start(e);
        }
      });
      confirmBtn.addEventListener('keyup', stop);
    } else {
      confirmBtn.addEventListener('click', () => finish(true));
    }
    const sheetRef = openSheet(
      title,
      h('div', null, h('p', { style: { marginTop: 0 } }, message), extra, h('div', { class: 'row-actions', style: { marginTop: '16px' } }, h('button', { class: 'btn', onclick: () => finish(false) }, 'Vazgeç'), confirmBtn)),
      { onClose: () => finish(false) },
    );
  });
}

let toastTimer = null;
export function toast(text, ms = 3200) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, text);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/** Kullanıcıya anlaşılır hata + isteğe bağlı teknik ayrıntı. */
export function errorBox(err) {
  const msg = (err && err.userMessage) || 'Beklenmeyen bir hata oluştu.';
  const details = err && err.details;
  return h('div', { class: 'error-box', role: 'alert' }, msg, details ? h('details', { class: 'tech' }, h('summary', null, 'Teknik ayrıntılar'), h('pre', null, details)) : null);
}

export function section(title, content, action) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, title), action || null), content);
}

export function topbar(title, { back, actions = [] } = {}) {
  return h(
    'header',
    { class: `topbar${back ? ' sub' : ''}` },
    back ? h('button', { class: 'icon-btn plain', 'aria-label': 'Geri', onclick: () => (typeof back === 'function' ? back() : history.back()) }, ic('back')) : null,
    h('h1', null, title),
    ...(actions.length ? actions : back ? [h('span', { style: { width: '44px' } })] : []),
  );
}

export function toggleSwitch({ checked, label, onchange, disabled }) {
  const b = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': label, disabled });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onchange(!(b.getAttribute('aria-checked') === 'true'));
  });
  return b;
}

export function segmented(options, value, onchange, label) {
  return h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', { 'aria-pressed': String(v === value), onclick: () => onchange(v), type: 'button' }, text)),
  );
}

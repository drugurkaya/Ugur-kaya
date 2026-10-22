// Cihaz döşemeleri ve kontrolleri. Yalnızca varlığın GERÇEKTEN desteklediği yetenekler için kontrol
// üretilir (capabilitiesFor). Komut durumu üç aşamalı gösterilir: gönderildi / kabul edildi / doğrulandı.

import { h, ic, live, notifyEntityChanged, confirmDialog, openSheet, segmented } from './dom.js';
import { stateText, iconFor, relativeTime, num, HVAC_LABELS } from '../core/format.js';
import { CONNECTIVITY_LABELS, isActive } from '../core/model.js';
import { CommandPhase, PHASE_LABELS } from '../core/commands.js';

// ---------- komut çalıştırma (hassas cihaz onayı dahil) ----------

const SENSITIVE_SERVICES = {
  lock: { unlock: 'Kilidi aç', open: 'Kapıyı aç (mandal)' },
  alarm_control_panel: { alarm_disarm: 'Alarmı devre dışı bırak' },
  cover: { open_cover: 'Aç', set_cover_position: 'Konuma getir' },
  valve: { open_valve: 'Aç', set_valve_position: 'Konuma getir' },
};

async function askCode(entity) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', type: 'password', inputmode: entity.attributes.code_format === 'number' ? 'numeric' : 'text', autocomplete: 'off', 'aria-label': 'Kod' });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      ref.close();
      resolve(v);
    };
    const ref = openSheet(
      `${entity.name}: kod gerekli`,
      h(
        'form',
        { onsubmit: (e) => (e.preventDefault(), finish(input.value)) },
        h('p', { class: 'hint', style: { marginTop: 0 } }, 'Kod doğrudan Home Assistant\'a gönderilir ve orada doğrulanır; uygulamada saklanmaz.'),
        h('div', { class: 'field' }, input),
        h('button', { class: 'btn primary block', type: 'submit' }, 'Gönder'),
      ),
      { onClose: () => finish(null) },
    );
  });
}

export async function runCommand(app, entity, service, data = {}) {
  const sensitiveLabel = entity.sensitive && SENSITIVE_SERVICES[entity.domain] && SENSITIVE_SERVICES[entity.domain][service];
  if (sensitiveLabel) {
    const ok = await confirmDialog({
      title: `${entity.name}`,
      message: `"${sensitiveLabel}" güvenlik açısından hassas bir işlemdir. Devam etmek için düğmeyi basılı tutun.`,
      confirmText: sensitiveLabel,
      danger: true,
      requireHoldMs: 900,
    });
    if (!ok) return null;
  }
  const payload = { ...data };
  if ((entity.domain === 'lock' || entity.domain === 'alarm_control_panel') && entity.attributes.code_format) {
    const code = await askCode(entity);
    if (code == null || code === '') return null;
    payload.code = code;
  }
  app.phases.set(entity.id, { phase: CommandPhase.SENDING, service, at: Date.now() });
  notifyEntityChanged(entity.id);
  const result = await app.store.commands.run({ entityId: entity.id, service, data: payload }, (u) => {
    app.phases.set(entity.id, { ...u, service, at: Date.now() });
    notifyEntityChanged(entity.id);
  });
  // Başarılı doğrulama birkaç saniye sonra ekrandan kalkar; hata ve doğrulanamayan durumlar kalır.
  if (result.phase === CommandPhase.CONFIRMED) {
    setTimeout(() => {
      const p = app.phases.get(entity.id);
      if (p && p.phase === CommandPhase.CONFIRMED) {
        app.phases.delete(entity.id);
        notifyEntityChanged(entity.id);
      }
    }, 2500);
  }
  return result;
}

export function phaseLine(p) {
  if (!p) return null;
  const busy = [CommandPhase.SENDING, CommandPhase.ACCEPTED, CommandPhase.IN_PROGRESS].includes(p.phase);
  return h(
    'div',
    { class: `phase-line ${p.phase}`, role: 'status', 'aria-live': 'polite' },
    busy ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : ic(p.phase === 'confirmed' ? 'check' : p.phase === 'unverifiable' ? 'info' : 'alert'),
    h('span', null, PHASE_LABELS[p.phase] || p.phase, p.error && p.error.userMessage ? ` — ${p.error.userMessage}` : ''),
  );
}

// ---------- rozetler ----------

export function badges(entity, { full = false } = {}) {
  const out = [];
  if (entity.availability === 'offline') out.push(h('span', { class: 'badge off' }, 'Çevrim dışı'));
  if (entity.simulated) out.push(h('span', { class: 'badge sim', title: 'Home Assistant demo entegrasyonu — gerçek cihaz değildir' }, 'SİMÜLASYON'));
  if (full) {
    const c = entity.connectivity;
    const cls = c === 'local' ? 'local' : c === 'cloud' || c === 'hybrid' ? 'cloud' : 'neutral';
    if (!entity.simulated) out.push(h('span', { class: `badge ${cls}` }, CONNECTIVITY_LABELS[c] || 'Henüz doğrulanmadı'));
    if (entity.assumedState) out.push(h('span', { class: 'badge neutral', title: 'Cihaz gerçek durumunu bildirmiyor' }, 'Durum varsayılıyor'));
    if (entity.sensitive) out.push(h('span', { class: 'badge neutral' }, ic('shield'), 'Hassas'));
  }
  return out;
}

// ---------- döşeme ----------

const QUICK_TOGGLE = new Set(['light', 'switch', 'fan', 'humidifier', 'siren']);

export function deviceTile(app, entityId) {
  return live(entityId, () => {
    const e = app.store.home.entities.get(entityId);
    if (!e) return h('div', { class: 'tile offline' }, h('div', { class: 'name' }, entityId), h('div', { class: 'st' }, 'Bulunamadı'));
    const on = isActive({ entity_id: e.id, state: e.state });
    const offline = e.availability === 'offline';
    const p = app.phases.get(e.id);
    const canQuick = !offline && QUICK_TOGGLE.has(e.domain) && e.capabilities.includes('on_off');
    const busy = p && [CommandPhase.SENDING, CommandPhase.ACCEPTED, CommandPhase.IN_PROGRESS].includes(p.phase);
    const iconEl = canQuick
      ? h(
          'button',
          {
            class: 'ic',
            'aria-label': `${e.name}: ${on ? 'kapat' : 'aç'}`,
            'aria-pressed': String(on),
            'data-focus-key': `q-${e.id}`,
            onclick: (ev) => {
              ev.stopPropagation();
              if (!busy) runCommand(app, e, on ? 'turn_off' : 'turn_on');
            },
          },
          ic(iconFor(e)),
        )
      : h('span', { class: 'ic', 'aria-hidden': 'true' }, ic(iconFor(e)));
    let status = stateText(e);
    if (p && busy) status = p.phase === CommandPhase.SENDING ? 'Gönderiliyor…' : 'Doğrulanıyor…';
    else if (p && (p.phase === 'failed' || p.phase === 'unconfirmed')) status = p.phase === 'failed' ? 'Komut başarısız' : 'Doğrulanamadı';
    return h(
      'div',
      {
        class: `tile${on ? ' on' : ''}${offline ? ' offline' : ''}`,
        role: 'group',
        'aria-label': `${e.name}, ${stateText(e)}`,
        'data-entity': e.id,
      },
      h('div', { class: 'tile-top' }, iconEl, h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } }, badges(e))),
      h(
        'a',
        { href: `#/device/${encodeURIComponent(e.id)}`, style: { color: 'inherit', textDecoration: 'none', display: 'block', minHeight: '44px', paddingTop: '6px' }, 'data-focus-key': `t-${e.id}` },
        h('div', { class: 'name' }, e.name),
        h('div', { class: 'st' }, busy ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null, status),
      ),
    );
  });
}

export function tilesFor(app, entityIds) {
  return h('div', { class: 'tiles' }, entityIds.map((id) => deviceTile(app, id)));
}

// ---------- ayrıntılı kontroller ----------

function slider({ label, min, max, step = 1, value, unit = '', onCommit, key }) {
  const out = h('output', null, `${value}${unit}`);
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label, 'data-focus-key': key });
  input.addEventListener('input', () => (out.textContent = `${input.value}${unit}`));
  input.addEventListener('change', () => onCommit(Number(input.value)));
  return h('div', { class: 'control' }, h('label', null, label), h('div', { class: 'slider-row' }, input, out));
}

function stepper({ label, value, step = 0.5, min, max, unit = '°', onCommit }) {
  let v = Number(value);
  const out = h('div', { style: { fontSize: '34px', fontWeight: 750, minWidth: '110px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }, 'aria-live': 'polite' }, `${num(v)}${unit}`);
  let timer = null;
  const change = (d) => {
    v = Math.min(max ?? 99, Math.max(min ?? -99, Math.round((v + d) / step) * step));
    out.textContent = `${num(v)}${unit}`;
    clearTimeout(timer);
    timer = setTimeout(() => onCommit(v), 700); // ardışık dokunuşlar tek komutta birleştirilir
  };
  return h(
    'div',
    { class: 'control' },
    h('label', null, label),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px' } }, h('button', { class: 'icon-btn', 'aria-label': `${label} azalt`, onclick: () => change(-step) }, ic('down')), out, h('button', { class: 'icon-btn', 'aria-label': `${label} artır`, onclick: () => change(step) }, ic('up'))),
  );
}

function selectControl({ label, options, value, onCommit }) {
  const sel = h('select', { class: 'input', 'aria-label': label }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  sel.addEventListener('change', () => onCommit(sel.value));
  return h('div', { class: 'control' }, h('label', null, label), sel);
}

export function deviceControls(app, e) {
  const caps = e.capabilities;
  const a = e.attributes;
  const run = (service, data) => runCommand(app, e, service, data);
  const parts = [];
  if (e.availability === 'offline') {
    return h('div', { class: 'warn-box' }, 'Cihaz çevrim dışı olduğu için kontroller devre dışı. Cihazın elektriğini ve ağ bağlantısını kontrol edin.');
  }
  const on = isActive({ entity_id: e.id, state: e.state });

  switch (e.domain) {
    case 'light':
    case 'switch':
    case 'fan':
    case 'humidifier':
    case 'siren':
      if (caps.includes('on_off'))
        parts.push(h('button', { class: `big-toggle${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => run(on ? 'turn_off' : 'turn_on') }, on ? 'Açık — kapatmak için dokunun' : 'Kapalı — açmak için dokunun'));
      if (caps.includes('brightness')) {
        const pct = a.brightness != null ? Math.round((a.brightness / 255) * 100) : 0;
        parts.push(slider({ label: 'Parlaklık', min: 1, max: 100, value: pct || 1, unit: '%', key: 'bri', onCommit: (v) => run('turn_on', { brightness_pct: v }) }));
      }
      if (caps.includes('color_temp') && a.min_color_temp_kelvin && a.max_color_temp_kelvin) {
        parts.push(slider({ label: 'Renk sıcaklığı', min: a.min_color_temp_kelvin, max: a.max_color_temp_kelvin, step: 50, value: a.color_temp_kelvin || a.min_color_temp_kelvin, unit: 'K', key: 'ct', onCommit: (v) => run('turn_on', { color_temp_kelvin: v }) }));
      }
      if (caps.includes('color')) {
        const hue = Array.isArray(a.hs_color) ? Math.round(a.hs_color[0]) : 0;
        parts.push(slider({ label: 'Renk tonu', min: 0, max: 359, value: hue, unit: '°', key: 'hue', onCommit: (v) => run('turn_on', { hs_color: [v, 100] }) }));
      }
      if (caps.includes('fan_speed')) parts.push(slider({ label: 'Hız', min: 0, max: 100, step: a.percentage_step || 1, value: a.percentage || 0, unit: '%', key: 'spd', onCommit: (v) => run('set_percentage', { percentage: v }) }));
      if (caps.includes('preset_mode') && e.domain === 'fan') parts.push(selectControl({ label: 'Mod', options: [['', '—'], ...a.preset_modes.map((m) => [m, m])], value: a.preset_mode || '', onCommit: (v) => v && run('set_preset_mode', { preset_mode: v }) }));
      if (caps.includes('oscillate')) parts.push(h('div', { class: 'control' }, h('button', { class: 'btn block', onclick: () => run('oscillate', { oscillating: !a.oscillating }) }, a.oscillating ? 'Salınımı durdur' : 'Salınımı başlat')));
      break;
    case 'cover':
    case 'valve': {
      const sfx = e.domain === 'cover' ? 'cover' : 'valve';
      const btns = [];
      if (caps.includes('open')) btns.push(h('button', { class: 'btn', onclick: () => run(`open_${sfx}`) }, ic('up'), 'Aç'));
      if (caps.includes('stop')) btns.push(h('button', { class: 'btn', onclick: () => run(`stop_${sfx}`) }, ic('stop'), 'Durdur'));
      if (caps.includes('close')) btns.push(h('button', { class: 'btn', onclick: () => run(`close_${sfx}`) }, ic('down'), 'Kapat'));
      parts.push(h('div', { class: 'row-actions' }, btns));
      if (caps.includes('position')) parts.push(slider({ label: 'Konum', min: 0, max: 100, value: a.current_position ?? 0, unit: '%', key: 'pos', onCommit: (v) => run(`set_${sfx}_position`, { position: v }) }));
      break;
    }
    case 'lock': {
      const locked = e.state === 'locked';
      parts.push(
        h('div', { class: 'row-actions' }, h('button', { class: 'btn primary', disabled: locked, onclick: () => run('lock') }, ic('lock'), 'Kilitle'), h('button', { class: 'btn danger', disabled: e.state === 'unlocked', onclick: () => run('unlock') }, ic('unlock'), 'Kilidi aç')),
      );
      if (caps.includes('open_latch')) parts.push(h('div', { class: 'control' }, h('button', { class: 'btn danger block', onclick: () => run('open') }, 'Kapıyı aç (mandal)')));
      if (e.state === 'jammed') parts.push(h('div', { class: 'error-box' }, 'Kilit sıkıştı. Kapıyı fiziksel olarak kontrol edin.'));
      break;
    }
    case 'alarm_control_panel': {
      const modes = [
        ['arm_home', 'alarm_arm_home', 'Evde'],
        ['arm_away', 'alarm_arm_away', 'Dışarıda'],
        ['arm_night', 'alarm_arm_night', 'Gece'],
        ['arm_vacation', 'alarm_arm_vacation', 'Tatil'],
      ].filter(([cap]) => caps.includes(cap));
      parts.push(h('div', { class: 'row-actions' }, modes.map(([, svc, label]) => h('button', { class: 'btn', onclick: () => run(svc) }, ic('shield'), `${label} modunda kur`))));
      parts.push(h('div', { class: 'control' }, h('button', { class: 'btn danger block', disabled: e.state === 'disarmed', onclick: () => run('alarm_disarm') }, 'Devre dışı bırak')));
      break;
    }
    case 'climate': {
      if (caps.includes('hvac_mode')) parts.push(h('div', { class: 'control' }, h('label', null, 'Mod'), segmented(a.hvac_modes.map((m) => [m, HVAC_LABELS[m] || m]), e.state, (m) => run('set_hvac_mode', { hvac_mode: m }), 'Mod')));
      if (caps.includes('target_temperature') && a.temperature != null) parts.push(stepper({ label: 'Hedef sıcaklık', value: a.temperature, step: a.target_temp_step || 0.5, min: a.min_temp, max: a.max_temp, onCommit: (v) => run('set_temperature', { temperature: v }) }));
      if (caps.includes('preset_mode')) parts.push(selectControl({ label: 'Ön ayar', options: a.preset_modes.map((m) => [m, m]), value: a.preset_mode, onCommit: (v) => run('set_preset_mode', { preset_mode: v }) }));
      if (caps.includes('fan_mode')) parts.push(selectControl({ label: 'Fan', options: a.fan_modes.map((m) => [m, m]), value: a.fan_mode, onCommit: (v) => run('set_fan_mode', { fan_mode: v }) }));
      break;
    }
    case 'water_heater':
      if (caps.includes('target_temperature') && a.temperature != null) parts.push(stepper({ label: 'Hedef sıcaklık', value: a.temperature, step: 1, min: a.min_temp, max: a.max_temp, onCommit: (v) => run('set_temperature', { temperature: v }) }));
      if (caps.includes('operation_mode')) parts.push(selectControl({ label: 'Çalışma modu', options: a.operation_list.map((m) => [m, m]), value: a.operation_mode, onCommit: (v) => run('set_operation_mode', { operation_mode: v }) }));
      break;
    case 'media_player':
      if (caps.includes('on_off')) parts.push(h('button', { class: `big-toggle${on ? ' on' : ''}`, onclick: () => run(e.state === 'off' ? 'turn_on' : 'turn_off') }, e.state === 'off' ? 'Aç' : 'Kapat'));
      if (caps.includes('play_pause')) parts.push(h('div', { class: 'control' }, h('button', { class: 'btn block', onclick: () => run('media_play_pause') }, e.state === 'playing' ? 'Duraklat' : 'Oynat')));
      if (caps.includes('volume') && a.volume_level != null) parts.push(slider({ label: 'Ses', min: 0, max: 100, value: Math.round(a.volume_level * 100), unit: '%', key: 'vol', onCommit: (v) => run('volume_set', { volume_level: v / 100 }) }));
      break;
    case 'vacuum':
      parts.push(h('div', { class: 'row-actions' }, caps.includes('start') ? h('button', { class: 'btn', onclick: () => run('start') }, 'Başlat') : null, caps.includes('stop') ? h('button', { class: 'btn', onclick: () => run('stop') }, 'Durdur') : null, caps.includes('return_home') ? h('button', { class: 'btn', onclick: () => run('return_to_base') }, 'İstasyona dön') : null));
      break;
    case 'button':
      parts.push(h('button', { class: 'big-toggle', onclick: () => run('press') }, 'Bas'));
      break;
    default:
      break;
  }
  if (!parts.length) {
    if (e.controllable) parts.push(h('div', { class: 'info-box' }, 'Bu cihaz türü için uygulamada kontrol henüz bulunmuyor. Home Assistant arayüzünden kontrol edebilirsiniz.'));
    else parts.push(h('div', { class: 'info-box' }, 'Bu bir sensördür; yalnızca okunur.'));
  }
  return h('div', null, parts);
}

/** Bir cihaza ait sensör değerleri (aynı cihaz kaydındaki diğer varlıklar). */
export function sensorList(app, entityIds) {
  if (!entityIds.length) return null;
  return h(
    'div',
    { class: 'list' },
    entityIds.map((id) =>
      live(id, () => {
        const s = app.store.home.entities.get(id);
        if (!s) return h('div', { class: 'item' }, id);
        return h(
          'a',
          { class: 'item', href: `#/device/${encodeURIComponent(id)}`, style: { color: 'inherit', textDecoration: 'none' } },
          h('span', { class: 'ic', style: { color: 'var(--text-2)', width: '24px', height: '24px', display: 'grid', placeItems: 'center' } }, ic(iconFor(s))),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, s.name), h('div', { class: 'meta' }, `Güncelleme: ${relativeTime(s.lastUpdated)}`)),
          h('div', { style: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, stateText(s)),
        );
      }),
    ),
  );
}

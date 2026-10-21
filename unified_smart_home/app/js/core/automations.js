// Otomasyon oluşturucu: teknik bilgi gerektirmeyen bir modelden Home Assistant otomasyon
// yapılandırması üretir (ve geri okur). Otomasyonları ÇALIŞTIRAN motor Home Assistant'tır;
// böylece telefon kapalıyken, internet yokken ve yeniden başlatmadan sonra da çalışmaya devam ederler.
//
// Belge: https://www.home-assistant.io/docs/automation/yaml/

import { isSensitive } from './model.js';

export const BUILDER_VERSION = 1;

export const WEEKDAYS = [
  ['mon', 'Pzt'],
  ['tue', 'Sal'],
  ['wed', 'Çar'],
  ['thu', 'Per'],
  ['fri', 'Cum'],
  ['sat', 'Cmt'],
  ['sun', 'Paz'],
];

// Güvenlik: bu servisler otomasyon ve senaryolarda KULLANILAMAZ; yalnızca kullanıcının açık
// eylemiyle ve onayla cihaz ekranından çalıştırılabilir. (Kilitlemek/kurmak serbesttir.)
const BLOCKED_SERVICES = new Set(['lock.unlock', 'lock.open', 'alarm_control_panel.alarm_disarm']);

export function isBlockedAction(entityState, service) {
  if (!entityState) return false;
  const domain = entityState.entity_id.split('.')[0];
  const full = `${domain}.${service}`;
  if (BLOCKED_SERVICES.has(full)) return true;
  if ((domain === 'cover' || domain === 'valve') && isSensitive(entityState) && /^open|set_.*position/.test(service)) return true;
  return false;
}

// ---------------- yardımcılar ----------------

function pad(n) {
  return String(n).padStart(2, '0');
}

export function durationToHa(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export function durationFromHa(d) {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  if (typeof d === 'string') {
    const parts = d.split(':').map(Number);
    if (parts.some((x) => Number.isNaN(x))) return null;
    while (parts.length < 3) parts.unshift(0);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return (d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0) + (d.days || 0) * 86400;
}

function offsetString(minutes) {
  const m = Math.round(Number(minutes) || 0);
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}:00`;
}

function normTime(t) {
  if (typeof t !== 'string' || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
  const [h, m, s = '00'] = t.split(':');
  if (Number(h) > 23 || Number(m) > 59 || Number(s) > 59) return null;
  return `${pad(h)}:${m}:${s}`;
}

export function slugify(text) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  return (
    String(text || '')
      .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => map[c])
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'otomasyon'
  );
}

export function newId(prefix = 'ush') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

// ---------------- doğrulama ----------------

/**
 * @returns {string[]} Türkçe hata listesi (boşsa geçerli)
 */
export function validateAutomation(b, getState) {
  const errors = [];
  if (!b.alias || !String(b.alias).trim()) errors.push('Otomasyon adı boş olamaz.');
  if (String(b.alias || '').length > 100) errors.push('Otomasyon adı en fazla 100 karakter olabilir.');
  if (!b.triggers || !b.triggers.length) errors.push('En az bir tetikleyici seçin.');
  if (!b.actions || !b.actions.length) errors.push('En az bir işlem ekleyin.');
  const checkEntity = (id, where) => {
    if (!id) {
      errors.push(`${where}: cihaz seçilmedi.`);
      return null;
    }
    const st = getState(id);
    if (!st) errors.push(`${where}: "${id}" bulunamadı.`);
    return st;
  };
  (b.triggers || []).forEach((t, i) => {
    const where = `Tetikleyici ${i + 1}`;
    if (t.kind === 'time') {
      if (!normTime(t.at)) errors.push(`${where}: saat SS:DD biçiminde olmalı.`);
    } else if (t.kind === 'sun') {
      if (!['sunrise', 'sunset'].includes(t.event)) errors.push(`${where}: gün doğumu veya gün batımı seçin.`);
      if (Math.abs(Number(t.offsetMin) || 0) > 240) errors.push(`${where}: sapma en fazla ±240 dakika olabilir.`);
    } else if (t.kind === 'state') {
      checkEntity(t.entityId, where);
      if (t.to == null || t.to === '') errors.push(`${where}: hedef durum seçin.`);
    } else if (t.kind === 'numeric') {
      checkEntity(t.entityId, where);
      if (t.above == null && t.below == null) errors.push(`${where}: üst veya alt sınır girin.`);
      if (t.above != null && t.below != null && Number(t.above) >= Number(t.below))
        errors.push(`${where}: alt sınır üst sınırdan küçük olmalı.`);
    } else errors.push(`${where}: bilinmeyen tetikleyici türü.`);
  });
  (b.conditions || []).forEach((c, i) => {
    const where = `Koşul ${i + 1}`;
    if (c.kind === 'time') {
      if (c.after && !normTime(c.after)) errors.push(`${where}: başlangıç saati geçersiz.`);
      if (c.before && !normTime(c.before)) errors.push(`${where}: bitiş saati geçersiz.`);
      if (!c.after && !c.before && !(c.weekdays && c.weekdays.length)) errors.push(`${where}: saat aralığı veya gün seçin.`);
    } else if (c.kind === 'state') {
      checkEntity(c.entityId, where);
      if (c.state == null || c.state === '') errors.push(`${where}: durum seçin.`);
    } else if (c.kind === 'numeric') {
      checkEntity(c.entityId, where);
      if (c.above == null && c.below == null) errors.push(`${where}: üst veya alt sınır girin.`);
    } else if (c.kind === 'sun') {
      if (!['night', 'day'].includes(c.when)) errors.push(`${where}: gece veya gündüz seçin.`);
    } else errors.push(`${where}: bilinmeyen koşul türü.`);
  });
  (b.actions || []).forEach((a, i) => {
    const where = `İşlem ${i + 1}`;
    if (a.kind === 'service') {
      const st = checkEntity(a.entityId, where);
      if (!a.service) errors.push(`${where}: komut seçin.`);
      if (st && isBlockedAction(st, a.service))
        errors.push(`${where}: güvenlik nedeniyle "${st.attributes.friendly_name || a.entityId}" için bu komut otomasyonda kullanılamaz.`);
      if (a.data && a.data.brightness_pct != null && (a.data.brightness_pct < 1 || a.data.brightness_pct > 100))
        errors.push(`${where}: parlaklık 1-100 arasında olmalı.`);
    } else if (a.kind === 'delay') {
      if (!(Number(a.seconds) > 0) || Number(a.seconds) > 86400) errors.push(`${where}: bekleme 1 sn ile 24 saat arasında olmalı.`);
    } else if (a.kind === 'notify') {
      if (!a.message || !String(a.message).trim()) errors.push(`${where}: bildirim metni boş olamaz.`);
      if (a.target && !/^mobile_app_[a-z0-9_]+$|^notify$/.test(a.target)) errors.push(`${where}: bildirim hedefi geçersiz.`);
    } else if (a.kind === 'wait_state') {
      checkEntity(a.entityId, where);
      if (!(Number(a.timeoutSec) > 0)) errors.push(`${where}: zaman aşımı girin.`);
    } else errors.push(`${where}: bilinmeyen işlem türü.`);
  });
  return errors;
}

// ---------------- model -> HA yapılandırması ----------------

function triggerToHa(t) {
  switch (t.kind) {
    case 'time':
      return { trigger: 'time', at: normTime(t.at) };
    case 'sun': {
      const out = { trigger: 'sun', event: t.event };
      if (Number(t.offsetMin)) out.offset = offsetString(t.offsetMin);
      return out;
    }
    case 'state': {
      const out = { trigger: 'state', entity_id: t.entityId, to: String(t.to) };
      if (t.from != null && t.from !== '') out.from = String(t.from);
      if (Number(t.forSec) > 0) out.for = durationToHa(t.forSec);
      return out;
    }
    case 'numeric': {
      const out = { trigger: 'numeric_state', entity_id: t.entityId };
      if (t.above != null && t.above !== '') out.above = Number(t.above);
      if (t.below != null && t.below !== '') out.below = Number(t.below);
      if (Number(t.forSec) > 0) out.for = durationToHa(t.forSec);
      return out;
    }
    default:
      throw new Error(`unknown trigger ${t.kind}`);
  }
}

function conditionToHa(c) {
  switch (c.kind) {
    case 'time': {
      const out = { condition: 'time' };
      if (c.after) out.after = normTime(c.after);
      if (c.before) out.before = normTime(c.before);
      if (c.weekdays && c.weekdays.length) out.weekday = [...c.weekdays];
      return out;
    }
    case 'state':
      return { condition: 'state', entity_id: c.entityId, state: String(c.state) };
    case 'numeric': {
      const out = { condition: 'numeric_state', entity_id: c.entityId };
      if (c.above != null && c.above !== '') out.above = Number(c.above);
      if (c.below != null && c.below !== '') out.below = Number(c.below);
      return out;
    }
    case 'sun':
      return c.when === 'night'
        ? { condition: 'sun', after: 'sunset', before: 'sunrise' }
        : { condition: 'sun', after: 'sunrise', before: 'sunset' };
    default:
      throw new Error(`unknown condition ${c.kind}`);
  }
}

function actionToHa(a) {
  switch (a.kind) {
    case 'service': {
      const domain = a.entityId.split('.')[0];
      const out = { action: `${domain}.${a.service}`, target: { entity_id: a.entityId } };
      if (a.data && Object.keys(a.data).length) out.data = { ...a.data };
      // Bir cihaz yanıt vermezse sonraki işlemler yine çalışsın; hata HA iz kaydına düşer.
      out.continue_on_error = true;
      return out;
    }
    case 'delay':
      return { delay: durationToHa(a.seconds) };
    case 'notify': {
      const title = a.title ? String(a.title) : 'Akıllı Ev';
      if (a.target && a.target !== 'notify') {
        return { action: `notify.${a.target}`, data: { title, message: String(a.message) }, continue_on_error: true };
      }
      return { action: 'persistent_notification.create', data: { title, message: String(a.message) } };
    }
    case 'wait_state':
      return {
        wait_for_trigger: [
          {
            trigger: 'state',
            entity_id: a.entityId,
            to: String(a.state),
            ...(Number(a.forSec) > 0 ? { for: durationToHa(a.forSec) } : {}),
          },
        ],
        timeout: durationToHa(a.timeoutSec),
        continue_on_timeout: a.continueOnTimeout !== false,
      };
    default:
      throw new Error(`unknown action ${a.kind}`);
  }
}

export function toHaConfig(b) {
  const mode = ['single', 'restart', 'queued', 'parallel'].includes(b.mode) ? b.mode : 'single';
  const cfg = {
    id: b.id,
    alias: String(b.alias).trim(),
    description: b.description ? String(b.description) : '',
    mode,
    triggers: b.triggers.map(triggerToHa),
    conditions: (b.conditions || []).map(conditionToHa),
    actions: b.actions.map(actionToHa),
    variables: { ush_builder_version: BUILDER_VERSION, ush_revision: (Number(b.revision) || 0) + 1 },
  };
  // Aynı tetikleyici art arda gelirse çakışan çalışmalar sessizce yok sayılır (single) ya da
  // en sonuncusu öncekini iptal eder (restart, ör. hareket algılandıkça süreyi uzatmak için).
  if (mode === 'single') cfg.max_exceeded = 'silent';
  if (mode === 'queued') cfg.max = 5;
  return cfg;
}

// ---------------- HA yapılandırması -> model ----------------

const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

function single(entityId) {
  const l = asList(entityId);
  return l.length === 1 && typeof l[0] === 'string' ? l[0] : null;
}

function triggerFromHa(t) {
  const kind = t.trigger || t.platform;
  if (kind === 'time' && typeof t.at === 'string' && normTime(t.at)) return { kind: 'time', at: t.at.slice(0, 5) };
  if (kind === 'sun') return { kind: 'sun', event: t.event, offsetMin: Math.round((durationFromHa(String(t.offset || '0:0:0').replace('-', '')) || 0) / 60) * (String(t.offset || '').startsWith('-') ? -1 : 1) };
  if (kind === 'state' && single(t.entity_id) && t.to != null && !Array.isArray(t.to) && !t.attribute)
    return { kind: 'state', entityId: single(t.entity_id), to: t.to, from: t.from ?? '', forSec: durationFromHa(t.for) || 0 };
  if (kind === 'numeric_state' && single(t.entity_id) && !t.attribute && !t.value_template)
    return { kind: 'numeric', entityId: single(t.entity_id), above: t.above ?? null, below: t.below ?? null, forSec: durationFromHa(t.for) || 0 };
  return null;
}

function conditionFromHa(c) {
  if (c.condition === 'time' && !c.after?.includes?.('.') && !c.before?.includes?.('.'))
    return { kind: 'time', after: c.after ? c.after.slice(0, 5) : '', before: c.before ? c.before.slice(0, 5) : '', weekdays: asList(c.weekday) };
  if (c.condition === 'state' && single(c.entity_id) && !Array.isArray(c.state) && !c.attribute) return { kind: 'state', entityId: single(c.entity_id), state: c.state };
  if (c.condition === 'numeric_state' && single(c.entity_id) && !c.attribute) return { kind: 'numeric', entityId: single(c.entity_id), above: c.above ?? null, below: c.below ?? null };
  if (c.condition === 'sun' && c.after === 'sunset' && c.before === 'sunrise') return { kind: 'sun', when: 'night' };
  if (c.condition === 'sun' && c.after === 'sunrise' && c.before === 'sunset') return { kind: 'sun', when: 'day' };
  return null;
}

function actionFromHa(a) {
  const svc = a.action || a.service;
  if (svc === 'persistent_notification.create') return { kind: 'notify', title: a.data?.title || '', message: a.data?.message || '', target: 'notify' };
  if (svc && svc.startsWith('notify.')) return { kind: 'notify', title: a.data?.title || '', message: a.data?.message || '', target: svc.slice(7) };
  if (svc) {
    const eid = single(a.target?.entity_id ?? a.entity_id ?? a.data?.entity_id);
    if (!eid) return null;
    const [domain, service] = svc.split('.');
    if (eid.split('.')[0] !== domain) return null;
    const data = { ...(a.data || {}) };
    delete data.entity_id;
    return { kind: 'service', entityId: eid, service, data };
  }
  if (a.delay != null) {
    const s = durationFromHa(a.delay);
    return s ? { kind: 'delay', seconds: s } : null;
  }
  if (a.wait_for_trigger) {
    const t = asList(a.wait_for_trigger)[0];
    const trig = t && triggerFromHa(t);
    if (!trig || trig.kind !== 'state') return null;
    return { kind: 'wait_state', entityId: trig.entityId, state: trig.to, forSec: trig.forSec, timeoutSec: durationFromHa(a.timeout) || 0, continueOnTimeout: a.continue_on_timeout !== false };
  }
  return null;
}

/**
 * HA yapılandırmasını oluşturucu modeline çevirir. Oluşturucunun ifade edemediği bir yapı varsa
 * {editable:false} döner; böyle otomasyonlar uygulamada görüntülenir, çalıştırılır, açılıp kapatılır
 * ama yapıları yalnızca Home Assistant'ta düzenlenir (veri kaybını önlemek için).
 */
export function fromHaConfig(cfg) {
  const triggers = asList(cfg.triggers ?? cfg.trigger).map(triggerFromHa);
  const conditions = asList(cfg.conditions ?? cfg.condition).map(conditionFromHa);
  const actions = asList(cfg.actions ?? cfg.action).map(actionFromHa);
  const editable = ![...triggers, ...conditions, ...actions].includes(null) && triggers.length > 0 && actions.length > 0;
  return {
    editable,
    model: {
      id: cfg.id,
      alias: cfg.alias || '',
      description: cfg.description || '',
      mode: cfg.mode || 'single',
      revision: Number(cfg.variables?.ush_revision) || 0,
      triggers: triggers.filter(Boolean),
      conditions: conditions.filter(Boolean),
      actions: actions.filter(Boolean),
    },
  };
}

// ---------------- Türkçe açıklama ----------------

const STATE_WORDS = {
  on: 'açık',
  off: 'kapalı',
  open: 'açık',
  closed: 'kapalı',
  locked: 'kilitli',
  unlocked: 'kilidi açık',
  home: 'evde',
  not_home: 'dışarıda',
  armed_away: 'dışarıda kurulu',
  armed_home: 'evde kurulu',
  armed_night: 'gece kurulu',
  disarmed: 'devre dışı',
  triggered: 'tetiklendi',
  unavailable: 'çevrim dışı',
};

export function stateWord(state, entityState) {
  const dc = entityState?.attributes?.device_class;
  if (state === 'on' && (dc === 'motion' || dc === 'occupancy')) return 'hareket algıladı';
  if (state === 'off' && (dc === 'motion' || dc === 'occupancy')) return 'hareket yok';
  if (state === 'on' && ['door', 'window', 'opening', 'garage_door'].includes(dc)) return 'açık';
  if (state === 'off' && ['door', 'window', 'opening', 'garage_door'].includes(dc)) return 'kapalı';
  return STATE_WORDS[state] || state;
}

const SERVICE_WORDS = {
  turn_on: 'aç',
  turn_off: 'kapat',
  toggle: 'aç/kapat',
  open_cover: 'aç',
  close_cover: 'kapat',
  stop_cover: 'durdur',
  set_cover_position: 'konuma getir',
  open_valve: 'aç',
  close_valve: 'kapat',
  lock: 'kilitle',
  unlock: 'kilidi aç',
  alarm_arm_away: 'dışarıda modunda kur',
  alarm_arm_home: 'evde modunda kur',
  alarm_arm_night: 'gece modunda kur',
  alarm_disarm: 'devre dışı bırak',
  set_temperature: 'sıcaklığı ayarla',
  set_hvac_mode: 'modu ayarla',
  press: 'bas',
  set_percentage: 'hızı ayarla',
};

export function serviceWord(service) {
  return SERVICE_WORDS[service] || service;
}

function nameOf(getState, id) {
  const st = getState(id);
  return (st && st.attributes && st.attributes.friendly_name) || id;
}

function durText(sec) {
  const s = Number(sec) || 0;
  if (s % 3600 === 0 && s >= 3600) return `${s / 3600} saat`;
  if (s % 60 === 0 && s >= 60) return `${s / 60} dakika`;
  return `${s} saniye`;
}

export function describeTrigger(t, getState) {
  switch (t.kind) {
    case 'time':
      return `Saat ${t.at} olduğunda`;
    case 'sun': {
      const ev = t.event === 'sunset' ? 'gün batımında' : 'gün doğumunda';
      const off = Number(t.offsetMin) || 0;
      if (!off) return ev.charAt(0).toUpperCase() + ev.slice(1);
      return `${t.event === 'sunset' ? 'Gün batımından' : 'Gün doğumundan'} ${Math.abs(off)} dakika ${off < 0 ? 'önce' : 'sonra'}`;
    }
    case 'state':
      return `${nameOf(getState, t.entityId)} ${stateWord(t.to, getState(t.entityId))} olduğunda${Number(t.forSec) ? ` (${durText(t.forSec)} boyunca)` : ''}`;
    case 'numeric': {
      const unit = getState(t.entityId)?.attributes?.unit_of_measurement || '';
      const parts = [];
      if (t.above != null && t.above !== '') parts.push(`${t.above}${unit} üzerine çıktığında`);
      if (t.below != null && t.below !== '') parts.push(`${t.below}${unit} altına düştüğünde`);
      return `${nameOf(getState, t.entityId)} ${parts.join(' veya ')}`;
    }
    default:
      return 'Bilinmeyen tetikleyici';
  }
}

export function describeCondition(c, getState) {
  switch (c.kind) {
    case 'time': {
      const days = c.weekdays && c.weekdays.length ? WEEKDAYS.filter(([k]) => c.weekdays.includes(k)).map(([, l]) => l).join(', ') : '';
      const range = c.after || c.before ? `${c.after || '00:00'}–${c.before || '24:00'} arasında` : '';
      return [range, days && `günler: ${days}`].filter(Boolean).join(', ');
    }
    case 'state':
      return `${nameOf(getState, c.entityId)} ${stateWord(c.state, getState(c.entityId))} ise`;
    case 'numeric': {
      const unit = getState(c.entityId)?.attributes?.unit_of_measurement || '';
      const p = [];
      if (c.above != null && c.above !== '') p.push(`${c.above}${unit} üzerinde`);
      if (c.below != null && c.below !== '') p.push(`${c.below}${unit} altında`);
      return `${nameOf(getState, c.entityId)} ${p.join(' ve ')} ise`;
    }
    case 'sun':
      return c.when === 'night' ? 'Hava karanlıksa (gün batımı–gün doğumu)' : 'Hava aydınlıksa (gün doğumu–gün batımı)';
    default:
      return 'Bilinmeyen koşul';
  }
}

export function describeAction(a, getState) {
  switch (a.kind) {
    case 'service': {
      let extra = '';
      if (a.data?.brightness_pct != null) extra = ` (%${a.data.brightness_pct} parlaklık)`;
      if (a.data?.temperature != null) extra = ` (${a.data.temperature}°)`;
      if (a.data?.position != null) extra = ` (%${a.data.position})`;
      return `${nameOf(getState, a.entityId)}: ${serviceWord(a.service)}${extra}`;
    }
    case 'delay':
      return `${durText(a.seconds)} bekle`;
    case 'notify':
      return `Bildirim gönder: "${a.message}"`;
    case 'wait_state':
      return `${nameOf(getState, a.entityId)} ${stateWord(a.state, getState(a.entityId))} olana kadar bekle (en çok ${durText(a.timeoutSec)})`;
    default:
      return 'Bilinmeyen işlem';
  }
}

// ---------------- test (kuru çalıştırma) modu ----------------

function minutesOf(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Koşulları ŞU ANKİ gerçek durumlara göre değerlendirir ve hangi işlemlerin yapılacağını
 * hiçbir cihaza komut göndermeden listeler.
 * @returns {{conditions: Array<{text, result: boolean|null, reason?: string}>, wouldRun: boolean|null, actions: Array<{text, warning?: string}>}}
 */
export function dryRun(b, getState, { now = new Date(), sunState = null } = {}) {
  const conditions = (b.conditions || []).map((c) => {
    const text = describeCondition(c, getState);
    if (c.kind === 'state') {
      const st = getState(c.entityId);
      if (!st) return { text, result: false, reason: 'Cihaz bulunamadı' };
      if (st.state === 'unavailable') return { text, result: false, reason: 'Cihaz çevrim dışı' };
      return { text, result: st.state === String(c.state), reason: `Şu an: ${stateWord(st.state, st)}` };
    }
    if (c.kind === 'numeric') {
      const st = getState(c.entityId);
      const v = st ? Number(st.state) : NaN;
      if (Number.isNaN(v)) return { text, result: false, reason: 'Sayısal değer okunamadı' };
      const ok = (c.above == null || c.above === '' || v > Number(c.above)) && (c.below == null || c.below === '' || v < Number(c.below));
      return { text, result: ok, reason: `Şu an: ${v}${st.attributes.unit_of_measurement || ''}` };
    }
    if (c.kind === 'time') {
      const cur = now.getHours() * 60 + now.getMinutes();
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
      let ok = true;
      if (c.weekdays && c.weekdays.length && !c.weekdays.includes(dayKey)) ok = false;
      if (c.after || c.before) {
        const a = c.after ? minutesOf(c.after) : 0;
        const bf = c.before ? minutesOf(c.before) : 24 * 60;
        const inRange = a <= bf ? cur >= a && cur < bf : cur >= a || cur < bf;
        if (!inRange) ok = false;
      }
      return { text, result: ok, reason: `Şu an: ${pad(now.getHours())}:${pad(now.getMinutes())}` };
    }
    if (c.kind === 'sun') {
      if (!sunState) return { text, result: null, reason: 'Güneş bilgisi yok (sun entegrasyonu gerekli)' };
      const night = sunState.state === 'below_horizon';
      return { text, result: c.when === 'night' ? night : !night, reason: night ? 'Şu an karanlık' : 'Şu an aydınlık' };
    }
    return { text, result: null };
  });
  const wouldRun = conditions.some((c) => c.result === false) ? false : conditions.some((c) => c.result === null) ? null : true;
  const actions = (b.actions || []).map((a) => {
    const out = { text: describeAction(a, getState) };
    if (a.kind === 'service' || a.kind === 'wait_state') {
      const st = getState(a.entityId);
      if (!st) out.warning = 'Cihaz bulunamadı';
      else if (st.state === 'unavailable') out.warning = 'Cihaz şu an çevrim dışı — bu adım başarısız olur';
      else if (st.attributes.assumed_state) out.warning = 'Bu cihaz durum bildirmiyor; sonuç doğrulanamaz';
    }
    return out;
  });
  return { conditions, wouldRun, actions };
}

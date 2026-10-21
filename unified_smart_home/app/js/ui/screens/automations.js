import { h, ic, section, topbar, live, openSheet, confirmDialog, toast, errorBox, toggleSwitch, segmented, fill } from '../dom.js';
import { scenariosList } from './scenarios.js';
import {
  toHaConfig,
  fromHaConfig,
  validateAutomation,
  describeTrigger,
  describeCondition,
  describeAction,
  dryRun,
  newId,
  isBlockedAction,
  WEEKDAYS,
  serviceWord,
  stateWord,
} from '../../core/automations.js';
import { relativeTime, clock, DOMAIN_LABELS } from '../../core/format.js';

// ---------------- liste ----------------

export function automationsScreen(app, tab) {
  const isScen = tab === 'scenarios';
  const add = app.store.isAdmin
    ? [h('a', { class: 'icon-btn', href: isScen ? '#/scenario/new' : '#/automation/new', 'aria-label': isScen ? 'Yeni senaryo' : 'Yeni otomasyon' }, ic('plus'))]
    : [];
  return h(
    'main',
    null,
    topbar(isScen ? 'Senaryolar' : 'Otomasyonlar', { actions: add }),
    segmented(
      [
        ['automations', 'Otomasyonlar'],
        ['scenarios', 'Senaryolar'],
      ],
      isScen ? 'scenarios' : 'automations',
      (v) => app.navigate(`#/automations/${v}`),
      'Görünüm',
    ),
    h('div', { style: { height: '14px' } }),
    isScen ? scenariosList(app) : automationList(app),
  );
}

function automationList(app) {
  const autos = app.store.automations().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  if (!autos.length) {
    return h('div', { class: 'card empty' }, h('strong', null, 'Henüz otomasyon yok'), app.store.isAdmin ? '+ ile ilk otomasyonunuzu oluşturun. Örnek: "Saat 19:00\'da salon ışığını aç".' : 'Otomasyon oluşturmak için yönetici yetkisi gerekir.');
  }
  return h(
    'div',
    { class: 'list' },
    autos.map((a) =>
      live(a.entityId, () => {
        const st = app.store.getState(a.entityId);
        if (!st) return h('div', { class: 'item' }, a.name);
        const enabled = st.state === 'on';
        const id = st.attributes.id;
        return h(
          'div',
          { class: 'item' },
          h(
            'a',
            { class: 'grow', href: id ? `#/automation/${encodeURIComponent(id)}` : null, style: { color: 'inherit', textDecoration: 'none', minHeight: '44px', display: 'block' } },
            h('div', { class: 'title' }, st.attributes.friendly_name),
            h(
              'div',
              { class: 'meta' },
              st.state === 'unavailable' ? 'Yapılandırma hatası — HA günlüğünü kontrol edin' : `${enabled ? 'Etkin' : 'Pasif'} · Son çalışma: ${st.attributes.last_triggered ? relativeTime(st.attributes.last_triggered) : 'hiç'}`,
              Number(st.attributes.current) > 0 ? ' · şu an çalışıyor' : '',
            ),
          ),
          toggleSwitch({
            checked: enabled,
            label: `${st.attributes.friendly_name} ${enabled ? 'devre dışı bırak' : 'etkinleştir'}`,
            disabled: st.state === 'unavailable',
            onchange: async (v) => {
              try {
                await app.store.setAutomationEnabled(a.entityId, v);
              } catch (e) {
                toast(e.userMessage);
              }
            },
          }),
        );
      }),
    ),
  );
}

// ---------------- geçmiş ----------------

const EXEC_LABELS = {
  finished: ['ok', 'Tamamlandı'],
  failed_conditions: ['unk', 'Koşullar sağlanmadı, işlem yapılmadı'],
  failed_single: ['unk', 'Zaten çalışıyordu; tekrar eden tetikleme yok sayıldı'],
  failed_max_runs: ['unk', 'Eşzamanlı çalışma sınırı aşıldı'],
  cancelled: ['unk', 'İptal edildi (yeniden tetiklendi)'],
  error: ['bad', 'Hata'],
  aborted: ['bad', 'Durduruldu'],
  running: ['unk', 'Çalışıyor'],
};

export function automationHistory(app, configId) {
  const st = app.store.raw.states.find((s) => s.entity_id.startsWith('automation.') && s.attributes.id === configId);
  const box = h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Yükleniyor…'));
  app.store
    .traces('automation', configId)
    .then((list) => {
      const rows = (list || []).sort((a, b) => Date.parse(b.timestamp.start) - Date.parse(a.timestamp.start));
      if (!rows.length) return fill(box, h('div', { class: 'empty' }, 'Henüz çalışma kaydı yok. HA yalnızca son çalışmaların kaydını tutar.'));
      fill(box, 
        ...rows.map((t) => {
          const [kind, label] = t.error ? ['bad', 'Hata'] : EXEC_LABELS[t.script_execution] || ['unk', t.script_execution || t.state];
          return h(
            'div',
            { class: 'result-row' },
            h('span', { class: `mark ${kind}` }, ic(kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : 'info')),
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'meta' }, `${clock(t.timestamp.start)}${t.trigger ? ` · ${t.trigger}` : ''}`), t.error ? h('div', { class: 'meta', style: { color: 'var(--err)' } }, t.error) : null),
          );
        }),
      );
    })
    .catch((e) => fill(box, errorBox(e)));
  return h('main', null, topbar('Çalışma geçmişi', { back: true }), h('p', { class: 'subtitle' }, st ? st.attributes.friendly_name : configId), box);
}

// ---------------- varlık seçici ----------------

function entityOptions(app, filter) {
  const groups = new Map();
  for (const e of app.store.home.entities.values()) {
    if (e.category || !filter(e)) continue;
    const g = DOMAIN_LABELS[e.domain] || e.domain;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  return [...groups.entries()].sort().map(([g, list]) => h('optgroup', { label: g }, list.sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((e) => h('option', { value: e.id }, `${e.name}${e.simulated ? ' (simülasyon)' : ''}`))));
}

function withValue(sel, v) {
  if (v) sel.value = v;
  return sel;
}

function stateChoices(app, entityId) {
  const e = app.store.home.entities.get(entityId);
  if (!e) return [];
  const st = { entity_id: e.id, attributes: e.attributes };
  const pick = (list) => list.map((s) => [s, stateWord(s, st)]);
  switch (e.domain) {
    case 'binary_sensor':
    case 'light':
    case 'switch':
    case 'fan':
    case 'siren':
    case 'humidifier':
      return pick(['on', 'off']);
    case 'lock':
      return pick(['locked', 'unlocked']);
    case 'cover':
    case 'valve':
      return pick(['open', 'closed']);
    case 'alarm_control_panel':
      return pick(['disarmed', 'armed_home', 'armed_away', 'armed_night', 'triggered']);
    case 'climate':
      return (e.attributes.hvac_modes || []).map((m) => [m, m]);
    case 'media_player':
      return pick(['on', 'off']).concat([['playing', 'oynatılıyor'], ['paused', 'duraklatıldı']]);
    default:
      return [];
  }
}

const SERVICES = {
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  fan: ['turn_on', 'turn_off'],
  siren: ['turn_on', 'turn_off'],
  humidifier: ['turn_on', 'turn_off'],
  cover: ['open_cover', 'close_cover', 'set_cover_position', 'stop_cover'],
  valve: ['open_valve', 'close_valve'],
  lock: ['lock', 'unlock'],
  alarm_control_panel: ['alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_disarm'],
  climate: ['turn_off', 'set_hvac_mode', 'set_temperature'],
  media_player: ['turn_off', 'turn_on'],
  button: ['press'],
  vacuum: ['start', 'return_to_base'],
  water_heater: ['set_temperature'],
};

// ---------------- adım düzenleyici (alt sayfa) ----------------

function field(label, input, hint) {
  return h('div', { class: 'field' }, h('label', null, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}

function numInput(value, attrs = {}) {
  return h('input', { class: 'input', type: 'number', inputmode: 'decimal', value: value ?? '', ...attrs });
}

function timeInput(value) {
  return h('input', { class: 'input', type: 'time', value: value || '' });
}

export function editStep(app, kind, current, onSave, onlyTypes = null) {
  const body = h('div');
  const err = h('div');
  let read = () => null;
  const types =
    kind === 'trigger'
      ? [
          ['time', 'Belirli saat'],
          ['sun', 'Gün doğumu / batımı'],
          ['state', 'Cihaz durumu değişince'],
          ['numeric', 'Sensör değeri eşiği geçince'],
        ]
      : kind === 'condition'
        ? [
            ['time', 'Saat aralığı / günler'],
            ['sun', 'Karanlık / aydınlık'],
            ['state', 'Cihaz durumu'],
            ['numeric', 'Sensör değeri'],
          ]
        : [
            ['service', 'Cihazı kontrol et'],
            ['delay', 'Bekle'],
            ['wait_state', 'Bir durumu bekle'],
            ['notify', 'Bildirim gönder'],
          ];
  if (onlyTypes) types.splice(0, types.length, ...types.filter(([v]) => onlyTypes.includes(v)));
  let type = current ? current.kind : types[0][0];

  const renderBody = () => {
    const c = current && current.kind === type ? current : {};
    const parts = [];
    if (type === 'time' && kind === 'trigger') {
      const t = timeInput(c.at || '19:00');
      parts.push(field('Saat', t));
      read = () => ({ kind: 'time', at: t.value });
    } else if (type === 'sun' && kind === 'trigger') {
      const ev = withValue(h('select', { class: 'input' }, h('option', { value: 'sunset' }, 'Gün batımı'), h('option', { value: 'sunrise' }, 'Gün doğumu')), c.event);
      const off = numInput(c.offsetMin ?? 0, { min: -240, max: 240, step: 5 });
      parts.push(field('Olay', ev), field('Sapma (dakika)', off, 'Negatif değer öncesini, pozitif değer sonrasını belirtir.'));
      read = () => ({ kind: 'sun', event: ev.value, offsetMin: Number(off.value) || 0 });
    } else if (type === 'sun') {
      const w = withValue(h('select', { class: 'input' }, h('option', { value: 'night' }, 'Karanlıksa (gün batımı–doğumu)'), h('option', { value: 'day' }, 'Aydınlıksa')), c.when);
      parts.push(field('Koşul', w));
      read = () => ({ kind: 'sun', when: w.value });
    } else if (type === 'time') {
      const a = timeInput(c.after);
      const b = timeInput(c.before);
      const days = WEEKDAYS.map(([k, l]) => {
        const cb = h('input', { type: 'checkbox', value: k, checked: (c.weekdays || []).includes(k) });
        return h('label', { class: 'check', style: { display: 'inline-flex', marginRight: '10px' } }, cb, l);
      });
      parts.push(field('Başlangıç', a), field('Bitiş', b, 'Gece yarısını aşan aralıklar desteklenir (ör. 22:00–06:00).'), h('div', { class: 'field' }, h('label', null, 'Günler (boşsa her gün)'), h('div', null, days)));
      read = () => ({ kind: 'time', after: a.value, before: b.value, weekdays: days.map((d) => d.querySelector('input')).filter((x) => x.checked).map((x) => x.value) });
    } else if (type === 'state' || type === 'wait_state') {
      const sel = withValue(h('select', { class: 'input' }, h('option', { value: '' }, 'Cihaz seçin…'), entityOptions(app, (e) => stateChoices(app, e.id).length > 0)), c.entityId);
      const stSel = h('select', { class: 'input' });
      const refreshOptions = () => {
        const opts = stateChoices(app, sel.value);
        fill(stSel, ...opts.map(([v, l]) => h('option', { value: v }, l)));
        const want = type === 'wait_state' ? c.state : kind === 'trigger' ? c.to : c.state;
        if (want) stSel.value = want;
      };
      sel.addEventListener('change', refreshOptions);
      refreshOptions();
      const forMin = numInput(c.forSec ? c.forSec / 60 : '', { min: 0, max: 1440 });
      parts.push(field('Cihaz', sel), field(type === 'wait_state' ? 'Beklenen durum' : 'Durum', stSel));
      if (kind === 'trigger' || type === 'wait_state') parts.push(field('En az şu kadar sürerse (dakika)', forMin, 'Boş bırakılırsa anında.'));
      let timeout = null;
      if (type === 'wait_state') {
        timeout = numInput(c.timeoutSec ? c.timeoutSec / 60 : 30, { min: 1, max: 1440 });
        parts.push(field('En fazla bekleme (dakika)', timeout, 'Süre dolarsa sonraki adımlarla devam edilir.'));
      }
      read = () => {
        const forSec = Math.round((Number(forMin.value) || 0) * 60);
        if (type === 'wait_state') return { kind: 'wait_state', entityId: sel.value, state: stSel.value, forSec, timeoutSec: Math.round(Number(timeout.value) * 60), continueOnTimeout: true };
        if (kind === 'trigger') return { kind: 'state', entityId: sel.value, to: stSel.value, forSec };
        return { kind: 'state', entityId: sel.value, state: stSel.value };
      };
    } else if (type === 'numeric') {
      const sel = withValue(h('select', { class: 'input' }, h('option', { value: '' }, 'Sensör seçin…'), entityOptions(app, (e) => e.domain === 'sensor' && !Number.isNaN(Number(e.state)))), c.entityId);
      const above = numInput(c.above);
      const below = numInput(c.below);
      const forMin = numInput(c.forSec ? c.forSec / 60 : '', { min: 0 });
      parts.push(field('Sensör', sel), field('Üzerine çıkınca (>)', above), field('Altına düşünce (<)', below));
      if (kind === 'trigger') parts.push(field('En az şu kadar sürerse (dakika)', forMin));
      read = () => ({
        kind: 'numeric',
        entityId: sel.value,
        above: above.value === '' ? null : Number(above.value),
        below: below.value === '' ? null : Number(below.value),
        ...(kind === 'trigger' ? { forSec: Math.round((Number(forMin.value) || 0) * 60) } : {}),
      });
    } else if (type === 'service') {
      const sel = withValue(h('select', { class: 'input' }, h('option', { value: '' }, 'Cihaz seçin…'), entityOptions(app, (e) => !!SERVICES[e.domain])), c.entityId);
      const svc = h('select', { class: 'input' });
      const extra = h('div');
      let readExtra = () => ({});
      const fillExtra = () => {
        fill(extra);
        readExtra = () => ({});
        const e = app.store.home.entities.get(sel.value);
        if (!e) return;
        if (e.domain === 'light' && svc.value === 'turn_on' && e.capabilities.includes('brightness')) {
          const b = numInput(c.data?.brightness_pct ?? '', { min: 1, max: 100 });
          extra.append(field('Parlaklık (%) — boşsa son değer', b));
          readExtra = () => (b.value === '' ? {} : { brightness_pct: Number(b.value) });
        } else if (svc.value === 'set_cover_position') {
          const p = numInput(c.data?.position ?? 50, { min: 0, max: 100 });
          extra.append(field('Konum (%)', p));
          readExtra = () => ({ position: Number(p.value) });
        } else if (svc.value === 'set_temperature') {
          const t = numInput(c.data?.temperature ?? 21, { step: 0.5 });
          extra.append(field('Sıcaklık (°)', t));
          readExtra = () => ({ temperature: Number(t.value) });
        } else if (svc.value === 'set_hvac_mode') {
          const m = withValue(h('select', { class: 'input' }, (e.attributes.hvac_modes || []).map((x) => h('option', { value: x }, x))), c.data?.hvac_mode);
          extra.append(field('Mod', m));
          readExtra = () => ({ hvac_mode: m.value });
        }
      };
      const refreshOptions = () => {
        const e = app.store.home.entities.get(sel.value);
        const st = e ? app.store.getState(e.id) : null;
        fill(svc, 
          ...(e ? SERVICES[e.domain] : []).map((s) => {
            const blocked = isBlockedAction(st, s);
            return h('option', { value: s, disabled: blocked }, `${serviceWord(s)}${blocked ? ' (güvenlik nedeniyle kullanılamaz)' : ''}`);
          }),
        );
        if (c.service && [...svc.options].some((o) => o.value === c.service && !o.disabled)) svc.value = c.service;
        else {
          const firstOk = [...svc.options].find((o) => !o.disabled);
          if (firstOk) svc.value = firstOk.value;
        }
        fillExtra();
      };
      sel.addEventListener('change', refreshOptions);
      svc.addEventListener('change', fillExtra);
      refreshOptions();
      parts.push(field('Cihaz', sel), field('Komut', svc), extra);
      parts.push(h('p', { class: 'hint' }, 'Kilit açma, alarmı devre dışı bırakma ve garaj/kapı açma güvenlik nedeniyle otomasyonlarda kullanılamaz.'));
      read = () => ({ kind: 'service', entityId: sel.value, service: svc.value, data: readExtra() });
    } else if (type === 'delay') {
      const m = numInput(c.seconds ? c.seconds / 60 : 5, { min: 0.1, max: 1440, step: 0.5 });
      parts.push(field('Süre (dakika)', m));
      read = () => ({ kind: 'delay', seconds: Math.round(Number(m.value) * 60) });
    } else if (type === 'notify') {
      const title = h('input', { class: 'input', value: c.title || '', maxlength: 60 });
      const msg = h('textarea', { class: 'input', maxlength: 500 }, c.message || '');
      const target = h('select', { class: 'input' }, h('option', { value: 'notify' }, 'Home Assistant bildirimi'));
      app.socket
        .sendMessage({ type: 'get_services' })
        .then((svcs) => {
          for (const name of Object.keys(svcs.notify || {}).filter((n) => n.startsWith('mobile_app_'))) target.append(h('option', { value: name }, `Telefon: ${name.slice(11)}`));
          if (c.target) target.value = c.target;
        })
        .catch(() => {});
      parts.push(field('Başlık', title), field('Mesaj', msg), field('Nereye', target, 'iPhone\'a anlık bildirim için Home Assistant Companion uygulaması gerekir (bkz. Ayarlar > Bildirimler).'));
      read = () => ({ kind: 'notify', title: title.value, message: msg.value, target: target.value });
    }
    fill(body, ...parts);
  };

  const typeSel = withValue(h('select', { class: 'input', 'aria-label': 'Tür' }, types.map(([v, l]) => h('option', { value: v }, l))), type);
  typeSel.addEventListener('change', () => {
    type = typeSel.value;
    renderBody();
  });
  renderBody();
  const ref = openSheet(
    kind === 'trigger' ? 'Tetikleyici' : kind === 'condition' ? 'Koşul' : 'İşlem',
    h(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault();
          const v = read();
          const errs = validateAutomation({ alias: 'x', triggers: kind === 'trigger' ? [v] : [{ kind: 'time', at: '00:00' }], conditions: kind === 'condition' ? [v] : [], actions: kind === 'action' ? [v] : [{ kind: 'delay', seconds: 1 }] }, (id) => app.store.getState(id));
          if (errs.length) {
            fill(err, h('div', { class: 'error-box' }, errs.map((x) => h('div', null, x.replace(/^(Tetikleyici|Koşul|İşlem) 1: /, '')))));
            return;
          }
          onSave(v);
          ref.close();
        },
      },
      field('Tür', typeSel),
      body,
      err,
      h('button', { class: 'btn primary block', type: 'submit' }, 'Tamam'),
    ),
  );
}

// ---------------- düzenleyici ----------------

function emptyModel() {
  return { id: newId('ush'), alias: '', description: '', mode: 'single', revision: 0, triggers: [], conditions: [], actions: [] };
}

export function automationEditor(app, configId, prefill) {
  const getState = (id) => app.store.getState(id);
  const container = h('div', null, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Yükleniyor…'));
  const isNew = !configId;
  const main = h('main', null, topbar(isNew ? 'Yeni otomasyon' : 'Otomasyonu düzenle', { back: () => app.navigate('#/automations') }), container);

  if (!app.store.isAdmin) {
    fill(container, h('div', { class: 'warn-box' }, 'Otomasyonları görüntülemek ve düzenlemek için Home Assistant yönetici yetkisi gerekir.'));
    return main;
  }

  const start = (model, editable, rawCfg) => {
    const m = model;
    const entityId = isNew ? null : app.store.raw.states.find((s) => s.entity_id.startsWith('automation.') && s.attributes.id === m.id)?.entity_id;
    if (!editable) {
      fill(container, 
        h('div', { class: 'info-box' }, 'Bu otomasyon, uygulamanın oluşturucusunun desteklemediği gelişmiş adımlar içeriyor. Veri kaybını önlemek için yalnızca Home Assistant\'ta düzenlenebilir. Buradan açıp kapatabilir, çalıştırabilir ve geçmişini görebilirsiniz.'),
        h('div', { class: 'card' }, h('div', { style: { fontWeight: 700, fontSize: '18px' } }, rawCfg.alias || m.id), rawCfg.description ? h('p', { class: 'hint' }, rawCfg.description) : null),
        entityId ? runAndHistory(app, entityId, m.id) : null,
      );
      return;
    }
    const name = h('input', { class: 'input', value: m.alias, maxlength: 100, 'aria-label': 'Otomasyon adı', placeholder: 'ör. Akşam aydınlatması' });
    const mode = withValue(
      h('select', { class: 'input' }, h('option', { value: 'single' }, 'Çalışırken gelen yeni tetiklemeyi yok say'), h('option', { value: 'restart' }, 'Baştan başlat (ör. hareket algılandıkça süreyi uzat)'), h('option', { value: 'queued' }, 'Sıraya al')),
      m.mode,
    );
    const lists = { trigger: h('div'), condition: h('div'), action: h('div') };
    const keyOf = { trigger: 'triggers', condition: 'conditions', action: 'actions' };
    const describe = { trigger: describeTrigger, condition: describeCondition, action: describeAction };
    const renderList = (kind) => {
      const arr = m[keyOf[kind]];
      fill(lists[kind], 
        ...arr.map((step, i) =>
          h(
            'div',
            { class: 'step' },
            h('button', { class: 'grow', style: { background: 'none', border: 0, textAlign: 'left', padding: 0, minHeight: '44px' }, onclick: () => editStep(app, kind, step, (v) => ((arr[i] = v), renderList(kind))), 'aria-label': `Düzenle: ${describe[kind](step, getState)}` }, h('div', { class: 'k' }, `${i + 1}`), describe[kind](step, getState)),
            kind === 'action' && i > 0 ? h('button', { class: 'icon-btn plain', 'aria-label': 'Yukarı taşı', onclick: () => (([arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]), renderList(kind)) }, ic('up')) : null,
            h('button', { class: 'icon-btn plain', 'aria-label': 'Sil', onclick: () => (arr.splice(i, 1), renderList(kind)) }, ic('trash')),
          ),
        ),
        h('button', { class: 'btn block', onclick: () => editStep(app, kind, null, (v) => (arr.push(v), renderList(kind))) }, ic('plus'), kind === 'trigger' ? 'Tetikleyici ekle' : kind === 'condition' ? 'Koşul ekle' : 'İşlem ekle'),
      );
    };
    Object.keys(lists).forEach(renderList);
    const passive = h('input', { type: 'checkbox', checked: isNew });
    const errSlot = h('div');
    const read = () => ({ ...m, alias: name.value.trim(), mode: mode.value });

    const save = async () => {
      const b = read();
      const errs = validateAutomation(b, getState);
      if (errs.length) {
        fill(errSlot, h('div', { class: 'error-box', role: 'alert' }, errs.map((x) => h('div', null, x))));
        return;
      }
      fill(errSlot);
      try {
        await app.store.saveAutomationConfig(b.id, toHaConfig(b));
        const eid = await app.store.waitForAutomationEntity(b.id);
        if (eid && passive.checked) await app.store.setAutomationEnabled(eid, false);
        m.revision = (m.revision || 0) + 1;
        toast(passive.checked ? 'Kaydedildi (pasif). Test ettikten sonra etkinleştirin.' : 'Kaydedildi ve etkin.');
        app.navigate('#/automations');
      } catch (e) {
        fill(errSlot, errorBox(e));
      }
    };

    const test = () => {
      const b = read();
      const r = dryRun(b, getState, { sunState: getState('sun.sun') });
      const mark = (v) => (v === true ? ['ok', 'check', 'Sağlanıyor'] : v === false ? ['bad', 'x', 'Sağlanmıyor'] : ['unk', 'info', 'Değerlendirilemedi']);
      openSheet(
        'Test modu (komut gönderilmez)',
        h(
          'div',
          null,
          h('p', { class: 'hint', style: { marginTop: 0 } }, 'Koşullar ŞU ANKİ gerçek cihaz durumlarına göre değerlendirildi. Hiçbir cihaza komut gönderilmedi.'),
          h('h4', null, 'Tetikleyiciler'),
          b.triggers.map((t) => h('div', { class: 'result-row' }, h('span', { class: 'mark unk' }, ic('clock')), h('div', null, describeTrigger(t, getState)))),
          h('h4', null, 'Koşullar'),
          r.conditions.length
            ? r.conditions.map((c) => {
                const [k, i, l] = mark(c.result);
                return h('div', { class: 'result-row' }, h('span', { class: `mark ${k}` }, ic(i)), h('div', null, h('div', null, c.text), h('div', { class: 'meta' }, `${l}${c.reason ? ` · ${c.reason}` : ''}`)));
              })
            : h('div', { class: 'meta' }, 'Koşul yok'),
          h('div', { class: r.wouldRun === false ? 'warn-box' : r.wouldRun ? 'info-box' : 'info-box' }, r.wouldRun === false ? 'Şu an tetiklenseydi koşullar sağlanmadığı için işlem YAPILMAYACAKTI.' : r.wouldRun ? 'Şu an tetiklenseydi aşağıdaki işlemler yapılacaktı:' : 'Bazı koşullar değerlendirilemedi.'),
          r.actions.map((a, i) => h('div', { class: 'result-row' }, h('span', { class: 'mark' }, `${i + 1}.`), h('div', null, h('div', null, a.text), a.warning ? h('div', { class: 'meta', style: { color: 'var(--warn)' } }, a.warning) : null))),
          entityId
            ? h(
                'button',
                {
                  class: 'btn block',
                  style: { marginTop: '14px' },
                  onclick: async () => {
                    const ok = await confirmDialog({ title: 'Gerçek cihazlarla çalıştır?', message: 'Kayıtlı otomasyon bir kez çalıştırılacak ve koşullar sağlanıyorsa cihazlara GERÇEK komutlar gönderilecek. Kaydedilmemiş değişiklikler kullanılmaz.', confirmText: 'Çalıştır' });
                    if (!ok) return;
                    try {
                      await app.store.triggerAutomation(entityId, { skipCondition: false });
                      toast('Çalıştırıldı. Sonucu geçmişte görebilirsiniz.');
                    } catch (e) {
                      toast(e.userMessage);
                    }
                  },
                },
                ic('play'),
                'Kayıtlı sürümü şimdi bir kez çalıştır',
              )
            : null,
        ),
      );
    };

    fill(container, 
      field('Ad', name),
      section('Ne zaman?', lists.trigger),
      section('Şu koşullarda (isteğe bağlı)', lists.condition),
      section('Ne yapılsın?', lists.action),
      section('Tekrar eden tetiklemeler', field('Otomasyon çalışırken yeniden tetiklenirse', mode)),
      h('label', { class: 'check' }, passive, h('span', null, 'Pasif kaydet', h('div', { class: 'hint' }, 'Önerilir: önce test edin, sonra listeden etkinleştirin.'))),
      errSlot,
      h('div', { class: 'row-actions', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: test }, ic('flask'), 'Test et'), h('button', { class: 'btn primary', onclick: save }, 'Kaydet')),
      entityId ? runAndHistory(app, entityId, m.id) : null,
      !isNew
        ? h(
            'button',
            {
              class: 'btn danger block',
              style: { marginTop: '22px' },
              onclick: async () => {
                const ok = await confirmDialog({ title: 'Otomasyon silinsin mi?', message: `"${m.alias}" kalıcı olarak silinecek. Home Assistant yedeklerinden geri yüklenebilir.`, confirmText: 'Sil', danger: true });
                if (!ok) return;
                try {
                  await app.store.deleteAutomation(m.id);
                  toast('Silindi');
                  app.navigate('#/automations');
                } catch (e) {
                  fill(errSlot, errorBox(e));
                }
              },
            },
            ic('trash'),
            'Otomasyonu sil',
          )
        : null,
    );
  };

  if (isNew) {
    start({ ...emptyModel(), ...(prefill || {}) }, true, {});
  } else {
    app.store
      .getAutomationConfig(configId)
      .then((cfg) => {
        const r = fromHaConfig(cfg);
        start(r.model, r.editable, cfg);
      })
      .catch((e) => fill(container, errorBox(e)));
  }
  return main;
}

function runAndHistory(app, entityId, configId) {
  return section(
    'Durum',
    live(entityId, () => {
      const st = app.store.getState(entityId);
      if (!st) return h('div');
      return h(
        'div',
        { class: 'list' },
        h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, st.state === 'on' ? 'Etkin' : 'Pasif'), h('div', { class: 'meta' }, `Son çalışma: ${st.attributes.last_triggered ? relativeTime(st.attributes.last_triggered) : 'hiç'}`)), toggleSwitch({ checked: st.state === 'on', label: 'Etkin', onchange: (v) => app.store.setAutomationEnabled(entityId, v).catch((e) => toast(e.userMessage)) })),
        h('a', { class: 'item', href: `#/automation/${encodeURIComponent(configId)}/history`, style: { color: 'inherit', textDecoration: 'none' } }, ic('history'), h('div', { class: 'grow title' }, 'Çalışma geçmişi'), ic('chevron', 'chev')),
      );
    }),
  );
}

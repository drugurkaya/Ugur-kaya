import { h, ic, section, topbar, live, openSheet, toast, errorBox, fill } from '../dom.js';
import { deviceControls, phaseLine, badges, sensorList } from '../components.js';
import { stateText, iconFor, relativeTime, clock, DOMAIN_LABELS } from '../../core/format.js';
import { CONNECTIVITY_LABELS, isActive } from '../../core/model.js';
import { powerWatts } from '../../core/energy.js';
import { num } from '../../core/format.js';
import { PHASE_LABELS } from '../../core/commands.js';

function infoList(app, e) {
  const dev = e.deviceId ? app.store.home.devices.get(e.deviceId) : null;
  const area = app.store.home.areas.find((a) => a.id === e.areaId);
  const rows = [
    ['Tür', DOMAIN_LABELS[e.domain] || e.domain],
    dev && dev.manufacturer ? ['Marka', dev.manufacturer] : null,
    dev && dev.model ? ['Model', dev.model] : null,
    ['Oda', area ? area.name : 'Atanmamış'],
    ['Entegrasyon', e.integrationName || 'Bilinmiyor'],
    ['Bağlantı türü', e.simulated ? CONNECTIVITY_LABELS.simulated : CONNECTIVITY_LABELS[e.connectivity]],
    ['Bağlantı durumu', e.availability === 'offline' ? 'Çevrim dışı' : e.availability === 'unknown' ? 'Durum bilinmiyor' : 'Çevrim içi'],
    ['Son değişiklik', `${relativeTime(e.lastChanged)} (${clock(e.lastChanged)})`],
    ['Son güncelleme', relativeTime(e.lastUpdated)],
    dev && dev.swVersion ? ['Yazılım sürümü', dev.swVersion] : null,
    e.attributes.battery_level != null ? ['Pil', `%${e.attributes.battery_level}`] : null,
  ].filter(Boolean);
  return h(
    'div',
    { class: 'card' },
    h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    h('details', { class: 'tech' }, h('summary', null, 'Teknik ayrıntılar'), h('pre', null, `entity_id: ${e.id}\ndevice_id: ${e.deviceId || '-'}\nyetenekler: ${e.capabilities.join(', ') || '-'}`)),
  );
}

function relatedAutomations(app, e) {
  const box = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Yükleniyor…'));
  app.store
    .related('entity', e.id)
    .then((r) => {
      const autos = (r.automation || []).map((id) => app.store.getState(id)).filter(Boolean);
      const scripts = (r.script || []).map((id) => app.store.getState(id)).filter(Boolean);
      const items = [
        ...autos.map((s) => h('a', { class: 'item', href: `#/automation/${encodeURIComponent(s.attributes.id || '')}`, style: { color: 'inherit', textDecoration: 'none' } }, ic('automation'), h('div', { class: 'grow' }, h('div', { class: 'title' }, s.attributes.friendly_name), h('div', { class: 'meta' }, s.state === 'on' ? 'Etkin' : 'Pasif')), ic('chevron', 'chev'))),
        ...scripts.map((s) => h('div', { class: 'item' }, ic('scenario'), h('div', { class: 'grow' }, h('div', { class: 'title' }, s.attributes.friendly_name), h('div', { class: 'meta' }, 'Senaryo')))),
      ];
      fill(box, ...(items.length ? items : [h('div', { class: 'empty' }, 'Bu cihazı kullanan otomasyon veya senaryo yok.')]));
    })
    .catch(() => fill(box, h('div', { class: 'empty' }, 'İlişkili otomasyonlar okunamadı.')));
  return box;
}

function editSheet(app, e) {
  const dev = e.deviceId ? app.store.home.devices.get(e.deviceId) : null;
  const name = h('input', { class: 'input', value: dev ? dev.name : e.name, maxlength: 80, 'aria-label': 'Ad' });
  const areaSel = h(
    'select',
    { class: 'input', 'aria-label': 'Oda' },
    h('option', { value: '' }, 'Oda yok'),
    app.store.home.areas.map((a) => h('option', { value: a.id, selected: a.id === (dev ? dev.areaId : e.areaId) }, a.name)),
  );
  const err = h('div');
  const ref = openSheet(
    'Adı ve odayı düzenle',
    h(
      'form',
      {
        onsubmit: async (ev) => {
          ev.preventDefault();
          try {
            if (dev) await app.store.updateDevice(dev.id, { name: name.value.trim(), areaId: areaSel.value || null });
            else await app.store.updateEntity(e.id, { name: name.value.trim(), areaId: areaSel.value || null });
            ref.close();
            toast('Kaydedildi');
          } catch (ex) {
            fill(err, errorBox(ex));
          }
        },
      },
      h('div', { class: 'field' }, h('label', null, dev ? 'Cihaz adı' : 'Ad'), name),
      h('div', { class: 'field' }, h('label', null, 'Oda'), areaSel),
      dev ? h('p', { class: 'hint' }, 'Değişiklik Home Assistant\'taki cihaz kaydına yazılır; bu cihazın tüm parçalarına uygulanır.') : null,
      err,
      h('button', { class: 'btn primary block', type: 'submit' }, 'Kaydet'),
    ),
  );
}

export function deviceScreen(app, entityId) {
  const e0 = app.store.home.entities.get(entityId);
  if (!e0) return h('main', null, topbar('Cihaz', { back: true }), h('div', { class: 'empty' }, 'Cihaz bulunamadı. Kaldırılmış veya gizlenmiş olabilir.'));
  const favs = () => app.prefs.get('favorites', []);
  const favBtn = h('button', {
    class: 'icon-btn',
    'aria-label': favs().includes(entityId) ? 'Sık kullanılanlardan çıkar' : 'Sık kullanılanlara ekle',
    'aria-pressed': String(favs().includes(entityId)),
    onclick: () => {
      const f = favs();
      const next = f.includes(entityId) ? f.filter((x) => x !== entityId) : [...f, entityId];
      app.prefs.set('favorites', next);
      const isFav = next.includes(entityId);
      favBtn.setAttribute('aria-pressed', String(isFav));
      favBtn.setAttribute('aria-label', isFav ? 'Sık kullanılanlardan çıkar' : 'Sık kullanılanlara ekle');
      fill(favBtn, ic(isFav ? 'starFill' : 'star'));
      toast(isFav ? 'Sık kullanılanlara eklendi' : 'Sık kullanılanlardan çıkarıldı');
    },
  }, ic(favs().includes(entityId) ? 'starFill' : 'star'));

  const main = live(entityId, () => {
    const e = app.store.home.entities.get(entityId);
    if (!e) return h('div', { class: 'empty' }, 'Cihaz kaldırıldı.');
    const on = isActive({ entity_id: e.id, state: e.state });
    const lastCmd = app.store.commands.history.find((c) => c.entityId === e.id);
    return h(
      'div',
      null,
      h('div', { class: `hero${on ? ' on' : ''}` }, h('div', { class: 'ic', 'aria-hidden': 'true' }, ic(iconFor(e))), h('div', null, h('div', { class: 'big', 'aria-live': 'polite' }, stateText(e)), h('div', { class: 'badges' }, badges(e, { full: true })))),
      e.simulated ? h('div', { class: 'info-box' }, 'Bu cihaz Home Assistant "demo" entegrasyonundan gelir; gerçek bir donanım değildir. Komutlar yalnızca yazılımda simüle edilir.') : null,
      e.assumedState ? h('div', { class: 'warn-box' }, 'Bu cihaz gerçek durumunu bildirmiyor. Gösterilen durum son gönderilen komuta göre varsayılmıştır.') : null,
      h('div', { class: 'card' }, deviceControls(app, e), phaseLine(app.phases.get(e.id))),
      lastCmd && lastCmd.error && !app.phases.get(e.id)
        ? h('div', { class: 'warn-box' }, `Son komut (${relativeTime(lastCmd.startedAt)}): ${PHASE_LABELS[lastCmd.phase]} — ${lastCmd.error.userMessage}`)
        : null,
    );
  });

  const e = e0;
  const dev = e.deviceId ? app.store.home.devices.get(e.deviceId) : null;
  const siblings = dev ? dev.entityIds.filter((id) => id !== e.id && !app.store.home.entities.get(id)?.category) : [];
  const energyIds = siblings.filter((id) => ['power', 'energy'].includes(app.store.home.entities.get(id)?.attributes.device_class));
  const otherIds = siblings.filter((id) => !energyIds.includes(id));
  const ownPower = e.attributes.device_class === 'power' ? powerWatts(e) : null;

  return h(
    'main',
    null,
    topbar(e.name, { back: true, actions: [favBtn] }),
    main,
    energyIds.length ? section('Enerji', sensorList(app, energyIds)) : null,
    ownPower != null ? h('div', { class: 'info-box' }, `Anlık güç: ${num(ownPower)} W`) : null,
    otherIds.length ? section('Bu cihazın diğer bileşenleri', sensorList(app, otherIds)) : null,
    section('Bilgiler', infoList(app, e), app.store.isAdmin ? h('button', { class: 'link', onclick: () => editSheet(app, e) }, 'Düzenle') : null),
    section('İlişkili otomasyonlar', relatedAutomations(app, e)),
  );
}

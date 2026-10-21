import { h, ic, section, liveSummary, topbar, fill } from '../dom.js';
import { tilesFor } from '../components.js';
import { summarize, climateReadingFor, isActive } from '../../core/model.js';
import { num, relativeTime, stateText } from '../../core/format.js';
import { integrationStatus, Level } from '../../core/health.js';
import { scenarioChips } from './scenarios.js';

function overallStatus(app) {
  const s = summarize(app.store.home);
  const integErr = app.store.home.integrations.filter((i) => integrationStatus(i).level === Level.ERROR);
  if (app.socket.status !== 'connected') return { level: 'error', text: 'Merkez bağlantısı yok' };
  if (s.alarms.length) return { level: 'error', text: 'Alarm var' };
  if (integErr.length) return { level: 'error', text: `${integErr.length} entegrasyonda sorun` };
  if (s.offline) return { level: 'warn', text: `${s.offline} cihaz yanıt vermiyor` };
  return { level: 'ok', text: 'Her şey yolunda' };
}

function readings(app) {
  const out = [];
  for (const area of app.store.home.areas) {
    const r = climateReadingFor(app.store.home, area.id);
    if (!r.temperature && !r.humidity) continue;
    out.push(
      h(
        'div',
        { class: 'reading' },
        h('div', { class: 'l' }, area.name),
        h('div', { class: 'v' }, r.temperature ? `${num(r.temperature.state)}°` : '—', r.humidity ? h('span', { style: { fontSize: '15px', color: 'var(--text-2)', fontWeight: 600 } }, `  %${num(r.humidity.state, 0)}`) : null),
      ),
    );
  }
  // Dış ortam: yalnızca HA'da bir hava durumu varlığı varsa ve kaynağı belirtilerek
  const weather = app.store.raw.states.find((s) => s.entity_id.startsWith('weather.') && s.state !== 'unavailable' && s.attributes.temperature != null);
  if (weather) {
    out.push(
      h(
        'div',
        { class: 'reading', title: 'Kaynak: hava durumu servisi (yerel ölçüm değil)' },
        h('div', { class: 'l' }, 'Dış ortam · hava durumu'),
        h('div', { class: 'v' }, `${num(weather.attributes.temperature)}${weather.attributes.temperature_unit || '°'}`, weather.attributes.humidity != null ? h('span', { style: { fontSize: '15px', color: 'var(--text-2)', fontWeight: 600 } }, `  %${num(weather.attributes.humidity, 0)}`) : null),
      ),
    );
  }
  return out;
}

const EVENT_DOMAINS = ['light', 'switch', 'lock', 'cover', 'binary_sensor', 'alarm_control_panel', 'climate', 'fan', 'valve', 'automation', 'script'];

function recentEvents(app) {
  const container = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Yükleniyor…'));
  const start = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  app.socket
    .sendMessage({ type: 'logbook/get_events', start_time: start }, { timeoutMs: 15000 })
    .then((events) => {
      const rows = (events || [])
        .filter((e) => e.entity_id && EVENT_DOMAINS.includes(e.entity_id.split('.')[0]))
        .map((e) => {
          const domain = e.entity_id.split('.')[0];
          const ent = app.store.home.entities.get(e.entity_id);
          const st = app.store.getState(e.entity_id);
          const name = e.name || (ent && ent.name) || (st && st.attributes.friendly_name);
          if (!name) return null; // silinmiş öğe
          let text;
          if (domain === 'automation') text = e.state == null ? 'Otomasyon çalıştı' : e.state === 'on' ? 'Otomasyon etkinleştirildi' : 'Otomasyon devre dışı bırakıldı';
          else if (domain === 'script') {
            if (e.state != null) return null; // açık/kapalı geçişleri yerine yalnızca başlatma kaydı
            text = 'Senaryo başlatıldı';
          } else text = ent && e.state != null ? stateText({ ...ent, state: e.state }) : e.state || '';
          return { name, text, when: e.when };
        })
        .filter(Boolean)
        .reverse()
        .slice(0, 8);
      if (!rows.length) {
        fill(container, h('div', { class: 'empty' }, 'Son 6 saatte olay yok.'));
        return;
      }
      fill(
        container,
        ...rows.map((e) =>
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, e.name), h('div', { class: 'meta' }, e.text)), h('div', { class: 'meta' }, relativeTime(e.when * 1000))),
        ),
      );
    })
    .catch(() => fill(container, h('div', { class: 'empty' }, 'Olay geçmişi okunamadı (HA "logbook" bileşeni etkin olmalı).')));
  return container;
}

export function homeScreen(app) {
  const name = app.store.config?.location_name || 'Evim';
  const favorites = app.prefs.get('favorites', []).filter((id) => app.store.home.entities.has(id));

  const summaryEl = liveSummary(() => {
    const s = summarize(app.store.home);
    const st = overallStatus(app);
    return h(
      'div',
      null,
      h('a', { href: '#/system/health', class: `status-pill lvl-${st.level}`, style: { textDecoration: 'none', marginBottom: '14px' } }, h('span', { class: 'dot' }), st.text),
      h(
        'div',
        { class: 'stats', style: { marginTop: '12px' } },
        h('a', { class: 'stat', href: '#/rooms', style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'v' }, String(s.active)), h('div', { class: 'l' }, 'Aktif cihaz')),
        h('a', { class: 'stat', href: '#/system/health', style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'v' }, String(s.offline)), h('div', { class: 'l' }, 'Çevrim dışı')),
        h('div', { class: `stat${s.alarms.length ? ' alert' : ''}` }, h('div', { class: 'v' }, String(s.alarms.length)), h('div', { class: 'l' }, 'Aktif alarm')),
      ),
      s.alarms.length
        ? h(
            'div',
            { class: 'error-box', role: 'alert', style: { marginTop: '12px' } },
            h('strong', null, 'Alarm: '),
            s.alarms.map((a) => `${a.name} (${stateText(a)})`).join(', '),
          )
        : null,
      s.openContacts.length ? h('div', { class: 'info-box' }, `Açık: ${s.openContacts.map((c) => c.name).join(', ')}`) : null,
    );
  });

  const rd = readings(app);
  const onNow = [...app.store.home.entities.values()]
    .filter((e) => (e.domain === 'light' || e.domain === 'switch') && !e.category && isActive({ entity_id: e.id, state: e.state }))
    .slice(0, 6)
    .map((e) => e.id);

  return h(
    'main',
    null,
    topbar(name, { actions: [h('a', { class: 'icon-btn', href: '#/add', 'aria-label': 'Yeni cihaz ekle' }, ic('plus'))] }),
    summaryEl,
    rd.length ? section('Ortam', h('div', { class: 'readings' }, rd)) : null,
    section(
      'Sık kullanılanlar',
      favorites.length
        ? tilesFor(app, favorites)
        : h('div', { class: 'card empty' }, h('strong', null, 'Henüz sık kullanılan yok'), 'Bir cihazın ayrıntısında ☆ simgesine dokunarak buraya ekleyin.'),
    ),
    onNow.length ? section('Şu an açık olanlar', tilesFor(app, onNow)) : null,
    section('Senaryolar', scenarioChips(app), h('a', { class: 'link', href: '#/automations/scenarios' }, 'Tümü')),
    section('Son olaylar', recentEvents(app)),
  );
}

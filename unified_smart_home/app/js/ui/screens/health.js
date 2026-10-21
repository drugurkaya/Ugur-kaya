import { h, ic, section, topbar, segmented, fill } from '../dom.js';
import { buildHealthReport } from '../../core/health.js';

const LEVEL_TEXT = { ok: 'Normal', warn: 'Uyarı', error: 'Sorun var', unknown: 'Bilinmiyor' };
const LEVEL_ICON = { ok: 'check', warn: 'alert', error: 'alert', unknown: 'info' };

export function healthScreen(app) {
  const technical = app.prefs.get('healthTechnical', false);
  const body = h('div', null, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Sistem durumu okunuyor…'));

  const load = async () => {
    const backup = app.store.isAdmin ? await app.store.backupInfo().catch(() => null) : undefined;
    const failed = await app.store.failedAutomationRuns().catch(() => null);
    const updates = app.store.raw.states.filter((s) => s.entity_id.startsWith('update.'));
    const r = buildHealthReport({ home: app.store.home, socket: app.socket, backup, failedAutomations: failed, updates, browserOnline: navigator.onLine });
    fill(body, 
      h('div', { class: `status-pill lvl-${r.overall}`, role: 'status' }, h('span', { class: 'dot' }), `Genel durum: ${LEVEL_TEXT[r.overall]}`),
      section(
        'Sistem',
        h(
          'div',
          { class: 'list' },
          r.items.map((it) =>
            h(
              'div',
              { class: 'item', style: { alignItems: 'flex-start' } },
              h('span', { class: `lvl-${it.level}`, style: { width: '32px', height: '32px', borderRadius: '16px', display: 'grid', placeItems: 'center', flex: 'none' }, 'aria-label': LEVEL_TEXT[it.level] }, ic(LEVEL_ICON[it.level])),
              h(
                'div',
                { class: 'grow' },
                h('div', { class: 'title' }, it.title),
                h('div', { class: 'meta' }, it.text),
                it.list && it.list.length ? h('ul', { class: 'meta', style: { margin: '4px 0 0', paddingLeft: '18px' } }, it.list.slice(0, technical ? 50 : 5).map((x) => h('li', null, x))) : null,
                technical && it.details ? h('div', { class: 'meta', style: { fontFamily: 'ui-monospace, monospace', fontSize: '12px', marginTop: '4px' } }, it.details) : null,
              ),
            ),
          ),
        ),
      ),
      section(
        'Entegrasyonlar',
        r.integrations.length
          ? h(
              'div',
              { class: 'list' },
              r.integrations.map((i) =>
                h(
                  'div',
                  { class: 'item', style: { alignItems: 'flex-start' } },
                  h('span', { class: `lvl-${i.level}`, style: { width: '32px', height: '32px', borderRadius: '16px', display: 'grid', placeItems: 'center', flex: 'none' } }, ic(LEVEL_ICON[i.level])),
                  h(
                    'div',
                    { class: 'grow' },
                    h('div', { class: 'title' }, `${i.title}: ${i.text}`),
                    h('div', { class: 'meta' }, i.connectivity || ''),
                    technical ? h('div', { class: 'meta', style: { fontSize: '12px' } }, `alan adı: ${i.domain}${i.version ? ` · sürüm ${i.version}` : ''}${i.isBuiltIn === false ? ' · topluluk entegrasyonu' : ''}${i.reason ? ` · neden: ${i.reason}` : ''}`) : null,
                  ),
                ),
              ),
            )
          : h('div', { class: 'card empty' }, 'Entegrasyon listesi okunamadı.'),
      ),
      technical
        ? section(
            'Teknik',
            h(
              'div',
              { class: 'card' },
              h(
                'dl',
                { class: 'kv' },
                h('dt', null, 'HA sürümü'),
                h('dd', null, app.socket.haVersion || '?'),
                h('dt', null, 'Bağlantı'),
                h('dd', null, app.socket.status),
                h('dt', null, 'API hata sayısı'),
                h('dd', null, String(app.socket.stats.errors)),
                h('dt', null, 'Yeniden bağlanma'),
                h('dd', null, String(app.socket.stats.reconnects)),
                h('dt', null, 'Son hata'),
                h('dd', null, app.socket.stats.lastError ? app.socket.stats.lastError.details || app.socket.stats.lastError.userMessage : '-'),
                h('dt', null, 'Disk alanı'),
                h('dd', null, 'Yalnızca Home Assistant OS\'ta HA arayüzünden (Ayarlar > Sistem > Depolama) görülebilir'),
              ),
            ),
          )
        : null,
    );
  };
  load();

  return h(
    'main',
    null,
    topbar('Sistem sağlığı', { back: () => app.navigate('#/system') }),
    segmented(
      [
        [false, 'Basit'],
        [true, 'Teknik'],
      ],
      technical,
      (v) => {
        app.prefs.set('healthTechnical', v);
        app.rerender();
      },
      'Görünüm',
    ),
    h('div', { style: { height: '14px' } }),
    body,
  );
}


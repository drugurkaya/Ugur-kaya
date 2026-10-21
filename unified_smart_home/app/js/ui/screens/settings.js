import { h, ic, section, topbar, segmented, confirmDialog, toast, errorBox, fill } from '../dom.js';
import { relativeTime } from '../../core/format.js';

function link(href, iconName, title, meta) {
  return h('a', { class: 'item', href, style: { color: 'inherit', textDecoration: 'none' } }, ic(iconName), h('div', { class: 'grow' }, h('div', { class: 'title' }, title), meta ? h('div', { class: 'meta' }, meta) : null), ic('chevron', 'chev'));
}

function sessions(app) {
  const box = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Yükleniyor…'));
  const load = () =>
    app.store
      .refreshTokens()
      .then((tokens) => {
        const list = (tokens || []).filter((t) => t.type === 'normal' || t.type === 'long_lived_access_token').sort((a, b) => Date.parse(b.last_used_at || 0) - Date.parse(a.last_used_at || 0));
        fill(box, 
          ...list.map((t) =>
            h(
              'div',
              { class: 'item' },
              h(
                'div',
                { class: 'grow' },
                h('div', { class: 'title' }, t.type === 'long_lived_access_token' ? `Uzun ömürlü token: ${t.client_name || '-'}` : t.client_name || t.client_id || 'Bilinmeyen istemci', t.is_current ? ' (bu cihaz)' : ''),
                h('div', { class: 'meta' }, `Son kullanım: ${t.last_used_at ? relativeTime(t.last_used_at) : 'hiç'}${t.last_used_ip ? ` · ${t.last_used_ip}` : ''}`),
              ),
              t.is_current
                ? null
                : h(
                    'button',
                    {
                      class: 'btn danger',
                      style: { minHeight: '40px' },
                      onclick: async () => {
                        if (!(await confirmDialog({ title: 'Oturum sonlandırılsın mı?', message: 'Bu oturumu kullanan cihaz yeniden giriş yapmak zorunda kalacak.', confirmText: 'Sonlandır', danger: true }))) return;
                        try {
                          await app.store.deleteRefreshToken(t.id);
                          toast('Oturum sonlandırıldı');
                          load();
                        } catch (e) {
                          box.prepend(errorBox(e));
                        }
                      },
                    },
                    'Sonlandır',
                  ),
            ),
          ),
        );
      })
      .catch((e) => fill(box, errorBox(e)));
  load();
  return box;
}

async function exportBackup(app) {
  const out = { format: 'unified-smart-home-export', version: 1, exported_at: new Date().toISOString(), ha_version: app.socket.haVersion, automations: [], scenarios: [], areas: app.store.raw.areas, integrations: app.store.raw.configEntries.map((e) => ({ domain: e.domain, title: e.title, state: e.state, source: e.source })) };
  for (const a of app.store.automations()) {
    if (!a.configId) continue;
    try {
      out.automations.push(await app.store.getAutomationConfig(a.configId));
    } catch {
      /* YAML'da elle tanımlanmış (UI'dan yönetilmeyen) otomasyonlar okunamaz */
    }
  }
  for (const s of app.store.scripts()) {
    try {
      out.scenarios.push({ id: s.configId, config: await app.store.getScriptConfig(s.configId) });
    } catch {
      /* aynı */
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `akilli-ev-yedek-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(`${out.automations.length} otomasyon ve ${out.scenarios.length} senaryo dışa aktarıldı`);
}

export function settingsScreen(app) {
  const user = app.store.user || {};
  const theme = app.prefs.get('theme', 'system');
  const mfa = (user.mfa_modules || []).some((m) => m.enabled);
  return h(
    'main',
    null,
    topbar('Sistem'),
    h('div', { class: 'list' }, link('#/system/health', 'system', 'Sistem sağlığı', 'Bağlantılar, entegrasyonlar, yedekler'), link('#/add', 'plus', 'Yeni cihaz ekle', 'Keşif, marka uyumluluğu ve kurulum')),
    section(
      'Hesap',
      h(
        'div',
        { class: 'list' },
        h('div', { class: 'item' }, ic('user'), h('div', { class: 'grow' }, h('div', { class: 'title' }, user.name || '-'), h('div', { class: 'meta' }, user.is_admin ? 'Yönetici' : 'Standart kullanıcı (otomasyon ve oda düzenleme kapalı)'))),
        h(
          'div',
          { class: 'item' },
          ic('key'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `İki adımlı doğrulama: ${mfa ? 'Açık' : 'Kapalı'}`), h('div', { class: mfa ? 'meta' : 'meta', style: mfa ? {} : { color: 'var(--warn)' } }, mfa ? 'Hesabınız ek kodla korunuyor.' : 'Önerilir: Home Assistant > Profil > Çok faktörlü kimlik doğrulama modülleri > "Kimlik Doğrulayıcı Uygulama" ile açın.')),
        ),
        h('button', { class: 'item', onclick: async () => (await confirmDialog({ title: 'Çıkış yapılsın mı?', message: 'Bu cihazdaki oturum HA tarafında da iptal edilir.', confirmText: 'Çıkış yap' })) && app.logout() }, ic('logout'), h('div', { class: 'grow title', style: { color: 'var(--err)' } }, 'Çıkış yap')),
      ),
    ),
    section('Görünüm', segmented([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']], theme, (v) => (app.prefs.set('theme', v), app.applyTheme(), app.rerender()), 'Tema')),
    app.store.isAdmin ? section('Açık oturumlar', sessions(app)) : null,
    section(
      'Bildirimler',
      h(
        'div',
        { class: 'card' },
        h('p', { style: { marginTop: 0 } }, 'Bu uygulama bir web uygulamasıdır; kapalıyken iPhone\'a anlık bildirim (push) gönderemez. Bildirimleri Home Assistant gönderir:'),
        h('ol', { style: { paddingLeft: '20px', margin: 0 } }, h('li', null, 'App Store\'dan resmî "Home Assistant" uygulamasını kurun ve aynı hesapla giriş yapın.'), h('li', null, 'Bildirim iznini verin. HA\'da notify.mobile_app_<telefon> servisi oluşur.'), h('li', null, 'Otomasyonlarda "Bildirim gönder" > "Telefon" seçin; cihaz çevrim dışı uyarıları için HA\'daki "USH: Push bildirim servisi" alanına servis adını yazın.')),
        h('p', { class: 'hint' }, 'Uygulama içindeki uyarılar (bağlantı, çevrim dışı, enerji eşiği) yalnızca uygulama açıkken görünür.'),
      ),
    ),
    section(
      'Uzaktan erişim',
      h(
        'div',
        { class: 'card' },
        h('p', { style: { marginTop: 0 } }, `Bu uygulamanın adresi: ${location.origin}${location.pathname}`),
        h('p', { class: 'hint' }, location.protocol === 'https:' ? 'Bağlantı HTTPS ile şifreli.' : 'Bağlantı şifreli değil. Ev dışından erişim için Home Assistant Cloud (Nabu Casa) veya VPN (ör. WireGuard/Tailscale) kullanın; yönlendiricide port açmayın.'),
      ),
    ),
    app.store.isAdmin
      ? section(
          'Yedekleme',
          h(
            'div',
            { class: 'card' },
            h('p', { style: { marginTop: 0 } }, 'Tam yedek için Home Assistant\'ın yedekleme özelliğini kullanın (Ayarlar > Sistem > Yedeklemeler). Aşağıdaki düğme otomasyon, senaryo, oda ve entegrasyon listesini ayrıca bir JSON dosyasına aktarır.'),
            h('button', { class: 'btn block', onclick: () => exportBackup(app).catch((e) => toast(e.userMessage || 'Dışa aktarma başarısız')) }, ic('download'), 'Otomasyon ve senaryoları dışa aktar'),
          ),
        )
      : null,
    h('p', { class: 'hint', style: { textAlign: 'center', marginTop: '24px' } }, `Unified Smart Home · Home Assistant ${app.socket.haVersion || ''}`),
  );
}

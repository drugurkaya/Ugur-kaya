// Sistem sağlığı: yalnızca gerçekten okunan verilere dayanır. Okunamayan bir bilgi "bilinmiyor"
// olarak gösterilir; hiçbir zaman varsayılan olarak yeşil/başarılı gösterilmez.

import { CONNECTIVITY_LABELS } from './model.js';

export const Level = Object.freeze({ OK: 'ok', WARN: 'warn', ERROR: 'error', UNKNOWN: 'unknown' });

const ENTRY_STATE = {
  loaded: { level: Level.OK, text: 'Bağlı' },
  setup_in_progress: { level: Level.WARN, text: 'Kuruluyor…' },
  setup_retry: { level: Level.ERROR, text: 'Bağlantı kurulamıyor, yeniden deneniyor' },
  setup_error: { level: Level.ERROR, text: 'Kurulum hatası' },
  migration_error: { level: Level.ERROR, text: 'Güncelleme sonrası yapılandırma hatası' },
  failed_unload: { level: Level.ERROR, text: 'Kaldırılamadı' },
  not_loaded: { level: Level.WARN, text: 'Yüklenmedi' },
};

export function integrationStatus(integ) {
  if (integ.disabled) return { level: Level.UNKNOWN, text: 'Devre dışı bırakılmış' };
  const base = ENTRY_STATE[integ.state] || { level: Level.UNKNOWN, text: `Bilinmeyen durum (${integ.state})` };
  let text = base.text;
  // Kimlik doğrulama hatalarını ayrıca belirt (HA "reauth" gerektiğinde reason içinde bildirir).
  if (integ.reason && /auth|credential|token|login/i.test(integ.reason)) text = 'Kimlik doğrulama gerekiyor';
  return { level: base.level, text, reason: integ.reason || null };
}

export function relativeMinutes(iso, now = Date.now()) {
  if (!iso) return null;
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 60000));
}

/**
 * @param {object} p
 * @param {object} p.home buildHome çıktısı
 * @param {object} p.socket {status, stats, haVersion}
 * @param {object} [p.config] get_config
 * @param {object} [p.backup] backup/info (yalnızca yönetici)
 * @param {Array} [p.failedAutomations] [{name, when, error}]
 * @param {boolean} [p.browserOnline] navigator.onLine
 */
export function buildHealthReport(p) {
  const now = p.now || Date.now();
  const items = [];

  // Merkez bağlantısı
  const connected = p.socket.status === 'connected';
  items.push({
    key: 'hub',
    title: 'Home Assistant bağlantısı',
    level: connected ? Level.OK : p.socket.status === 'auth_failed' ? Level.ERROR : Level.ERROR,
    text: connected
      ? `Bağlı${p.socket.haVersion ? ` (sürüm ${p.socket.haVersion})` : ''}`
      : p.socket.status === 'auth_failed'
        ? 'Kimlik doğrulama başarısız'
        : 'Merkezle bağlantı kurulamadı. Ağ bağlantısını ve Home Assistant hizmetini kontrol edin.',
    details: `Durum: ${p.socket.status}; yeniden bağlanma: ${p.socket.stats.reconnects}; API hata sayısı: ${p.socket.stats.errors}`,
  });

  // Telefonun ağı
  items.push({
    key: 'phone_network',
    title: 'Bu cihazın ağ bağlantısı',
    level: p.browserOnline === false ? Level.ERROR : p.browserOnline === true ? Level.OK : Level.UNKNOWN,
    text: p.browserOnline === false ? 'Telefon çevrim dışı' : p.browserOnline === true ? 'Ağa bağlı' : 'Bilinmiyor',
  });

  // Ev interneti: doğrudan ölçülemez. Bulut entegrasyonlarının durumundan ÇIKARIM yapılır ve bu belirtilir.
  const cloud = (p.home.integrations || []).filter((i) => i.connectivity === 'cloud' && !i.disabled);
  const cloudBad = cloud.filter((i) => integrationStatus(i).level === Level.ERROR);
  items.push({
    key: 'internet',
    title: 'Ev internet erişimi (çıkarım)',
    level: !connected ? Level.UNKNOWN : !cloud.length ? Level.UNKNOWN : cloudBad.length ? Level.WARN : Level.OK,
    text: !connected
      ? 'Merkeze bağlanılamadığı için bilinmiyor'
      : !cloud.length
        ? 'Bulut entegrasyonu olmadığından ölçülemiyor'
        : cloudBad.length === cloud.length
          ? 'Tüm bulut entegrasyonları erişilemez durumda; ev internetinde sorun olabilir'
          : cloudBad.length
            ? `${cloudBad.length}/${cloud.length} bulut entegrasyonuna ulaşılamıyor (${cloudBad.map((i) => i.name).join(', ')}); internet kısmen çalışıyor veya üretici sunucusunda sorun var`
            : 'Bulut entegrasyonları erişilebilir',
    details: 'Bu bilgi doğrudan ölçüm değildir; bulut tabanlı entegrasyonların bağlantı durumundan çıkarılır.',
  });

  // Son veri güncellemesi
  const lastMsgMin = relativeMinutes(p.socket.stats.lastMessageAt, now);
  items.push({
    key: 'last_update',
    title: 'Son veri güncellemesi',
    level: lastMsgMin == null ? Level.UNKNOWN : lastMsgMin <= 2 ? Level.OK : Level.WARN,
    text: lastMsgMin == null ? 'Henüz veri alınmadı' : lastMsgMin === 0 ? 'Az önce' : `${lastMsgMin} dakika önce`,
  });

  // Çevrim dışı cihazlar
  const offline = [...p.home.entities.values()].filter((e) => e.availability === 'offline' && !e.category);
  items.push({
    key: 'offline',
    title: 'Çevrim dışı cihazlar',
    level: !connected ? Level.UNKNOWN : offline.length ? Level.WARN : Level.OK,
    text: !connected ? 'Bilinmiyor' : offline.length ? `${offline.length} cihaz yanıt vermiyor` : 'Tüm cihazlar yanıt veriyor',
    list: offline.map((e) => {
      const m = relativeMinutes(e.lastChanged, now);
      return `${e.name}: ${m == null ? 'yanıt vermiyor' : `son ${m} dakikadır yanıt vermiyor`}`;
    }),
  });

  // Otomasyon hataları
  const failed = p.failedAutomations || null;
  items.push({
    key: 'automation_failures',
    title: 'Son başarısız otomasyon',
    level: failed == null ? Level.UNKNOWN : failed.length ? Level.WARN : Level.OK,
    text: failed == null ? 'Bilinmiyor (iz kayıtları okunamadı)' : failed.length ? `${failed[0].name}: ${failed[0].error}` : 'Son çalışmalarda hata yok',
  });

  // Yedekleme
  if (p.backup === undefined) {
    items.push({ key: 'backup', title: 'Yedekleme', level: Level.UNKNOWN, text: 'Yalnızca yönetici hesapla görüntülenebilir' });
  } else if (p.backup === null) {
    items.push({ key: 'backup', title: 'Yedekleme', level: Level.UNKNOWN, text: 'Yedekleme bilgisi alınamadı' });
  } else {
    const backups = p.backup.backups || [];
    const latest = backups.map((b) => Date.parse(b.date)).filter((x) => !Number.isNaN(x)).sort((a, b) => b - a)[0];
    const auto = p.backup.last_completed_automatic_backup ? Date.parse(p.backup.last_completed_automatic_backup) : null;
    const last = Math.max(latest || 0, auto || 0) || null;
    const days = last ? Math.floor((now - last) / 86400000) : null;
    items.push({
      key: 'backup',
      title: 'Yedekleme',
      level: last == null ? Level.ERROR : days > 7 ? Level.WARN : Level.OK,
      text: last == null ? 'Hiç yedek alınmamış' : days === 0 ? 'Son yedek bugün alındı' : `Son yedek ${days} gün önce alındı`,
      details: p.backup.next_automatic_backup ? `Sonraki otomatik yedek: ${p.backup.next_automatic_backup}` : 'Otomatik yedekleme planlanmamış',
    });
  }

  // Güncellemeler
  const updates = [...(p.updates || [])].filter((u) => u.state === 'on');
  items.push({
    key: 'updates',
    title: 'Güncellemeler',
    level: p.updates == null ? Level.UNKNOWN : updates.length ? Level.WARN : Level.OK,
    text: p.updates == null ? 'Bilinmiyor' : updates.length ? `${updates.length} güncelleme mevcut` : 'Güncel',
    list: updates.map((u) => `${u.attributes.friendly_name || u.entity_id}: ${u.attributes.installed_version || '?'} → ${u.attributes.latest_version || '?'}`),
  });

  const integrations = (p.home.integrations || []).map((i) => {
    const st = integrationStatus(i);
    return {
      ...st,
      domain: i.domain,
      title: `${i.name}${i.title && i.title !== i.name ? ` (${i.title})` : ''}`,
      connectivity: CONNECTIVITY_LABELS[i.connectivity],
      version: i.version,
      isBuiltIn: i.isBuiltIn,
    };
  });

  const worst = [...items.map((i) => i.level), ...integrations.map((i) => i.level)];
  const overall = worst.includes(Level.ERROR) ? Level.ERROR : worst.includes(Level.WARN) ? Level.WARN : connected ? Level.OK : Level.UNKNOWN;
  return { overall, items, integrations };
}

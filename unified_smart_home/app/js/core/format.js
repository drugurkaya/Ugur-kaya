// Türkçe biçimlendirme yardımcıları.

const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const money = (cur) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur || 'TRY', maximumFractionDigits: 2 });

export function num(v, digits = 1) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return (digits === 2 ? nf2 : nf1).format(n);
}

export function currency(v, cur) {
  return money(cur).format(v);
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return 'bilinmiyor';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return 'bilinmiyor';
  const s = Math.round((now - t) / 1000);
  if (s < 0) return 'şimdi';
  if (s < 45) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  const d = Math.round(s / 86400);
  if (d < 30) return `${d} gün önce`;
  return new Date(t).toLocaleDateString('tr-TR');
}

export function clock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

const DOMAIN_STATE = {
  light: { on: 'Açık', off: 'Kapalı' },
  switch: { on: 'Açık', off: 'Kapalı' },
  fan: { on: 'Çalışıyor', off: 'Kapalı' },
  siren: { on: 'Çalıyor', off: 'Sessiz' },
  humidifier: { on: 'Açık', off: 'Kapalı' },
  cover: { open: 'Açık', closed: 'Kapalı', opening: 'Açılıyor', closing: 'Kapanıyor', stopped: 'Durdu' },
  valve: { open: 'Açık', closed: 'Kapalı', opening: 'Açılıyor', closing: 'Kapanıyor' },
  lock: { locked: 'Kilitli', unlocked: 'Kilit açık', locking: 'Kilitleniyor', unlocking: 'Açılıyor', jammed: 'Sıkıştı!', open: 'Açık', opening: 'Açılıyor' },
  alarm_control_panel: {
    disarmed: 'Devre dışı',
    armed_home: 'Evde modu',
    armed_away: 'Dışarıda modu',
    armed_night: 'Gece modu',
    armed_vacation: 'Tatil modu',
    armed_custom_bypass: 'Özel mod',
    arming: 'Kuruluyor',
    disarming: 'Devre dışı bırakılıyor',
    pending: 'Bekliyor',
    triggered: 'ALARM!',
  },
  climate: { off: 'Kapalı', heat: 'Isıtma', cool: 'Soğutma', heat_cool: 'Otomatik', auto: 'Otomatik', dry: 'Nem alma', fan_only: 'Fan' },
  media_player: { on: 'Açık', off: 'Kapalı', playing: 'Oynatılıyor', paused: 'Duraklatıldı', idle: 'Boşta', standby: 'Beklemede' },
  vacuum: { cleaning: 'Temizliyor', docked: 'İstasyonda', returning: 'Dönüyor', idle: 'Boşta', paused: 'Duraklatıldı', error: 'Hata' },
  water_heater: { off: 'Kapalı', eco: 'Eko', electric: 'Elektrik', gas: 'Gaz', performance: 'Performans', heat_pump: 'Isı pompası' },
};

export const HVAC_LABELS = DOMAIN_STATE.climate;

/** Bir varlığın durumunu kullanıcıya gösterilecek Türkçe metne çevirir. */
export function stateText(entity) {
  const s = entity.state;
  if (s === 'unavailable') return 'Çevrim dışı';
  if (s === 'unknown') return 'Bilinmiyor';
  const a = entity.attributes || {};
  if (entity.domain === 'sensor') {
    const n = Number(s);
    return Number.isNaN(n) ? s : `${num(n)}${a.unit_of_measurement ? ` ${a.unit_of_measurement}` : ''}`;
  }
  if (entity.domain === 'binary_sensor') {
    const dc = a.device_class;
    if (['motion', 'occupancy', 'presence'].includes(dc)) return s === 'on' ? 'Hareket var' : 'Hareket yok';
    if (['door', 'window', 'opening', 'garage_door'].includes(dc)) return s === 'on' ? 'Açık' : 'Kapalı';
    if (['smoke', 'gas', 'moisture', 'carbon_monoxide', 'safety', 'problem'].includes(dc)) return s === 'on' ? 'Uyarı!' : 'Normal';
    if (dc === 'battery') return s === 'on' ? 'Pil zayıf' : 'Pil normal';
    if (dc === 'connectivity') return s === 'on' ? 'Bağlı' : 'Bağlantı yok';
    return s === 'on' ? 'Açık' : 'Kapalı';
  }
  if (entity.domain === 'button') return 'Düğme';
  if (entity.domain === 'light' && s === 'on' && a.brightness != null) return `Açık · %${Math.round((a.brightness / 255) * 100)}`;
  if ((entity.domain === 'cover' || entity.domain === 'valve') && a.current_position != null && s !== 'closed') {
    return `${DOMAIN_STATE[entity.domain][s] || s} · %${a.current_position}`;
  }
  if (entity.domain === 'climate' && a.current_temperature != null) {
    return `${DOMAIN_STATE.climate[s] || s} · ${num(a.current_temperature)}°`;
  }
  return (DOMAIN_STATE[entity.domain] && DOMAIN_STATE[entity.domain][s]) || s;
}

export const DOMAIN_LABELS = {
  light: 'Aydınlatma',
  switch: 'Anahtar / priz',
  fan: 'Fan',
  cover: 'Panjur / kapı',
  climate: 'İklimlendirme',
  lock: 'Kilit',
  alarm_control_panel: 'Alarm',
  sensor: 'Sensör',
  binary_sensor: 'Algılayıcı',
  valve: 'Vana',
  water_heater: 'Su ısıtıcı',
  humidifier: 'Nemlendirici',
  media_player: 'Medya',
  vacuum: 'Süpürge',
  siren: 'Siren',
  button: 'Düğme',
  camera: 'Kamera',
  number: 'Ayar',
  select: 'Seçim',
};

/** Basit, tutarlı simge seti (emoji yerine SVG yolu adları; ui/icons.js çizer). */
export function iconFor(entity) {
  const a = entity.attributes || {};
  const dc = a.device_class;
  switch (entity.domain) {
    case 'light':
      return 'bulb';
    case 'switch':
      return dc === 'outlet' ? 'plug' : 'power';
    case 'fan':
      return 'fan';
    case 'cover':
      return dc === 'garage' ? 'garage' : dc === 'door' || dc === 'gate' ? 'door' : 'blinds';
    case 'climate':
    case 'water_heater':
      return 'thermo';
    case 'lock':
      return 'lock';
    case 'alarm_control_panel':
      return 'shield';
    case 'valve':
      return 'valve';
    case 'media_player':
      return 'media';
    case 'vacuum':
      return 'vacuum';
    case 'siren':
      return 'siren';
    case 'button':
      return 'button';
    case 'camera':
      return 'camera';
    case 'binary_sensor':
      if (['motion', 'occupancy', 'presence'].includes(dc)) return 'motion';
      if (['door', 'window', 'opening', 'garage_door'].includes(dc)) return 'door';
      return 'sensor';
    case 'sensor':
      if (dc === 'temperature') return 'thermo';
      if (dc === 'humidity') return 'drop';
      if (dc === 'power' || dc === 'energy') return 'bolt';
      if (dc === 'battery') return 'battery';
      return 'sensor';
    default:
      return 'sensor';
  }
}

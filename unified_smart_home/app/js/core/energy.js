// Enerji takibi. Yalnızca GERÇEKTEN ölçüm yapan sensörler kullanılır:
//  * Anlık güç: device_class=power (W/kW)
//  * Tüketilen enerji: device_class=energy ve state_class total/total_increasing (Wh/kWh/MWh)
// Tahmini değer üretilmez. Maliyet yalnızca kullanıcı bir tarife girdiyse hesaplanır ve "tahmini" etiketlenir.
// Geçmiş veriler HA kayıt (recorder) istatistiklerinden okunur: recorder/statistics_during_period.

const ENERGY_FACTORS = { Wh: 0.001, kWh: 1, MWh: 1000 };
const POWER_FACTORS = { W: 1, kW: 1000 };

export function powerSensors(home) {
  return [...home.entities.values()].filter(
    (e) => e.domain === 'sensor' && e.attributes.device_class === 'power' && POWER_FACTORS[e.attributes.unit_of_measurement] != null,
  );
}

export function energySensors(home) {
  return [...home.entities.values()].filter(
    (e) =>
      e.domain === 'sensor' &&
      e.attributes.device_class === 'energy' &&
      ['total', 'total_increasing'].includes(e.attributes.state_class) &&
      ENERGY_FACTORS[e.attributes.unit_of_measurement] != null,
  );
}

/** Anlık gücü W cinsinden döndürür; okunamıyorsa null. */
export function powerWatts(entity) {
  const v = Number(entity.state);
  if (entity.availability !== 'online' || Number.isNaN(v)) return null;
  return v * POWER_FACTORS[entity.attributes.unit_of_measurement];
}

export function energyFactor(unit) {
  return ENERGY_FACTORS[unit] ?? null;
}

/** Periyot başlangıcı (yerel saat). */
export function periodStart(period, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7; // Pazartesi = 0
    d.setDate(d.getDate() - day);
  } else if (period === 'month') {
    d.setDate(1);
  }
  return d;
}

/**
 * HA istatistik yanıtından (her satırda "change") periyot içi kWh toplamlarını hesaplar.
 * @param {Record<string, Array<{start:number, change?:number}>>} stats
 * @param {Record<string, string>} units entity_id -> birim
 * @returns {{perEntity: Record<string, number>, buckets: Array<{start:number, kwh:number}>}}
 */
export function aggregateStatistics(stats, units) {
  const perEntity = {};
  const bucketMap = new Map();
  for (const [eid, rows] of Object.entries(stats || {})) {
    const f = ENERGY_FACTORS[units[eid]];
    if (f == null) continue;
    let total = 0;
    for (const r of rows) {
      if (typeof r.change !== 'number' || Number.isNaN(r.change)) continue;
      const kwh = r.change * f;
      total += kwh;
      bucketMap.set(r.start, (bucketMap.get(r.start) || 0) + kwh);
    }
    perEntity[eid] = total;
  }
  const buckets = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]).map(([start, kwh]) => ({ start, kwh }));
  return { perEntity, buckets };
}

/** Oda bazında toplam: odası olmayan sensörler "Odasız" altında toplanır. */
export function byArea(home, perEntity) {
  const out = new Map();
  for (const [eid, kwh] of Object.entries(perEntity)) {
    const e = home.entities.get(eid);
    const areaId = e ? e.areaId : null;
    out.set(areaId, (out.get(areaId) || 0) + kwh);
  }
  return out;
}

/** Tarife girilmişse tahmini maliyet; girilmemişse null (kesin maliyet iddia edilmez). */
export function estimateCost(kwh, tariffPerKwh) {
  const t = Number(tariffPerKwh);
  if (kwh == null || !(t > 0)) return null;
  return kwh * t;
}

export function thresholdExceeded(valueW, thresholdW) {
  const t = Number(thresholdW);
  return valueW != null && t > 0 && valueW > t;
}

import { h, ic, section, topbar, segmented, openSheet, toast, fill } from '../dom.js';
import { powerSensors, energySensors, powerWatts, aggregateStatistics, estimateCost, periodStart, byArea, thresholdExceeded } from '../../core/energy.js';
import { num, currency } from '../../core/format.js';

function barChart(buckets, period) {
  if (!buckets.length) return h('div', { class: 'empty' }, 'Bu dönem için kayıtlı ölçüm yok.');
  const W = 320;
  const H = 150;
  const max = Math.max(...buckets.map((b) => b.kwh), 0.001);
  const bw = W / buckets.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 18}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tüketim grafiği, en yüksek ${num(max, 2)} kWh`);
  const line = document.createElementNS(ns, 'line');
  Object.entries({ x1: 0, x2: W, y1: H, y2: H, class: 'grid' }).forEach(([k, v]) => line.setAttribute(k, v));
  svg.appendChild(line);
  buckets.forEach((b, i) => {
    const bh = Math.max(1, (b.kwh / max) * (H - 8));
    const r = document.createElementNS(ns, 'rect');
    Object.entries({ x: i * bw + bw * 0.15, y: H - bh, width: bw * 0.7, height: bh, rx: 3, class: 'bar' }).forEach(([k, v]) => r.setAttribute(k, v));
    const t = document.createElementNS(ns, 'title');
    const d = new Date(b.start);
    t.textContent = `${period === 'day' ? d.toLocaleTimeString('tr-TR', { hour: '2-digit' }) : d.toLocaleDateString('tr-TR')}: ${num(b.kwh, 2)} kWh`;
    r.appendChild(t);
    svg.appendChild(r);
    const every = Math.ceil(buckets.length / 6);
    if (i % every === 0) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', i * bw + bw / 2);
      tx.setAttribute('y', H + 13);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'axis');
      tx.textContent = period === 'day' ? String(d.getHours()) : String(d.getDate());
      svg.appendChild(tx);
    }
  });
  return svg;
}

function hbars(rows, unit) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return h(
    'div',
    { class: 'card bars-h' },
    rows.map((r) => h('div', { class: 'row' }, h('span', null, r.label), h('strong', { style: { fontVariantNumeric: 'tabular-nums' } }, `${num(r.value, 2)} ${unit}`), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(r.value / max) * 100}%` } })))),
  );
}

function settingsSheet(app) {
  const tariff = h('input', { class: 'input', type: 'number', step: '0.01', min: 0, inputmode: 'decimal', value: app.prefs.get('tariff', '') });
  const thr = h('input', { class: 'input', type: 'number', step: '10', min: 0, inputmode: 'numeric', value: app.prefs.get('powerThreshold', '') });
  const ref = openSheet(
    'Enerji ayarları',
    h(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault();
          app.prefs.set('tariff', tariff.value === '' ? '' : Number(tariff.value));
          app.prefs.set('powerThreshold', thr.value === '' ? '' : Number(thr.value));
          ref.close();
          toast('Kaydedildi');
          app.rerender();
        },
      },
      h('div', { class: 'field' }, h('label', null, `Elektrik birim fiyatı (${app.store.config?.currency || 'TRY'}/kWh)`), tariff, h('div', { class: 'hint' }, 'Faturanızdaki tüm vergiler dahil birim fiyatı girin. Girilmezse maliyet hesaplanmaz.')),
      h('div', { class: 'field' }, h('label', null, 'Anlık güç uyarı eşiği (W)'), thr, h('div', { class: 'hint' }, 'Toplam anlık güç bu değeri aşarsa bu ekranda uyarı gösterilir. Telefon bildirimi için aşağıdaki "Eşik bildirimi oluştur" ile bir otomasyon kurun.')),
      h('button', { class: 'btn primary block', type: 'submit' }, 'Kaydet'),
    ),
  );
}

export function energyScreen(app) {
  const home = app.store.home;
  const powers = powerSensors(home);
  const energies = energySensors(home);
  const period = app.prefs.get('energyPeriod', 'day');
  const tariff = app.prefs.get('tariff', '');
  const threshold = app.prefs.get('powerThreshold', '');
  const cur = app.store.config?.currency || 'TRY';

  if (!powers.length && !energies.length) {
    return h(
      'main',
      null,
      topbar('Enerji'),
      h('div', { class: 'card empty' }, h('strong', null, 'Enerji ölçen cihaz bulunamadı'), 'Enerji takibi yalnızca güç/enerji ölçümü yapan cihazlarla (ör. ölçümlü akıllı prizler) mümkündür. Ölçüm yapmayan cihazlar için tahmini değer gösterilmez.'),
    );
  }

  const totalPower = () => {
    const vals = powers.map((p) => powerWatts(app.store.home.entities.get(p.id) || p)).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const renderPowerSummary = () => {
    const total = totalPower();
    const over = thresholdExceeded(total, threshold);
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'meta', style: { color: 'var(--text-2)' } }, 'Anlık toplam güç (ölçen cihazlar)'),
      h('div', { style: { fontSize: '40px', fontWeight: 750, fontVariantNumeric: 'tabular-nums' } }, total == null ? '—' : `${num(total, 0)} W`),
      over ? h('div', { class: 'warn-box' }, `Tanımladığınız ${threshold} W eşiği aşıldı.`) : null,
      h('div', { class: 'hint' }, `${powers.length} ölçüm sensörü. Ölçümü olmayan cihazlar dahil değildir.`),
    );
  };
  const summaryHolder = h('div', null, renderPowerSummary());
  const unsub = app.store.onStateChange((st) => {
    if (!summaryHolder.isConnected) return unsub();
    if (powers.some((p) => p.id === st.entity_id)) fill(summaryHolder, renderPowerSummary());
  });

  const statsBox = h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Geçmiş veriler yükleniyor…'));
  const perDeviceBox = h('div');
  const perAreaBox = h('div');
  if (energies.length) {
    const start = periodStart(period);
    app.store
      .statistics(energies.map((e) => e.id), start, null, period === 'day' ? 'hour' : 'day')
      .then((stats) => {
        const units = Object.fromEntries(energies.map((e) => [e.id, e.attributes.unit_of_measurement]));
        const agg = aggregateStatistics(stats, units);
        // Hiç kayıt yoksa "0 kWh" demek yanıltıcı olur: değer bilinmiyor.
        const total = agg.buckets.length ? Object.values(agg.perEntity).reduce((a, b) => a + b, 0) : null;
        const cost = estimateCost(total, tariff);
        fill(statsBox, 
          h('div', { class: 'meta', style: { color: 'var(--text-2)' } }, 'Tüketilen enerji'),
          h('div', { style: { fontSize: '32px', fontWeight: 750, fontVariantNumeric: 'tabular-nums' } }, total == null ? '—' : `${num(total, 2)} kWh`),
          total == null ? null : cost != null ? h('div', { class: 'meta' }, `Tahmini maliyet: ${currency(cost, cur)} (girdiğiniz tarifeye göre)`) : h('div', { class: 'hint' }, 'Maliyet için Ayarlar\'dan elektrik birim fiyatını girin.'),
          barChart(agg.buckets, period),
        );
        const devRows = Object.entries(agg.perEntity)
          .map(([id, v]) => ({ label: app.store.home.entities.get(id)?.name || id, value: v }))
          .sort((a, b) => b.value - a.value);
        fill(perDeviceBox, devRows.length ? hbars(devRows, 'kWh') : h('div', { class: 'empty' }, 'Veri yok'));
        const areaRows = [...byArea(app.store.home, agg.perEntity).entries()].map(([aid, v]) => ({ label: app.store.home.areas.find((a) => a.id === aid)?.name || 'Odasız', value: v })).sort((a, b) => b.value - a.value);
        fill(perAreaBox, areaRows.length ? hbars(areaRows, 'kWh') : h('div', { class: 'empty' }, 'Veri yok'));
      })
      .catch((e) => fill(statsBox, h('div', { class: 'error-box' }, `Geçmiş veriler okunamadı: ${e.userMessage}`)));
  } else {
    fill(statsBox, h('div', { class: 'empty' }, 'Toplam enerji (kWh) ölçen sensör yok; yalnızca anlık güç gösterilebilir.'));
  }

  return h(
    'main',
    null,
    topbar('Enerji', { actions: [h('button', { class: 'icon-btn', 'aria-label': 'Enerji ayarları', onclick: () => settingsSheet(app) }, ic('settings'))] }),
    summaryHolder,
    section(
      'Tüketim',
      h(
        'div',
        null,
        segmented(
          [
            ['day', 'Bugün'],
            ['week', 'Bu hafta'],
            ['month', 'Bu ay'],
          ],
          period,
          (v) => {
            app.prefs.set('energyPeriod', v);
            app.rerender();
          },
          'Dönem',
        ),
        h('div', { style: { height: '10px' } }),
        statsBox,
      ),
    ),
    energies.length ? section('Cihaz bazında', perDeviceBox) : null,
    energies.length ? section('Oda bazında', perAreaBox) : null,
    powers.length
      ? section(
          'Uyarılar',
          h(
            'button',
            {
              class: 'btn block',
              onclick: () => {
                const p = powers[0];
                // Ön doldurulmuş eşik otomasyonu; kullanıcı kaydetmeden önce düzenleyebilir.
                app.prefill = {
                  alias: `${p.name} güç eşiği`,
                  mode: 'single',
                  triggers: [{ kind: 'numeric', entityId: p.id, above: Number(threshold) || 1500, below: null, forSec: 60 }],
                  conditions: [],
                  actions: [{ kind: 'notify', title: 'Enerji uyarısı', message: `${p.name} belirlenen güç eşiğini aştı.`, target: 'notify' }],
                };
                app.navigate('#/automation/new');
              },
            },
            ic('bell'),
            'Eşik bildirimi oluştur',
          ),
        )
      : null,
  );
}

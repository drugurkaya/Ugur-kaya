import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoFixture } from './helpers.mjs';
import { buildHome } from '../../app/js/core/model.js';
import { powerSensors, energySensors, powerWatts, aggregateStatistics, estimateCost, periodStart, byArea } from '../../app/js/core/energy.js';
import { buildHealthReport, integrationStatus, Level } from '../../app/js/core/health.js';
import { stateText, relativeTime } from '../../app/js/core/format.js';

const fx = loadDemoFixture();

test('enerji: yalnızca gerçek ölçüm sensörleri seçilir', () => {
  const home = buildHome(fx);
  assert.deepEqual(powerSensors(home).map((e) => e.id), ['sensor.power_consumption']);
  const en = energySensors(home).map((e) => e.id).sort();
  assert.deepEqual(en, ['sensor.total_energy_kwh', 'sensor.total_energy_mwh']);
  assert.equal(powerWatts(home.entities.get('sensor.power_consumption')), 100);
});

test('istatistikler kWh\'e çevrilip toplanır; birim farkı gözetilir', () => {
  const r = aggregateStatistics(
    { 'sensor.a': [{ start: 1, change: 1.5 }, { start: 2, change: 0.5 }], 'sensor.b': [{ start: 1, change: 0.001 }, { start: 2 }] },
    { 'sensor.a': 'kWh', 'sensor.b': 'MWh' },
  );
  assert.equal(r.perEntity['sensor.a'], 2);
  assert.equal(r.perEntity['sensor.b'], 1);
  assert.deepEqual(r.buckets, [{ start: 1, kwh: 2.5 }, { start: 2, kwh: 0.5 }]);
});

test('tarife yoksa maliyet hesaplanmaz', () => {
  assert.equal(estimateCost(10, null), null);
  assert.equal(estimateCost(10, 0), null);
  assert.equal(estimateCost(10, 2.5), 25);
});

test('periyot başlangıçları', () => {
  const now = new Date(2026, 9, 21, 15, 30); // Çarşamba
  assert.equal(periodStart('day', now).getDate(), 21);
  assert.equal(periodStart('week', now).getDate(), 19); // Pazartesi
  assert.equal(periodStart('month', now).getDate(), 1);
});

test('oda bazında enerji', () => {
  const home = buildHome(fx);
  const m = byArea(home, { 'sensor.total_energy_kwh': 3 });
  assert.equal([...m.values()][0], 3);
});

test('sağlık: bağlantı yoksa hiçbir şey yeşil gösterilmez', () => {
  const home = buildHome(fx);
  const r = buildHealthReport({ home, socket: { status: 'reconnecting', stats: { errors: 2, reconnects: 1, lastMessageAt: null }, haVersion: null } });
  assert.notEqual(r.overall, Level.OK);
  const hub = r.items.find((i) => i.key === 'hub');
  assert.equal(hub.level, Level.ERROR);
  assert.match(hub.text, /Merkezle bağlantı kurulamadı/);
  assert.equal(r.items.find((i) => i.key === 'offline').level, Level.UNKNOWN);
  assert.equal(r.items.find((i) => i.key === 'backup').level, Level.UNKNOWN);
});

test('sağlık: entegrasyon durumları Türkçe', () => {
  assert.equal(integrationStatus({ state: 'loaded' }).text, 'Bağlı');
  assert.equal(integrationStatus({ state: 'setup_error', reason: 'Authentication failed' }).text, 'Kimlik doğrulama gerekiyor');
  assert.equal(integrationStatus({ state: 'setup_retry' }).level, Level.ERROR);
  assert.equal(integrationStatus({ state: 'weird' }).level, Level.UNKNOWN);
});

test('sağlık: hiç yedek yoksa hata, çevrim dışı cihaz süresiyle listelenir', () => {
  const data = structuredClone(fx);
  const now = Date.parse('2026-10-21T21:00:00Z');
  const s = data.states.find((x) => x.entity_id === 'switch.ac');
  s.state = 'unavailable';
  s.last_changed = '2026-10-21T20:45:00Z';
  const r = buildHealthReport({
    home: buildHome(data),
    socket: { status: 'connected', stats: { errors: 0, reconnects: 0, lastMessageAt: now }, haVersion: '2026.2.3' },
    backup: { backups: [] },
    now,
  });
  assert.equal(r.items.find((i) => i.key === 'backup').level, Level.ERROR);
  const off = r.items.find((i) => i.key === 'offline');
  assert.ok(off.list.some((l) => l.includes('AC') && l.includes('15 dakikadır')));
});

test('Türkçe durum metinleri', () => {
  assert.equal(stateText({ domain: 'light', state: 'on', attributes: { brightness: 128 } }), 'Açık · %50');
  assert.equal(stateText({ domain: 'lock', state: 'locked', attributes: {} }), 'Kilitli');
  assert.equal(stateText({ domain: 'sensor', state: '21.46', attributes: { unit_of_measurement: '°C' } }), '21,5 °C');
  assert.equal(stateText({ domain: 'binary_sensor', state: 'on', attributes: { device_class: 'motion' } }), 'Hareket var');
  assert.equal(stateText({ domain: 'switch', state: 'unavailable', attributes: {} }), 'Çevrim dışı');
  assert.equal(relativeTime(Date.now() - 5 * 60000), '5 dk önce');
});

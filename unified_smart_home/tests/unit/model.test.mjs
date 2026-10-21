import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoFixture } from './helpers.mjs';
import {
  buildHome,
  capabilitiesFor,
  connectivityFor,
  isSensitive,
  availabilityOf,
  applyStateChange,
  summarize,
  Connectivity,
} from '../../app/js/core/model.js';

const fx = loadDemoFixture();

test('gerçek HA demo verisinden model kurulur', () => {
  const home = buildHome(fx);
  assert.ok(home.entities.size > 30);
  assert.ok(home.devices.size > 10);
  assert.equal(home.areas.length, 3);
  const bed = home.entities.get('light.bed_light');
  assert.equal(bed.domain, 'light');
  assert.equal(bed.integration, 'demo');
  assert.equal(bed.simulated, true, 'demo cihazları simülasyon olarak işaretlenmeli');
  assert.equal(bed.connectivity, Connectivity.SIMULATED);
  assert.ok(bed.deviceId, 'cihaz kaydı ile ilişkilendirilmeli');
});

test('cihaza ait olmayan sistem alanları (zone, sun, update) cihaz listesine girmez', () => {
  const home = buildHome(fx);
  for (const id of home.entities.keys()) {
    assert.ok(!id.startsWith('zone.') && !id.startsWith('sun.') && !id.startsWith('update.'), id);
  }
});

test('yetenekler supported_features/renk modlarından çıkarılır', () => {
  const st = (id) => fx.states.find((s) => s.entity_id === id);
  assert.deepEqual(capabilitiesFor(st('light.bed_light')).slice(0, 4), ['on_off', 'brightness', 'color_temp', 'color']);
  assert.deepEqual(capabilitiesFor(st('switch.ac')), ['on_off']);
  // garaj kapısı yalnızca aç/kapat destekler (features=3): konum kontrolü OLMAMALI
  assert.deepEqual(capabilitiesFor(st('cover.garage_door')), ['open', 'close']);
  assert.ok(capabilitiesFor(st('cover.hall_window')).includes('position'));
  assert.ok(capabilitiesFor(st('lock.openable_lock')).includes('open_latch'));
  assert.ok(!capabilitiesFor(st('lock.front_door')).includes('open_latch'));
  const alarm = capabilitiesFor(st('alarm_control_panel.security'));
  assert.ok(alarm.includes('code_required'));
  assert.ok(alarm.includes('arm_away'));
  assert.ok(capabilitiesFor(st('sensor.power_consumption')).includes('power'));
});

test('bilinmeyen / eksik durumlar güvenli ele alınır', () => {
  assert.deepEqual(capabilitiesFor(null), []);
  assert.deepEqual(capabilitiesFor({ entity_id: 'weird.thing', state: 'x', attributes: {} }), []);
  assert.equal(availabilityOf({ state: 'unavailable' }), 'offline');
  assert.equal(availabilityOf({ state: 'unknown' }), 'unknown');
  assert.equal(availabilityOf(null), 'missing');
  // light with no supported_color_modes => yalnızca aç/kapa
  assert.deepEqual(capabilitiesFor({ entity_id: 'light.x', state: 'on', attributes: {} }), ['on_off']);
});

test('hassas cihazlar işaretlenir', () => {
  const st = (id) => fx.states.find((s) => s.entity_id === id);
  assert.equal(isSensitive(st('lock.front_door')), true);
  assert.equal(isSensitive(st('alarm_control_panel.security')), true);
  assert.equal(isSensitive(st('cover.garage_door')), true);
  assert.equal(isSensitive(st('cover.kitchen_window')), false);
  assert.equal(isSensitive(st('light.bed_light')), false);
});

test('iot_class -> bağlantı türü', () => {
  assert.equal(connectivityFor('shelly', 'local_push'), Connectivity.LOCAL);
  assert.equal(connectivityFor('x', 'cloud_polling'), Connectivity.CLOUD);
  assert.equal(connectivityFor('tuya', 'cloud_push'), Connectivity.CLOUD);
  assert.equal(connectivityFor('sonoff', 'local_push'), Connectivity.HYBRID);
  assert.equal(connectivityFor('x', undefined), Connectivity.UNVERIFIED);
});

test('durum değişikliği uygulanır ve çevrim dışı sayılır', () => {
  const home = buildHome(structuredClone(fx));
  const before = summarize(home);
  const st = fx.states.find((s) => s.entity_id === 'switch.ac');
  applyStateChange(home, { ...st, state: 'unavailable' });
  const after = summarize(home);
  assert.equal(after.offline, before.offline + 1);
  assert.equal(home.entities.get('switch.ac').availability, 'offline');
});

test('gizli ve devre dışı varlıklar modele girmez', () => {
  const data = structuredClone(fx);
  const reg = data.entities.find((e) => e.entity_id === 'switch.ac');
  reg.hidden_by = 'user';
  const home = buildHome(data);
  assert.equal(home.entities.has('switch.ac'), false);
});

test('özet: aktif cihazlar ve açık alarmlar', () => {
  const data = structuredClone(fx);
  data.states.find((s) => s.entity_id === 'alarm_control_panel.security').state = 'triggered';
  const s = summarize(buildHome(data));
  assert.ok(s.active > 0);
  assert.equal(s.alarms.length, 1);
});

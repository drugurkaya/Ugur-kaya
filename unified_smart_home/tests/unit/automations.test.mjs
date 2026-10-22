import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoFixture } from './helpers.mjs';
import {
  toHaConfig,
  fromHaConfig,
  validateAutomation,
  isBlockedAction,
  dryRun,
  describeTrigger,
  describeAction,
  durationToHa,
  durationFromHa,
  slugify,
} from '../../app/js/core/automations.js';

const fx = loadDemoFixture();
const states = new Map(fx.states.map((s) => [s.entity_id, s]));
const getState = (id) => states.get(id) || null;

const evening = {
  id: 'ush_aksam',
  alias: 'Akşam aydınlatması',
  mode: 'single',
  triggers: [{ kind: 'time', at: '19:00' }],
  conditions: [],
  actions: [{ kind: 'service', entityId: 'light.ceiling_lights', service: 'turn_on', data: { brightness_pct: 80 } }],
};

test('A) Akşam aydınlatması HA yapılandırmasına çevrilir', () => {
  const cfg = toHaConfig(evening);
  assert.deepEqual(cfg.triggers, [{ trigger: 'time', at: '19:00:00' }]);
  assert.equal(cfg.actions[0].action, 'light.turn_on');
  assert.deepEqual(cfg.actions[0].target, { entity_id: 'light.ceiling_lights' });
  assert.equal(cfg.actions[0].data.brightness_pct, 80);
  assert.equal(cfg.mode, 'single');
  assert.equal(cfg.max_exceeded, 'silent', 'tekrar eden tetikleyiciler sessizce yok sayılmalı');
  assert.equal(cfg.variables.ush_revision, 1);
});

test('B) Hareket algılama: restart modu + bekle + kapat', () => {
  const b = {
    id: 'x',
    alias: 'Koridor hareket',
    mode: 'restart',
    triggers: [{ kind: 'state', entityId: 'binary_sensor.movement_backyard', to: 'on' }],
    conditions: [{ kind: 'sun', when: 'night' }],
    actions: [
      { kind: 'service', entityId: 'light.bed_light', service: 'turn_on' },
      { kind: 'wait_state', entityId: 'binary_sensor.movement_backyard', state: 'off', forSec: 120, timeoutSec: 1800 },
      { kind: 'service', entityId: 'light.bed_light', service: 'turn_off' },
    ],
  };
  assert.deepEqual(validateAutomation(b, getState), []);
  const cfg = toHaConfig(b);
  assert.equal(cfg.mode, 'restart');
  assert.deepEqual(cfg.conditions[0], { condition: 'sun', after: 'sunset', before: 'sunrise' });
  assert.deepEqual(cfg.actions[1].wait_for_trigger[0].for, { hours: 0, minutes: 2, seconds: 0 });
  // Geri okuma birebir modeli verir
  const back = fromHaConfig(cfg);
  assert.equal(back.editable, true);
  assert.deepEqual(back.model.actions, b.actions.map((a) => (a.kind === 'service' ? { ...a, data: {} } : { ...a, continueOnTimeout: true })));
});

test('gidiş-dönüş: toHaConfig -> fromHaConfig', () => {
  const b = {
    ...evening,
    triggers: [
      { kind: 'sun', event: 'sunset', offsetMin: -30 },
      { kind: 'numeric', entityId: 'sensor.outside_temperature', above: 28, below: null, forSec: 300 },
    ],
    conditions: [
      { kind: 'time', after: '18:00', before: '23:30', weekdays: ['mon', 'fri'] },
      { kind: 'state', entityId: 'switch.ac', state: 'off' },
    ],
  };
  const back = fromHaConfig(toHaConfig(b)).model;
  assert.deepEqual(back.triggers[0], { kind: 'sun', event: 'sunset', offsetMin: -30 });
  assert.equal(back.triggers[1].above, 28);
  assert.equal(back.triggers[1].forSec, 300);
  assert.deepEqual(back.conditions[0], { kind: 'time', after: '18:00', before: '23:30', weekdays: ['mon', 'fri'] });
  assert.equal(back.revision, 1);
});

test('oluşturucunun ifade edemediği yapı düzenlenemez işaretlenir (veri kaybı yok)', () => {
  const r = fromHaConfig({ id: 'y', alias: 'Gelişmiş', triggers: [{ trigger: 'template', value_template: '{{ true }}' }], actions: [{ action: 'light.turn_on', target: { entity_id: 'light.bed_light' } }] });
  assert.equal(r.editable, false);
});

test('doğrulama Türkçe hata mesajları üretir', () => {
  const errs = validateAutomation({ alias: '', triggers: [{ kind: 'time', at: '25:00' }], actions: [{ kind: 'service', entityId: 'light.yok', service: 'turn_on' }] }, getState);
  assert.ok(errs.some((e) => e.includes('adı boş')));
  assert.ok(errs.some((e) => e.includes('SS:DD')));
  assert.ok(errs.some((e) => e.includes('bulunamadı')));
});

test('GÜVENLİK: kilit açma, alarm devre dışı ve garaj açma otomasyonda engellenir', () => {
  assert.equal(isBlockedAction(getState('lock.front_door'), 'unlock'), true);
  assert.equal(isBlockedAction(getState('lock.front_door'), 'lock'), false);
  assert.equal(isBlockedAction(getState('alarm_control_panel.security'), 'alarm_disarm'), true);
  assert.equal(isBlockedAction(getState('alarm_control_panel.security'), 'alarm_arm_away'), false);
  assert.equal(isBlockedAction(getState('cover.garage_door'), 'open_cover'), true);
  assert.equal(isBlockedAction(getState('cover.garage_door'), 'close_cover'), false);
  assert.equal(isBlockedAction(getState('cover.kitchen_window'), 'open_cover'), false);
  const errs = validateAutomation(
    { alias: 'Kötü', triggers: [{ kind: 'time', at: '03:00' }], actions: [{ kind: 'service', entityId: 'lock.front_door', service: 'unlock' }] },
    getState,
  );
  assert.ok(errs.some((e) => e.includes('güvenlik')));
});

test('test modu: koşullar gerçek durumlara göre değerlendirilir, komut gönderilmez', () => {
  const b = {
    alias: 't',
    triggers: [{ kind: 'time', at: '19:00' }],
    conditions: [
      { kind: 'state', entityId: 'switch.ac', state: 'on' },
      { kind: 'time', after: '18:00', before: '23:00' },
    ],
    actions: [{ kind: 'service', entityId: 'switch.decorative_lights', service: 'turn_on' }],
  };
  const r = dryRun(b, getState, { now: new Date(2026, 9, 21, 20, 0) });
  assert.equal(r.conditions[0].result, false, 'switch.ac kapalı');
  assert.equal(r.conditions[1].result, true);
  assert.equal(r.wouldRun, false);
  assert.match(r.actions[0].warning, /doğrulanamaz/, 'assumed_state uyarısı');
});

test('gece yarısını aşan saat aralığı', () => {
  const b = { alias: 't', triggers: [], conditions: [{ kind: 'time', after: '22:00', before: '06:00' }], actions: [] };
  assert.equal(dryRun(b, getState, { now: new Date(2026, 0, 1, 23, 0) }).conditions[0].result, true);
  assert.equal(dryRun(b, getState, { now: new Date(2026, 0, 1, 12, 0) }).conditions[0].result, false);
});

test('Türkçe açıklamalar', () => {
  assert.equal(describeTrigger({ kind: 'time', at: '19:00' }, getState), 'Saat 19:00 olduğunda');
  assert.equal(describeTrigger({ kind: 'sun', event: 'sunset', offsetMin: -15 }, getState), 'Gün batımından 15 dakika önce');
  assert.equal(describeAction({ kind: 'service', entityId: 'light.bed_light', service: 'turn_on', data: { brightness_pct: 20 } }, getState), 'Bed Light: aç (%20 parlaklık)');
});

test('süre dönüşümleri ve slug', () => {
  assert.deepEqual(durationToHa(3725), { hours: 1, minutes: 2, seconds: 5 });
  assert.equal(durationFromHa('01:02:05'), 3725);
  assert.equal(durationFromHa({ minutes: 2 }), 120);
  assert.equal(slugify('Akşam Işıkları Çalışsın'), 'aksam_isiklari_calissin');
});

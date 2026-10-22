import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandRunner, CommandPhase, expectationFor } from '../../app/js/core/commands.js';
import { AppError, ErrorCode } from '../../app/js/core/errors.js';
import { FakeTimers, flush } from './helpers.mjs';

function setup(initial, { serviceImpl } = {}) {
  const states = new Map(initial.map((s) => [s.entity_id, s]));
  const listeners = new Set();
  const timers = new FakeTimers();
  const calls = [];
  const push = (st) => {
    states.set(st.entity_id, st);
    for (const fn of listeners) fn(st);
  };
  const runner = new CommandRunner({
    callService: (d, s, data, target) => {
      calls.push({ d, s, data, target });
      return serviceImpl ? serviceImpl({ d, s, data, target, push }) : Promise.resolve();
    },
    getState: (id) => states.get(id) || null,
    onStateChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    timers,
  });
  return { runner, timers, calls, push, listeners };
}

const light = (state, attrs = {}) => ({ entity_id: 'light.salon', state, attributes: { supported_color_modes: ['brightness'], ...attrs } });

test('komut kabul edilir ve durum gelince DOĞRULANDI olur', async () => {
  const { runner, push, listeners } = setup([light('off')]);
  const phases = [];
  const p = runner.run({ entityId: 'light.salon', service: 'turn_on' }, (u) => phases.push(u.phase));
  await flush();
  assert.deepEqual(phases, ['sending', 'accepted']);
  push(light('on'));
  const r = await p;
  assert.equal(r.phase, CommandPhase.CONFIRMED);
  assert.equal(listeners.size, 0, 'dinleyici temizlenmeli');
});

test('durum gelmezse zaman aşımında DOĞRULANAMADI (unconfirmed) olur, başarılı sayılmaz', async () => {
  const { runner, timers } = setup([light('off')]);
  const p = runner.run({ entityId: 'light.salon', service: 'turn_on' });
  await flush();
  await timers.advance(8001);
  const r = await p;
  assert.equal(r.phase, CommandPhase.UNCONFIRMED);
});

test('durum güncellemesi servis yanıtından önce gelirse de doğrulanır', async () => {
  const { runner } = setup([light('off')], {
    serviceImpl: ({ push }) => {
      push(light('on'));
      return Promise.resolve();
    },
  });
  const r = await runner.run({ entityId: 'light.salon', service: 'turn_on' });
  assert.equal(r.phase, CommandPhase.CONFIRMED);
});

test('HA hatası BAŞARISIZ olarak raporlanır', async () => {
  const { runner } = setup([light('off')], {
    serviceImpl: () => Promise.reject(new AppError(ErrorCode.SERVICE_FAILED, { details: 'boom' })),
  });
  const r = await runner.run({ entityId: 'light.salon', service: 'turn_on' });
  assert.equal(r.phase, CommandPhase.FAILED);
  assert.equal(r.error.code, ErrorCode.SERVICE_FAILED);
});

test('çevrim dışı cihaza komut gönderilmez', async () => {
  const { runner, calls } = setup([light('unavailable')]);
  const r = await runner.run({ entityId: 'light.salon', service: 'turn_on' });
  assert.equal(r.phase, CommandPhase.FAILED);
  assert.equal(r.error.code, ErrorCode.DEVICE_UNAVAILABLE);
  assert.equal(calls.length, 0);
});

test('assumed_state cihazlarda sonuç DOĞRULANAMAZ olarak belirtilir', async () => {
  const { runner } = setup([{ entity_id: 'switch.role', state: 'off', attributes: { assumed_state: true } }]);
  const r = await runner.run({ entityId: 'switch.role', service: 'turn_on' });
  assert.equal(r.phase, CommandPhase.UNVERIFIABLE);
});

test('panjur: ara durum IN_PROGRESS, sonra CONFIRMED', async () => {
  const cover = (state, pos) => ({ entity_id: 'cover.p', state, attributes: { current_position: pos } });
  const { runner, push } = setup([cover('closed', 0)]);
  const phases = [];
  const p = runner.run({ entityId: 'cover.p', service: 'open_cover' }, (u) => phases.push(u.phase));
  await flush();
  push(cover('opening', 40));
  push(cover('open', 100));
  const r = await p;
  assert.equal(r.phase, CommandPhase.CONFIRMED);
  assert.ok(phases.includes('in_progress'));
});

test('komut sonrası cihaz çevrim dışı olursa BAŞARISIZ', async () => {
  const { runner, push } = setup([light('off')]);
  const p = runner.run({ entityId: 'light.salon', service: 'turn_on' });
  await flush();
  push(light('unavailable'));
  const r = await p;
  assert.equal(r.phase, CommandPhase.FAILED);
});

test('parlaklık beklentisi toleranslı karşılaştırılır', () => {
  const check = expectationFor('light', 'turn_on', { brightness_pct: 50 }, light('off'));
  assert.equal(check(light('on', { brightness: 128 })), 'match');
  assert.equal(check(light('on', { brightness: 30 })), 'progress');
  assert.equal(check(light('off')), 'no');
});

test('toggle mevcut duruma göre beklenti üretir; bilinmeyen servis doğrulanamaz', () => {
  assert.equal(expectationFor('switch', 'toggle', {}, { state: 'on' })({ state: 'off', attributes: {} }), 'match');
  assert.equal(expectationFor('scene', 'turn_on', {}, null), null);
});

test('kilit ve alarm beklentileri', () => {
  const lock = expectationFor('lock', 'lock', {});
  assert.equal(lock({ state: 'locking', attributes: {} }), 'progress');
  assert.equal(lock({ state: 'locked', attributes: {} }), 'match');
  const alarm = expectationFor('alarm_control_panel', 'alarm_arm_away', {});
  assert.equal(alarm({ state: 'arming', attributes: {} }), 'progress');
  assert.equal(alarm({ state: 'armed_away', attributes: {} }), 'match');
});

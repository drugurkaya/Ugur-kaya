import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario, scenarioToScript, scriptToScenario, validateScenario, summarizeRun } from '../../app/js/core/scenarios.js';
import { FakeTimers, flush } from './helpers.mjs';

function env(initial) {
  const states = new Map(initial.map((s) => [s.entity_id, s]));
  const listeners = new Set();
  const timers = new FakeTimers();
  const push = (st) => {
    states.set(st.entity_id, st);
    for (const fn of [...listeners]) fn(st);
  };
  return {
    states,
    push,
    timers,
    deps: {
      getState: (id) => states.get(id) || null,
      onStateChange: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      timers,
    },
  };
}

const sw = (id, state, attrs = {}) => ({ entity_id: id, state, attributes: { friendly_name: id, ...attrs } });

test('kısmi başarısızlık cihaz bazında raporlanır (başarısız olan başarılı gösterilmez)', async () => {
  const e = env([sw('light.salon', 'on'), sw('light.mutfak', 'on'), sw('switch.bahce', 'on')]);
  const scenario = {
    name: 'Tüm ışıkları kapat',
    steps: [
      { entityId: 'light.salon', service: 'turn_off' },
      { entityId: 'light.mutfak', service: 'turn_off' },
      { entityId: 'switch.bahce', service: 'turn_off' },
    ],
  };
  e.deps.callService = async () => {
    e.push(sw('light.salon', 'off'));
    e.push(sw('light.mutfak', 'off'));
    // bahçe rölesi yanıt vermiyor: durum değişmiyor
  };
  const p = runScenario('script.tum_isiklar', scenario, e.deps, { timeoutMs: 5000 });
  await flush();
  await e.timers.advance(5001);
  const res = await p;
  assert.deepEqual(
    res.map((r) => [r.entityId, r.phase]),
    [
      ['light.salon', 'confirmed'],
      ['light.mutfak', 'confirmed'],
      ['switch.bahce', 'unconfirmed'],
    ],
  );
  assert.equal(res[2].reason, 'Yanıt alınamadı');
  const s = summarizeRun(res);
  assert.equal(s.ok, 2);
  assert.equal(s.failed, 1);
  assert.equal(s.allOk, false);
});

test('çevrim dışı cihaz baştan başarısız işaretlenir', async () => {
  const e = env([sw('light.salon', 'unavailable'), sw('light.mutfak', 'off')]);
  e.deps.callService = async () => e.push(sw('light.mutfak', 'on'));
  const res = await runScenario('script.x', { steps: [{ entityId: 'light.salon', service: 'turn_on' }, { entityId: 'light.mutfak', service: 'turn_on' }] }, e.deps);
  assert.equal(res[0].phase, 'failed');
  assert.match(res[0].reason, /çevrim dışı/);
  assert.equal(res[1].phase, 'confirmed');
});

test('script çağrısı hata verirse tüm adımlar başarısız', async () => {
  const e = env([sw('light.salon', 'off')]);
  e.deps.callService = async () => {
    throw new Error('boom');
  };
  const res = await runScenario('script.x', { steps: [{ entityId: 'light.salon', service: 'turn_on' }] }, e.deps);
  assert.equal(res[0].phase, 'failed');
});

test('senaryo script yapılandırması: tek çalışma modu ve hata toleransı', () => {
  const cfg = scenarioToScript({ name: 'Gece modu', steps: [{ entityId: 'light.salon', service: 'turn_on', data: { brightness_pct: 10 } }] });
  assert.equal(cfg.mode, 'single');
  assert.equal(cfg.sequence[0].continue_on_error, true);
  assert.equal(cfg.sequence[0].data.brightness_pct, 10);
  const back = scriptToScenario('gece_modu', cfg);
  assert.equal(back.editable, true);
  assert.equal(back.model.steps[0].service, 'turn_on');
});

test('senaryoda kilit açma engellenir', () => {
  const states = new Map([['lock.kapi', sw('lock.kapi', 'locked')]]);
  const errs = validateScenario({ name: 'x', steps: [{ entityId: 'lock.kapi', service: 'unlock' }] }, (id) => states.get(id));
  assert.ok(errs.some((e) => e.includes('güvenlik')));
});

// GERÇEK bir Home Assistant çekirdeğine karşı entegrasyon testleri.
// Cihazlar HA'nın "demo" entegrasyonundandır: SİMÜLASYONDUR, gerçek donanım testi DEĞİLDİR.
//
// Çalıştırma: scripts/run_tests.sh (HA'yı geçici dizinde başlatır, onboarding yapar, testleri koşar)
// veya elle: USH_HA_CREDENTIALS=<config>/.ush-test-credentials.json node --test tests/integration/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HaAuthApi, loginWithPassword, Session } from '../../app/js/core/auth.js';
import { HaSocket, SocketStatus } from '../../app/js/core/ha-socket.js';
import { HomeStore } from '../../app/js/core/store.js';
import { CommandPhase } from '../../app/js/core/commands.js';
import { toHaConfig, fromHaConfig, newId } from '../../app/js/core/automations.js';
import { scenarioToScript, runScenario, summarizeRun } from '../../app/js/core/scenarios.js';
import { ErrorCode, redact } from '../../app/js/core/errors.js';
import { energySensors } from '../../app/js/core/energy.js';
import { buildHealthReport } from '../../app/js/core/health.js';

const credPath = process.env.USH_HA_CREDENTIALS;
const skip = !credPath && 'USH_HA_CREDENTIALS tanımlı değil (çalışan test HA örneği yok)';
const cred = credPath ? JSON.parse(readFileSync(credPath, 'utf8')) : {};
const memVault = { canPersist: false, save: async () => {}, load: async () => null, clear: async () => {} };

async function connect({ username = cred.username, password = cred.password } = {}) {
  const api = new HaAuthApi({ baseUrl: cred.base, clientId: cred.client_id });
  const tokens = await loginWithPassword(api, username, password, async () => null);
  const session = new Session({ api, vault: memVault });
  await session.start(tokens, { remember: false });
  const socket = new HaSocket({
    url: cred.base.replace(/^http/, 'ws') + '/api/websocket',
    getAccessToken: () => session.getAccessToken(),
    refreshAccessToken: () => session.refresh(),
  });
  await socket.connect();
  const store = new HomeStore({ socket, getAccessToken: () => session.getAccessToken(), baseUrl: cred.base });
  await store.load();
  return { api, session, socket, store, tokens };
}

let ctx;
test.before(async () => {
  if (!skip) ctx = await connect();
});
test.after(() => {
  if (ctx) {
    ctx.store.dispose();
    ctx.socket.close();
  }
});

test('HA bağlantısı, kimlik doğrulama ve WebSocket', { skip }, async () => {
  assert.equal(ctx.socket.status, SocketStatus.CONNECTED);
  assert.match(ctx.socket.haVersion, /^\d{4}\.\d+/);
  assert.equal(ctx.store.user.is_admin, true);
});

test('cihaz listesi gerçek HA kayıtlarından oluşur', { skip }, async () => {
  const { home } = ctx.store;
  assert.ok(home.entities.size > 20);
  const bed = home.entities.get('light.bed_light');
  assert.ok(bed, 'demo ışığı bulunmalı');
  assert.equal(bed.simulated, true);
  assert.ok(home.devices.get(bed.deviceId), 'cihaz kaydı');
  assert.ok(home.integrations.some((i) => i.domain === 'demo' && i.state === 'loaded'));
});

test('komut gönderme ve GERÇEK durum güncellemesiyle doğrulama (simüle ışık)', { skip }, async () => {
  const id = 'light.bed_light';
  const before = ctx.store.getState(id).state;
  const target = before === 'on' ? 'turn_off' : 'turn_on';
  const r1 = await ctx.store.commands.run({ entityId: id, service: target });
  assert.equal(r1.phase, CommandPhase.CONFIRMED, JSON.stringify(r1));
  assert.equal(ctx.store.getState(id).state, target === 'turn_on' ? 'on' : 'off');
  const r2 = await ctx.store.commands.run({ entityId: id, service: target === 'turn_on' ? 'turn_off' : 'turn_on' });
  assert.equal(r2.phase, CommandPhase.CONFIRMED);
  assert.equal(ctx.store.getState(id).state, before);
});

test('parlaklık komutu doğrulanır', { skip }, async () => {
  const r = await ctx.store.commands.run({ entityId: 'light.ceiling_lights', service: 'turn_on', data: { brightness_pct: 40 } });
  assert.equal(r.phase, CommandPhase.CONFIRMED);
  const b = ctx.store.getState('light.ceiling_lights').attributes.brightness;
  assert.ok(Math.abs((b / 255) * 100 - 40) <= 2);
});

test('assumed_state cihaz "doğrulanamaz" olarak raporlanır', { skip }, async () => {
  const r = await ctx.store.commands.run({ entityId: 'switch.decorative_lights', service: 'toggle' });
  assert.equal(r.phase, CommandPhase.UNVERIFIABLE);
  await ctx.store.commands.run({ entityId: 'switch.decorative_lights', service: 'toggle' });
});

test('kilit (hassas cihaz) kilitlenir ve doğrulanır', { skip }, async () => {
  const r = await ctx.store.commands.run({ entityId: 'lock.kitchen_door', service: 'lock' });
  assert.ok([CommandPhase.CONFIRMED].includes(r.phase), JSON.stringify(r));
  await ctx.store.commands.run({ entityId: 'lock.kitchen_door', service: 'unlock' });
});

test('geçersiz komut HA hatası olarak raporlanır (başarılı gösterilmez)', { skip }, async () => {
  const r = await ctx.store.commands.run({ entityId: 'light.bed_light', service: 'turn_on', data: { brightness_pct: 500 } });
  assert.equal(r.phase, CommandPhase.FAILED);
  assert.ok(r.error);
});

test('otomasyon oluşturma, geri okuma, test etme, iz kaydı ve silme', { skip }, async () => {
  const id = newId('ush_test');
  const builder = {
    id,
    alias: `Test otomasyonu ${id}`,
    mode: 'single',
    triggers: [{ kind: 'state', entityId: 'switch.ac', to: 'on' }],
    conditions: [],
    actions: [{ kind: 'service', entityId: 'light.kitchen_lights', service: 'turn_off' }],
  };
  await ctx.store.saveAutomationConfig(id, toHaConfig(builder));
  const entityId = await ctx.store.waitForAutomationEntity(id);
  assert.ok(entityId, 'otomasyon varlığı oluşmalı');
  const cfg = await ctx.store.getAutomationConfig(id);
  const back = fromHaConfig(cfg);
  assert.equal(back.editable, true);
  assert.equal(back.model.actions[0].entityId, 'light.kitchen_lights');

  // Pasif kaydet + elle tetikle
  await ctx.store.setAutomationEnabled(entityId, false);
  await ctx.store.commands.run({ entityId: 'light.kitchen_lights', service: 'turn_on' });
  await ctx.store.setAutomationEnabled(entityId, true);
  await ctx.store.triggerAutomation(entityId, { skipCondition: true });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(ctx.store.getState('light.kitchen_lights').state, 'off', 'otomasyon gerçekten çalışmalı');

  // Gerçek tetikleyici ile
  await ctx.store.commands.run({ entityId: 'light.kitchen_lights', service: 'turn_on' });
  await ctx.store.commands.run({ entityId: 'switch.ac', service: 'turn_off' });
  await ctx.store.commands.run({ entityId: 'switch.ac', service: 'turn_on' });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(ctx.store.getState('light.kitchen_lights').state, 'off');

  const traces = await ctx.store.traces('automation', id);
  assert.ok(traces.length >= 2, 'çalışma geçmişi (trace) okunabilmeli');
  await ctx.store.deleteAutomation(id);
  await ctx.store.commands.run({ entityId: 'switch.ac', service: 'turn_off' });
});

test('hatalı otomasyon yapılandırması reddedilir', { skip }, async () => {
  await assert.rejects(
    ctx.store.saveAutomationConfig('ush_bad', { alias: 'x', triggers: [{ trigger: 'nonsense' }], actions: [] }),
    (e) => e.code === ErrorCode.INVALID_INPUT,
  );
});

test('senaryo: script olarak kaydedilir, çalıştırılır ve cihaz bazında doğrulanır', { skip }, async () => {
  const sid = `ush_test_${Date.now()}`;
  const scenario = {
    name: 'Test senaryosu',
    steps: [
      { entityId: 'light.bed_light', service: 'turn_on' },
      { entityId: 'light.office_rgbw_lights', service: 'turn_off' },
      { entityId: 'switch.decorative_lights', service: 'turn_on' },
    ],
  };
  await ctx.store.saveScriptConfig(sid, scenarioToScript(scenario));
  for (let i = 0; i < 40 && !ctx.store.getState(`script.${sid}`); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(ctx.store.getState(`script.${sid}`));
  const res = await runScenario(`script.${sid}`, scenario, {
    callService: (d, s, data, target, opts) => ctx.socket.callService(d, s, data, target, opts),
    getState: (id) => ctx.store.getState(id),
    onStateChange: (fn) => ctx.store.onStateChange(fn),
  });
  assert.deepEqual(
    res.map((r) => r.phase),
    [CommandPhase.CONFIRMED, CommandPhase.CONFIRMED, CommandPhase.UNVERIFIABLE],
  );
  assert.equal(summarizeRun(res).failed, 0);
  await ctx.store.deleteScript(sid);
});

test('alan (oda) oluşturma, cihaz atama ve silme', { skip }, async () => {
  const area = await ctx.store.createArea(`Test Odası ${Date.now()}`);
  const bed = ctx.store.home.entities.get('light.bed_light');
  const prev = ctx.store.home.devices.get(bed.deviceId).areaId;
  await ctx.store.updateDevice(bed.deviceId, { areaId: area.area_id });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(ctx.store.home.entities.get('light.bed_light').areaId, area.area_id, 'kayıt değişikliği modele yansımalı');
  await ctx.store.updateDevice(bed.deviceId, { areaId: prev });
  await ctx.store.deleteArea(area.area_id);
});

test('ilişkili otomasyonlar (search/related) okunabilir', { skip }, async () => {
  const r = await ctx.store.related('entity', 'sensor.ush_cevrim_disi_varliklar');
  assert.ok(r.automation && r.automation.length >= 1, 'paket otomasyonu bu sensörü kullanır');
});

test('enerji istatistikleri okunabilir', { skip }, async () => {
  const ids = energySensors(ctx.store.home).map((e) => e.id);
  assert.ok(ids.length);
  const stats = await ctx.store.statistics(ids, new Date(Date.now() - 86400000), null, 'hour');
  assert.equal(typeof stats, 'object');
});

test('sistem sağlığı raporu gerçek verilerle oluşur', { skip }, async () => {
  const backup = await ctx.store.backupInfo();
  const failed = await ctx.store.failedAutomationRuns();
  const r = buildHealthReport({ home: ctx.store.home, socket: ctx.socket, backup, failedAutomations: failed, browserOnline: true });
  assert.equal(r.items.find((i) => i.key === 'hub').level, 'ok');
  assert.ok(r.integrations.find((i) => i.domain === 'demo'));
});

test('cihaz ekleme: yapılandırma akışı başlatılıp iptal edilebilir (config flow API)', { skip }, async () => {
  const flow = await ctx.store.startFlow('sun').catch((e) => e);
  // sun tek örneklidir; zaten kuruluysa "abort/single_instance_allowed" döner — her iki yanıt da API'nin çalıştığını gösterir
  assert.ok(flow.type === 'abort' || flow.type === 'form' || flow.type === 'create_entry', JSON.stringify(flow));
  if (flow.type === 'form') await ctx.store.abortFlow(flow.flow_id);
  const progress = await ctx.store.discoveredFlows();
  assert.ok(Array.isArray(progress));
});

// ----------------- Güvenlik testleri -----------------

test('GÜVENLİK: geçersiz token ile WebSocket reddedilir', { skip }, async () => {
  const s = new HaSocket({ url: cred.base.replace(/^http/, 'ws') + '/api/websocket', getAccessToken: async () => 'invalid.token.value' });
  await assert.rejects(s.connect(), (e) => e.code === ErrorCode.AUTH_INVALID);
  assert.equal(s.status, SocketStatus.AUTH_FAILED);
});

test('GÜVENLİK: token olmadan REST API 401 döner', { skip }, async () => {
  const res = await fetch(`${cred.base}/api/states`);
  assert.equal(res.status, 401);
  const res2 = await fetch(`${cred.base}/api/config/automation/config/x`, { method: 'POST', body: '{}', headers: { Authorization: 'Bearer nope' } });
  assert.equal(res2.status, 401);
});

test('GÜVENLİK: yanlış parola reddedilir', { skip }, async () => {
  const api = new HaAuthApi({ baseUrl: cred.base, clientId: cred.client_id });
  await assert.rejects(loginWithPassword(api, cred.username, 'yanlis-parola', async () => null), (e) => e.code === ErrorCode.AUTH_INVALID);
});

test('GÜVENLİK: iptal edilen (çıkış yapılmış) oturumun token\'ı yenilenemez', { skip }, async () => {
  const other = await connect();
  const rt = other.session.tokens.refreshToken;
  other.store.dispose();
  other.socket.close();
  await other.session.logout();
  await assert.rejects(other.api.refresh(rt), (e) => e.code === ErrorCode.AUTH_EXPIRED);
});

test('GÜVENLİK: süresi dolmuş erişim token\'ı ile istek yenilemeyle tamamlanır', { skip }, async () => {
  const c = await connect();
  try {
    let refreshes = 0;
    const orig = c.api.refresh.bind(c.api);
    c.api.refresh = (rt) => (refreshes++, orig(rt));
    c.session.tokens.expiresAt = Date.now() - 1000; // süresi dolmuş say
    const st = await c.store.rest('GET', '/api/config');
    assert.ok(st.version);
    assert.equal(refreshes, 1, 'istekten önce erişim token\'ı yenilenmeli');
    assert.ok(c.session.tokens.expiresAt > Date.now());
  } finally {
    c.store.dispose();
    c.socket.close();
    await c.session.logout();
  }
});

test('GÜVENLİK: yönetici olmayan kullanıcı otomasyon yazamaz ve kullanıcı oluşturamaz', { skip }, async () => {
  const uname = `kullanici${Date.now()}`;
  const pw = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const user = await ctx.socket.sendMessage({ type: 'config/auth/create', name: 'Aile Üyesi', group_ids: ['system-users'], local_only: false });
  await ctx.socket.sendMessage({ type: 'config/auth_provider/homeassistant/create', user_id: user.user.id, username: uname, password: pw });
  try {
    const c = await connect({ username: uname, password: pw });
    assert.equal(c.store.isAdmin, false);
    await assert.rejects(c.store.saveAutomationConfig('ush_x', { alias: 'x', triggers: [], actions: [] }), (e) => e.code === ErrorCode.AUTH_INVALID || e.code === ErrorCode.FORBIDDEN);
    await assert.rejects(c.socket.sendMessage({ type: 'config/auth/create', name: 'kötü', group_ids: ['system-admin'] }), (e) => e.code === ErrorCode.FORBIDDEN);
    // Normal kullanıcı cihaz kontrol edebilir (HA'nın yetki modeli)
    const r = await c.store.commands.run({ entityId: 'light.bed_light', service: 'toggle' });
    assert.equal(r.phase, CommandPhase.CONFIRMED);
    await c.store.commands.run({ entityId: 'light.bed_light', service: 'toggle' });
    c.store.dispose();
    c.socket.close();
    await c.session.logout();
  } finally {
    await ctx.socket.sendMessage({ type: 'config/auth/delete', user_id: user.user.id });
  }
});

test('GÜVENLİK: hata ayrıntılarında token sızmaz', { skip }, async () => {
  const token = ctx.session.tokens.accessToken;
  const res = await fetch(`${cred.base}/api/config/automation/config/x`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: 'not json' });
  const text = await res.text();
  const msg = redact(`Authorization: Bearer ${token} ${text}`);
  assert.ok(!msg.includes(token));
});

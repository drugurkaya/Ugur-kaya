import test from 'node:test';
import assert from 'node:assert/strict';
import { HaSocket, SocketStatus } from '../../app/js/core/ha-socket.js';
import { ErrorCode } from '../../app/js/core/errors.js';
import { makeFakeWsServer, FakeTimers, flush } from './helpers.mjs';

function make(server, { token = 'good', refresh, timers = new FakeTimers() } = {}) {
  const sock = new HaSocket({
    url: 'ws://ha/api/websocket',
    getAccessToken: async () => token,
    refreshAccessToken: refresh,
    WebSocketImpl: server.WebSocket,
    timers,
    random: () => 0.5,
  });
  return { sock, timers };
}

test('kimlik doğrulama ve istek/yanıt', async () => {
  const server = makeFakeWsServer({ handlers: { get_states: () => [{ entity_id: 'light.a', state: 'on' }] } });
  const { sock } = make(server);
  await sock.connect();
  assert.equal(sock.status, SocketStatus.CONNECTED);
  assert.equal(sock.haVersion, '2026.2.3');
  const states = await sock.sendMessage({ type: 'get_states' });
  assert.equal(states[0].entity_id, 'light.a');
});

test('geçersiz token: yenileme denenir, başarılı olursa bağlanır', async () => {
  const server = makeFakeWsServer({ validTokens: ['fresh'] });
  let refreshed = 0;
  const { sock } = make(server, { token: 'expired', refresh: async () => (refreshed++, 'fresh') });
  await sock.connect();
  assert.equal(refreshed, 1);
  assert.equal(sock.status, SocketStatus.CONNECTED);
  assert.equal(server.connectCount, 2);
});

test('geçersiz token ve yenileme de geçersiz: AUTH_FAILED, yeniden bağlanma denenmez', async () => {
  const server = makeFakeWsServer({ validTokens: ['x'] });
  const { sock, timers } = make(server, { token: 'bad', refresh: async () => 'still-bad' });
  await assert.rejects(sock.connect(), (e) => e.code === ErrorCode.AUTH_INVALID);
  assert.equal(sock.status, SocketStatus.AUTH_FAILED);
  await timers.advance(120000);
  assert.equal(server.connectCount, 2, 'yetkisiz durumda sonsuz döngüye girmemeli');
});

test('HA hata yanıtı AppError olur ve hata sayacı artar', async () => {
  const server = makeFakeWsServer({ handlers: { call_service: () => ({ __error: { code: 'unauthorized', message: 'Unauthorized' } }) } });
  const { sock } = make(server);
  await sock.connect();
  await assert.rejects(sock.callService('lock', 'unlock', {}, { entity_id: 'lock.x' }), (e) => e.code === ErrorCode.FORBIDDEN);
  assert.equal(sock.stats.errors, 1);
});

test('zaman aşımı', async () => {
  const server = makeFakeWsServer({ handlers: { slow: () => undefined } });
  const { sock, timers } = make(server);
  await sock.connect();
  const p = assert.rejects(sock.sendMessage({ type: 'slow' }, { timeoutMs: 3000 }), (e) => e.code === ErrorCode.TIMEOUT);
  await timers.advance(3001);
  await p;
});

test('bağlantı koparsa bekleyen istekler reddedilir, komut yeniden GÖNDERİLMEZ, abonelikler yenilenir', async () => {
  const server = makeFakeWsServer({ handlers: { subscribe_events: () => null, call_service: () => undefined } });
  const { sock, timers } = make(server);
  await sock.connect();
  const events = [];
  await sock.subscribe({ type: 'subscribe_events', event_type: 'state_changed' }, (ev) => events.push(ev));
  const subId = server.received.find((m) => m.type === 'subscribe_events').id;
  server.last().pushEvent(subId, { n: 1 });
  await flush();
  assert.equal(events.length, 1);

  const pending = sock.callService('light', 'turn_on', {}, { entity_id: 'light.a' });
  server.last().drop();
  await assert.rejects(pending, (e) => e.code === ErrorCode.HUB_UNREACHABLE);
  assert.equal(sock.status, SocketStatus.RECONNECTING);

  await timers.advance(1000);
  await flush();
  assert.equal(sock.status, SocketStatus.CONNECTED);
  assert.equal(sock.stats.reconnects, 1);
  const callServiceCount = server.received.filter((m) => m.type === 'call_service').length;
  assert.equal(callServiceCount, 1, 'komut tekrar gönderilmemeli');
  const subs = server.received.filter((m) => m.type === 'subscribe_events');
  assert.equal(subs.length, 2, 'abonelik yeniden kurulmalı');
  server.last().pushEvent(subs[1].id, { n: 2 });
  await flush();
  assert.equal(events.length, 2);
});

test('bağlı değilken gönderim anlaşılır hata verir', async () => {
  const server = makeFakeWsServer();
  const { sock } = make(server);
  await assert.rejects(sock.sendMessage({ type: 'get_states' }), (e) => e.code === ErrorCode.HUB_UNREACHABLE);
});

test('kalp atışı yanıtsız kalırsa bağlantı yeniden kurulur', async () => {
  const server = makeFakeWsServer();
  const { sock, timers } = make(server);
  await sock.connect();
  server.autoRespond = false; // ping'e yanıt yok
  await timers.advance(30000 + 10001);
  assert.ok([SocketStatus.RECONNECTING, SocketStatus.CONNECTED].includes(sock.status));
  server.autoRespond = true;
  await timers.advance(2000);
  await flush();
  assert.equal(sock.status, SocketStatus.CONNECTED);
  assert.ok(server.connectCount >= 2);
});

test('kapatma sonrası yeniden bağlanmaz', async () => {
  const server = makeFakeWsServer();
  const { sock, timers } = make(server);
  await sock.connect();
  sock.close();
  await timers.advance(60000);
  assert.equal(sock.status, SocketStatus.CLOSED);
  assert.equal(server.connectCount, 1);
});

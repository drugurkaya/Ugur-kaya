// Birim testleri için sahte (fake) yardımcılar. Bunlar GERÇEK cihaz veya GERÇEK HA değildir.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadDemoFixture() {
  const p = fileURLToPath(new URL('../fixtures/ha-demo-2026.2.3.json', import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Elle ilerletilen zamanlayıcılar. */
export class FakeTimers {
  constructor() {
    this.now = 0;
    this.seq = 1;
    this.tasks = new Map();
    this.setTimeout = (fn, ms) => this._add(fn, ms, false);
    this.setInterval = (fn, ms) => this._add(fn, ms, true);
    this.clearTimeout = (id) => this.tasks.delete(id);
    this.clearInterval = (id) => this.tasks.delete(id);
  }
  _add(fn, ms, repeat) {
    const id = this.seq++;
    this.tasks.set(id, { fn, at: this.now + (ms || 0), ms: ms || 0, repeat });
    return id;
  }
  async advance(ms) {
    const target = this.now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of this.tasks) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      this.now = t.at;
      if (t.repeat) t.at += t.ms || 1;
      else this.tasks.delete(id);
      t.fn();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

export async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

/**
 * Home Assistant WebSocket protokolünü taklit eden sahte sunucu.
 * handlers: { [type]: (msg, server) => result | {error} }
 */
export function makeFakeWsServer({ validTokens = ['good'], handlers = {}, haVersion = '2026.2.3' } = {}) {
  const server = { sockets: [], received: [], validTokens, handlers, connectCount: 0, autoRespond: true };
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      server.sockets.push(this);
      server.connectCount++;
      this.authed = false;
      setImmediate(() => this._deliver({ type: 'auth_required', ha_version: haVersion }));
    }
    _deliver(msg) {
      if (this.closed || !this.onmessage) return;
      this.onmessage({ data: JSON.stringify(msg) });
    }
    send(raw) {
      if (this.closed) throw new Error('closed');
      const msg = JSON.parse(raw);
      server.received.push(msg);
      if (msg.type === 'auth') {
        if (server.validTokens.includes(msg.access_token)) {
          this.authed = true;
          setImmediate(() => this._deliver({ type: 'auth_ok', ha_version: haVersion }));
        } else {
          setImmediate(() => {
            this._deliver({ type: 'auth_invalid', message: 'Invalid access token or password' });
            this.close();
          });
        }
        return;
      }
      if (!server.autoRespond) return;
      if (msg.type === 'ping') {
        setImmediate(() => this._deliver({ id: msg.id, type: 'pong' }));
        return;
      }
      const h = server.handlers[msg.type];
      setImmediate(() => {
        if (!h) {
          this._deliver({ id: msg.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } });
          return;
        }
        const r = h(msg, server, this);
        if (r === undefined) return; // yanıt yok (zaman aşımı testi)
        if (r && r.__error) this._deliver({ id: msg.id, type: 'result', success: false, error: r.__error });
        else this._deliver({ id: msg.id, type: 'result', success: true, result: r });
      });
    }
    pushEvent(subId, event) {
      this._deliver({ id: subId, type: 'event', event });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      setImmediate(() => this.onclose && this.onclose({ code: 1000 }));
    }
    // sunucu tarafında bağlantı kopması
    drop() {
      this.closed = true;
      this.onclose && this.onclose({ code: 1006 });
    }
  }
  server.WebSocket = FakeWebSocket;
  server.last = () => server.sockets[server.sockets.length - 1];
  return server;
}

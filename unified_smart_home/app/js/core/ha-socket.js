// Home Assistant WebSocket API istemcisi.
// Belge: https://developers.home-assistant.io/docs/api/websocket
//
// Sorumluluklar: kimlik doğrulama el sıkışması, id tabanlı istek/yanıt eşleme, zaman aşımı,
// abonelikler, kalp atışı (ping) ve kopma sonrası üstel bekleme ile yeniden bağlanma.
// Bekleyen komutlar kopmada YENİDEN GÖNDERİLMEZ: fiziksel bir cihaza giden komutun
// iki kez uygulanması (ör. "aç/kapa" geçişi) istenmeyen sonuç doğurabilir.

import { AppError, ErrorCode, fromHaError } from './errors.js';

export const SocketStatus = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  AUTH_FAILED: 'auth_failed',
  CLOSED: 'closed',
});

const DEFAULTS = {
  requestTimeoutMs: 10000,
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  connectTimeoutMs: 10000,
};

export class HaSocket {
  /**
   * @param {object} opts
   * @param {string} opts.url ws(s)://host/api/websocket
   * @param {() => Promise<string>} opts.getAccessToken geçerli erişim token'ını döndürür
   * @param {(force: boolean) => Promise<string>} [opts.refreshAccessToken] auth_invalid sonrası bir kez çağrılır
   * @param {typeof WebSocket} [opts.WebSocketImpl]
   * @param {object} [opts.timers] testler için {setTimeout, clearTimeout, setInterval, clearInterval}
   */
  constructor(opts) {
    this.url = opts.url;
    this.getAccessToken = opts.getAccessToken;
    this.refreshAccessToken = opts.refreshAccessToken || null;
    this.WS = opts.WebSocketImpl || globalThis.WebSocket;
    this.cfg = { ...DEFAULTS, ...(opts.config || {}) };
    this.t = opts.timers || globalThis;
    this.random = opts.random || Math.random;

    this.ws = null;
    this.status = SocketStatus.IDLE;
    this.haVersion = null;
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject, timer, type}
    this.subs = new Map(); // localKey -> {message, callback, remoteId}
    this.remoteToSub = new Map(); // remoteId -> localKey
    this.nextSubKey = 1;
    this.listeners = new Set();
    this.attempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    this.manualClose = false;
    this.stats = { errors: 0, reconnects: 0, lastMessageAt: null, lastConnectedAt: null, lastError: null };
  }

  onStatus(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _setStatus(status, error = null) {
    this.status = status;
    if (error) this.stats.lastError = error;
    for (const fn of this.listeners) {
      try {
        fn(status, error);
      } catch (e) {
        console.error('status listener', e);
      }
    }
  }

  /** İlk bağlantı. Kimlik doğrulama başarısız olursa AppError ile reddedilir. */
  connect() {
    this.manualClose = false;
    return this._open(false);
  }

  _open(isReconnect, forceRefresh = false) {
    this._setStatus(isReconnect ? SocketStatus.RECONNECTING : SocketStatus.CONNECTING);
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        this.t.clearTimeout(connectTimer);
        if (err) reject(err);
        else resolve();
      };
      let ws;
      try {
        ws = new this.WS(this.url);
      } catch (e) {
        done(new AppError(ErrorCode.HUB_UNREACHABLE, { cause: e }));
        this._scheduleReconnect();
        return;
      }
      this.ws = ws;
      const connectTimer = this.t.setTimeout(() => {
        if (ws.onclose) ws.onclose({ code: 4001 });
        try {
          ws.close();
        } catch {
          /* yok say */
        }
        done(new AppError(ErrorCode.TIMEOUT, { details: 'websocket connect timeout' }));
      }, this.cfg.connectTimeoutMs);

      const failAuth = (err) => {
        this.manualClose = true;
        this._setStatus(SocketStatus.AUTH_FAILED, err);
        this._detach(ws);
        if (this.ws === ws) this.ws = null;
        done(err);
      };

      ws.onmessage = async (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this.stats.lastMessageAt = Date.now();
        if (Array.isArray(msg)) {
          for (const m of msg) this._handleMessage(m);
          return;
        }
        if (msg.type === 'auth_required') {
          this.haVersion = msg.ha_version || null;
          try {
            const token =
              forceRefresh && this.refreshAccessToken ? await this.refreshAccessToken(true) : await this.getAccessToken();
            ws.send(JSON.stringify({ type: 'auth', access_token: token }));
          } catch (e) {
            failAuth(e instanceof AppError ? e : new AppError(ErrorCode.AUTH_INVALID, { cause: e }));
          }
        } else if (msg.type === 'auth_invalid') {
          if (!forceRefresh && this.refreshAccessToken) {
            // Erişim token'ının süresi dolmuş olabilir. HA bağlantıyı kapatır; token'ı yenileyip bir kez daha dene.
            this._detach(ws);
            if (this.ws === ws) this.ws = null;
            settled = true;
            this.t.clearTimeout(connectTimer);
            this._open(isReconnect, true).then(resolve, reject);
            return;
          }
          failAuth(new AppError(ErrorCode.AUTH_INVALID, { details: 'auth_invalid' }));
        } else if (msg.type === 'auth_ok') {
          this.haVersion = msg.ha_version || this.haVersion;
          this.attempt = 0;
          this.stats.lastConnectedAt = Date.now();
          if (isReconnect) this.stats.reconnects++;
          this._setStatus(SocketStatus.CONNECTED);
          this._startHeartbeat();
          this._resubscribeAll();
          done();
        } else {
          this._handleMessage(msg);
        }
      };
      ws.onerror = () => {
        /* ardından onclose gelir */
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        this._stopHeartbeat();
        this._rejectAllPending(new AppError(ErrorCode.HUB_UNREACHABLE, { details: 'connection_lost' }));
        for (const sub of this.subs.values()) sub.remoteId = null;
        this.remoteToSub.clear();
        done(new AppError(ErrorCode.HUB_UNREACHABLE, { details: 'socket closed' }));
        if (this.manualClose) return;
        this._scheduleReconnect();
      };
    });
  }

  _detach(ws) {
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* yok say */
    }
  }

  _scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) return;
    this._setStatus(SocketStatus.RECONNECTING);
    const exp = Math.min(this.cfg.backoffMaxMs, this.cfg.backoffBaseMs * 2 ** this.attempt);
    const delay = Math.round(exp / 2 + (this.random() * exp) / 2);
    this.attempt++;
    this.reconnectTimer = this.t.setTimeout(() => {
      this.reconnectTimer = null;
      this._open(true).catch(() => {
        /* onclose yeniden planlar */
      });
    }, delay);
  }

  /** Uygulama ön plana geldiğinde beklemeden yeniden bağlanmak için. */
  reconnectNow() {
    if (this.status === SocketStatus.CONNECTED || this.manualClose) return;
    if (this.reconnectTimer) {
      this.t.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
    this._open(true).catch(() => {});
  }

  close() {
    this.manualClose = true;
    if (this.reconnectTimer) this.t.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this._stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    this._rejectAllPending(new AppError(ErrorCode.HUB_UNREACHABLE, { details: 'closed by client' }));
    if (ws) this._detach(ws);
    this._setStatus(SocketStatus.CLOSED);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingTimer = this.t.setInterval(() => {
      if (this.status !== SocketStatus.CONNECTED) return;
      this.pongTimer = this.t.setTimeout(() => {
        // Yanıt yok: bağlantı ölü kabul edilir.
        const ws = this.ws;
        if (ws) {
          try {
            ws.close();
          } catch {
            /* yok say */
          }
          if (ws.onclose) ws.onclose({ code: 4000 });
        }
      }, this.cfg.pongTimeoutMs);
      this.sendMessage({ type: 'ping' }, { timeoutMs: this.cfg.pongTimeoutMs })
        .then(() => this.t.clearTimeout(this.pongTimer))
        .catch(() => {});
    }, this.cfg.pingIntervalMs);
  }

  _stopHeartbeat() {
    if (this.pingTimer) this.t.clearInterval(this.pingTimer);
    if (this.pongTimer) this.t.clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  _rejectAllPending(err) {
    for (const [id, p] of this.pending) {
      this.t.clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'result' || msg.type === 'pong') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      this.t.clearTimeout(p.timer);
      if (msg.type === 'pong' || msg.success) p.resolve(msg.result);
      else {
        this.stats.errors++;
        const err = fromHaError(msg.error, p.type);
        this.stats.lastError = err;
        p.reject(err);
      }
    } else if (msg.type === 'event') {
      const key = this.remoteToSub.get(msg.id);
      const sub = key && this.subs.get(key);
      if (sub) {
        try {
          sub.callback(msg.event);
        } catch (e) {
          console.error('subscription callback', e);
        }
      }
    }
  }

  /**
   * Bir komut gönderir ve sonucunu bekler.
   * @returns {Promise<any>}
   */
  sendMessage(message, { timeoutMs } = {}) {
    if (!this.ws || this.status !== SocketStatus.CONNECTED) {
      return Promise.reject(new AppError(ErrorCode.HUB_UNREACHABLE, { details: `not connected (${message.type})` }));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = this.t.setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        this.stats.errors++;
        const err = new AppError(ErrorCode.TIMEOUT, { details: `${message.type} timeout` });
        this.stats.lastError = err;
        reject(err);
      }, timeoutMs || this.cfg.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer, type: message.type });
      try {
        this.ws.send(JSON.stringify({ ...message, id }));
      } catch (e) {
        this.t.clearTimeout(timer);
        this.pending.delete(id);
        reject(new AppError(ErrorCode.HUB_UNREACHABLE, { cause: e }));
      }
    });
  }

  /**
   * Abonelik başlatır; yeniden bağlanmada otomatik yenilenir.
   * @returns {Promise<() => Promise<void>>} aboneliği iptal eden fonksiyon
   */
  async subscribe(message, callback) {
    const key = this.nextSubKey++;
    const sub = { message, callback, remoteId: null };
    this.subs.set(key, sub);
    try {
      await this._subscribeRemote(key, sub);
    } catch (e) {
      this.subs.delete(key);
      throw e;
    }
    return async () => {
      const s = this.subs.get(key);
      this.subs.delete(key);
      if (s && s.remoteId != null) {
        this.remoteToSub.delete(s.remoteId);
        if (this.status === SocketStatus.CONNECTED) {
          await this.sendMessage({ type: 'unsubscribe_events', subscription: s.remoteId }).catch(() => {});
        }
      }
    };
  }

  _subscribeRemote(key, sub) {
    const id = this.nextId; // sendMessage bu id'yi kullanacak
    this.remoteToSub.set(id, key);
    sub.remoteId = id;
    return this.sendMessage(sub.message).catch((e) => {
      this.remoteToSub.delete(id);
      sub.remoteId = null;
      throw e;
    });
  }

  _resubscribeAll() {
    for (const [key, sub] of this.subs) {
      this._subscribeRemote(key, sub).catch((e) => console.error('resubscribe failed', e.details || e));
    }
  }

  // ---- Sık kullanılan yardımcılar ----

  callService(domain, service, serviceData = {}, target = undefined, { returnResponse = false, timeoutMs } = {}) {
    const msg = { type: 'call_service', domain, service, service_data: serviceData };
    if (target) msg.target = target;
    if (returnResponse) msg.return_response = true;
    return this.sendMessage(msg, { timeoutMs });
  }
}

// Home Assistant kimlik doğrulaması (OAuth2 yetkilendirme kodu akışı, HA'nın login_flow API'si üzerinden).
// Belge: https://developers.home-assistant.io/docs/auth_api
//
// Güvenlik modeli (ayrıntı: SECURITY.md):
//  * Parola yalnızca HA'ya gönderilir; uygulama hiçbir yerde saklamaz.
//  * Erişim token'ı (30 dk) yalnızca bellekte tutulur.
//  * Yenileme (refresh) token'ı, "Bu cihazda oturumu açık tut" seçilirse, tarayıcıda DIŞA AKTARILAMAZ
//    (non-extractable) bir AES-GCM anahtarıyla şifrelenip IndexedDB'de saklanır. localStorage KULLANILMAZ.
//  * Güvenli bağlam (HTTPS) yoksa Web Crypto kullanılamaz; bu durumda token hiç kalıcı saklanmaz.
//  * Çıkışta yenileme token'ı HA tarafında iptal edilir (/auth/revoke).

import { AppError, ErrorCode, fromHttpStatus } from './errors.js';

const REFRESH_MARGIN_MS = 60000;

export class HaAuthApi {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl HA kök adresi (ör. https://ev.example.com)
   * @param {string} opts.clientId uygulamanın URL'si (HA istemci kimliği olarak URL bekler)
   * @param {typeof fetch} [opts.fetchImpl]
   */
  constructor({ baseUrl, clientId, fetchImpl }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientId = clientId;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
  }

  async _post(path, body, { form = false } = {}) {
    let res;
    try {
      res = await this.fetch(this.baseUrl + path, {
        method: 'POST',
        headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch (e) {
      throw new AppError(ErrorCode.HUB_UNREACHABLE, { cause: e });
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* düz metin */
    }
    if (!res.ok) {
      // Ham gövde ayrıntıya yalnızca temizlenerek girer (fromHttpStatus -> redact).
      const err = fromHttpStatus(res.status, json && json.error_description ? json.error_description : text);
      if (path === '/auth/token' && (res.status === 400 || res.status === 403)) {
        throw new AppError(ErrorCode.AUTH_EXPIRED, { details: err.details });
      }
      throw err;
    }
    return json;
  }

  /** Giriş akışını başlatır. Dönen adım: {type:'form', flow_id, step_id, data_schema, errors} */
  startLoginFlow() {
    return this._post('/auth/login_flow', {
      client_id: this.clientId,
      handler: ['homeassistant', null],
      redirect_uri: this.clientId,
    });
  }

  /** Akış adımına veri gönderir (kullanıcı adı/parola veya MFA kodu). */
  submitLoginStep(flowId, data) {
    return this._post(`/auth/login_flow/${encodeURIComponent(flowId)}`, { client_id: this.clientId, ...data });
  }

  async exchangeCode(code) {
    const t = await this._post('/auth/token', { grant_type: 'authorization_code', code, client_id: this.clientId }, { form: true });
    return normalizeTokens(t);
  }

  async refresh(refreshToken) {
    const t = await this._post(
      '/auth/token',
      { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.clientId },
      { form: true },
    );
    return normalizeTokens({ ...t, refresh_token: refreshToken });
  }

  async revoke(refreshToken) {
    try {
      await this._post('/auth/revoke', { token: refreshToken }, { form: true });
    } catch {
      // Çıkış her durumda yerelde tamamlanır; HA'ya ulaşılamıyorsa token sunucu tarafında
      // Ayarlar > Oturumlar ekranından veya HA profilinden iptal edilebilir.
    }
  }
}

function normalizeTokens(t) {
  if (!t || !t.access_token) throw new AppError(ErrorCode.AUTH_INVALID, { details: 'token response missing access_token' });
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || null,
    expiresAt: Date.now() + (Number(t.expires_in) || 1800) * 1000,
  };
}

/**
 * Login akışını kullanıcı arayüzünden bağımsız yürütür.
 * Adımlar: credentials -> (gerekirse) mfa -> done
 */
export async function loginWithPassword(api, username, password, askMfaCode) {
  let step = await api.startLoginFlow();
  step = await api.submitLoginStep(step.flow_id, { username, password });
  for (let guard = 0; guard < 4 && step.type === 'form'; guard++) {
    const errs = step.errors || {};
    if (step.step_id === 'init') {
      if (errs.base === 'invalid_auth') throw new AppError(ErrorCode.AUTH_INVALID, { message: 'Kullanıcı adı veya parola hatalı.' });
      throw new AppError(ErrorCode.AUTH_INVALID, { details: JSON.stringify(errs) });
    }
    if (step.step_id === 'select_mfa_module') {
      const fieldOptions = (step.data_schema || [])[0];
      const first = fieldOptions && fieldOptions.options ? Object.keys(fieldOptions.options)[0] || fieldOptions.options[0]?.[0] : null;
      step = await api.submitLoginStep(step.flow_id, { multi_factor_auth_module: first });
      continue;
    }
    if (step.step_id === 'mfa') {
      if (errs.base === 'invalid_code') {
        const code = await askMfaCode({ retry: true });
        if (!code) throw new AppError(ErrorCode.MFA_INVALID);
        step = await api.submitLoginStep(step.flow_id, { code });
        continue;
      }
      const code = await askMfaCode({ retry: false, placeholders: step.description_placeholders });
      if (!code) throw new AppError(ErrorCode.MFA_INVALID, { message: 'Doğrulama kodu girilmedi.' });
      step = await api.submitLoginStep(step.flow_id, { code });
      continue;
    }
    break;
  }
  if (step.type === 'abort') {
    if (step.reason === 'login_expired') throw new AppError(ErrorCode.AUTH_EXPIRED, { message: 'Giriş süresi doldu, yeniden deneyin.' });
    if (step.reason === 'too_many_retry') throw new AppError(ErrorCode.MFA_INVALID, { message: 'Çok fazla hatalı kod girildi. Yeniden giriş yapın.' });
    throw new AppError(ErrorCode.AUTH_INVALID, { details: `abort ${step.reason}` });
  }
  if (step.type !== 'create_entry' || !step.result) {
    throw new AppError(ErrorCode.AUTH_INVALID, { details: `unexpected login step ${step.type}/${step.step_id}` });
  }
  return api.exchangeCode(step.result);
}

// ---------------- Şifreli token kasası ----------------

const DB_NAME = 'ush-vault';
const STORE = 'kv';

function idb(indexedDBImpl) {
  return new Promise((resolve, reject) => {
    const req = indexedDBImpl.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbOp(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class TokenVault {
  constructor({ cryptoImpl, indexedDBImpl, isSecureContext } = {}) {
    this.crypto = cryptoImpl || globalThis.crypto;
    this.idb = indexedDBImpl || globalThis.indexedDB;
    this.secure = isSecureContext ?? globalThis.isSecureContext ?? false;
  }

  /** Kalıcı saklama mümkün mü? (HTTPS + Web Crypto + IndexedDB) */
  get canPersist() {
    return !!(this.secure && this.crypto && this.crypto.subtle && this.idb);
  }

  async _key(db) {
    let key = await idbOp(db, 'readonly', (s) => s.get('key'));
    if (!key) {
      key = await this.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await idbOp(db, 'readwrite', (s) => s.put(key, 'key'));
    }
    return key;
  }

  async save(baseUrl, refreshToken) {
    if (!this.canPersist) throw new AppError(ErrorCode.INSECURE_CONTEXT);
    const db = await idb(this.idb);
    try {
      const key = await this._key(db);
      const iv = this.crypto.getRandomValues(new Uint8Array(12));
      const plain = new TextEncoder().encode(JSON.stringify({ baseUrl, refreshToken }));
      const cipher = await this.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
      await idbOp(db, 'readwrite', (s) => s.put({ iv, cipher, savedAt: Date.now() }, 'session'));
    } finally {
      db.close();
    }
  }

  async load() {
    if (!this.canPersist) return null;
    const db = await idb(this.idb);
    try {
      const rec = await idbOp(db, 'readonly', (s) => s.get('session'));
      if (!rec) return null;
      const key = await idbOp(db, 'readonly', (s) => s.get('key'));
      if (!key) return null;
      const plain = await this.crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.cipher);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      return null; // bozuk veya başka anahtarla şifrelenmiş kayıt: oturum yok say
    } finally {
      db.close();
    }
  }

  async clear() {
    if (!this.idb) return;
    const db = await idb(this.idb);
    try {
      await idbOp(db, 'readwrite', (s) => {
        s.delete('session');
        return s.delete('key');
      });
    } finally {
      db.close();
    }
  }
}

/**
 * Oturum: erişim token'ını bellekte tutar, süresi dolmadan yeniler, gerekirse kasaya yazar.
 */
export class Session {
  constructor({ api, vault, remember = false }) {
    this.api = api;
    this.vault = vault;
    this.remember = remember;
    this.tokens = null;
    this._refreshing = null;
    this.onExpired = () => {};
  }

  get isLoggedIn() {
    return !!this.tokens;
  }

  async start(tokens, { remember }) {
    this.tokens = tokens;
    this.remember = !!remember;
    if (this.remember && tokens.refreshToken && this.vault.canPersist) {
      await this.vault.save(this.api.baseUrl, tokens.refreshToken);
    } else {
      await this.vault.clear().catch(() => {});
    }
  }

  /** Kasadaki şifreli yenileme token'ı ile oturumu geri yükler. */
  async restore() {
    const saved = await this.vault.load();
    if (!saved || saved.baseUrl !== this.api.baseUrl || !saved.refreshToken) return false;
    try {
      this.tokens = await this.api.refresh(saved.refreshToken);
      this.remember = true;
      return true;
    } catch (e) {
      if (e.code === ErrorCode.AUTH_EXPIRED || e.code === ErrorCode.AUTH_INVALID || e.code === ErrorCode.FORBIDDEN) {
        await this.vault.clear().catch(() => {});
      }
      throw e;
    }
  }

  async getAccessToken() {
    if (!this.tokens) throw new AppError(ErrorCode.AUTH_INVALID, { details: 'no session' });
    if (Date.now() > this.tokens.expiresAt - REFRESH_MARGIN_MS) return this.refresh(true);
    return this.tokens.accessToken;
  }

  async refresh() {
    if (!this.tokens || !this.tokens.refreshToken) throw new AppError(ErrorCode.AUTH_EXPIRED);
    if (!this._refreshing) {
      this._refreshing = this.api
        .refresh(this.tokens.refreshToken)
        .then((t) => {
          this.tokens = t;
          return t.accessToken;
        })
        .catch((e) => {
          if (e.code === ErrorCode.AUTH_EXPIRED || e.code === ErrorCode.AUTH_INVALID) {
            this.tokens = null;
            this.vault.clear().catch(() => {});
            this.onExpired(e);
          }
          throw e;
        })
        .finally(() => {
          this._refreshing = null;
        });
    }
    return this._refreshing;
  }

  async logout() {
    const rt = this.tokens && this.tokens.refreshToken;
    this.tokens = null;
    await this.vault.clear().catch(() => {});
    if (rt) await this.api.revoke(rt);
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { HaAuthApi, loginWithPassword, Session, TokenVault } from '../../app/js/core/auth.js';
import { ErrorCode } from '../../app/js/core/errors.js';

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, init });
    const h = routes[path] || routes['*'];
    if (!h) return new Response('not found', { status: 404 });
    const r = await h(init, calls.length);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status || 200 });
  };
  impl.calls = calls;
  return impl;
}

const api = (routes) => new HaAuthApi({ baseUrl: 'https://ev.example', clientId: 'https://ev.example/local/unified-smart-home/', fetchImpl: fakeFetch(routes) });

test('başarılı giriş: login_flow -> kod -> token', async () => {
  const a = api({
    '/auth/login_flow': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'init', data_schema: [] } }),
    '/auth/login_flow/f1': () => ({ body: { type: 'create_entry', result: 'CODE' } }),
    '/auth/token': (init) => {
      assert.match(init.body, /grant_type=authorization_code/);
      assert.match(init.body, /code=CODE/);
      return { body: { access_token: 'A', refresh_token: 'R', expires_in: 1800 } };
    },
  });
  const t = await loginWithPassword(a, 'u', 'p', async () => null);
  assert.equal(t.accessToken, 'A');
  assert.equal(t.refreshToken, 'R');
  assert.ok(t.expiresAt > Date.now());
});

test('hatalı parola Türkçe mesaj verir', async () => {
  const a = api({
    '/auth/login_flow': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'init' } }),
    '/auth/login_flow/f1': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'init', errors: { base: 'invalid_auth' } } }),
  });
  await assert.rejects(loginWithPassword(a, 'u', 'bad', async () => null), (e) => e.code === ErrorCode.AUTH_INVALID && /hatalı/.test(e.userMessage));
});

test('çok faktörlü doğrulama: kod istenir, yanlışsa yeniden istenir', async () => {
  let n = 0;
  const a = api({
    '/auth/login_flow': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'init' } }),
    '/auth/login_flow/f1': (init) => {
      n++;
      const body = JSON.parse(init.body);
      if (n === 1) return { body: { type: 'form', flow_id: 'f1', step_id: 'mfa' } };
      if (body.code === '111111') return { body: { type: 'form', flow_id: 'f1', step_id: 'mfa', errors: { base: 'invalid_code' } } };
      return { body: { type: 'create_entry', result: 'CODE' } };
    },
    '/auth/token': () => ({ body: { access_token: 'A', refresh_token: 'R', expires_in: 1800 } }),
  });
  const asked = [];
  const t = await loginWithPassword(a, 'u', 'p', async ({ retry }) => (asked.push(retry), retry ? '222222' : '111111'));
  assert.deepEqual(asked, [false, true]);
  assert.equal(t.accessToken, 'A');
});

test('MFA kodu girilmezse giriş iptal', async () => {
  const a = api({
    '/auth/login_flow': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'init' } }),
    '/auth/login_flow/f1': () => ({ body: { type: 'form', flow_id: 'f1', step_id: 'mfa' } }),
  });
  await assert.rejects(loginWithPassword(a, 'u', 'p', async () => ''), (e) => e.code === ErrorCode.MFA_INVALID);
});

test('süresi dolmuş/iptal edilmiş yenileme token\'ı AUTH_EXPIRED verir ve oturum kapanır', async () => {
  const a = api({ '/auth/token': () => ({ status: 400, body: { error: 'invalid_grant' } }) });
  const vault = new TokenVault({ isSecureContext: false });
  const s = new Session({ api: a, vault });
  let expired = 0;
  s.onExpired = () => expired++;
  await s.start({ accessToken: 'A', refreshToken: 'R', expiresAt: Date.now() - 1 }, { remember: false });
  await assert.rejects(s.getAccessToken(), (e) => e.code === ErrorCode.AUTH_EXPIRED);
  assert.equal(s.isLoggedIn, false);
  assert.equal(expired, 1);
});

test('eşzamanlı yenileme istekleri tek isteğe indirgenir', async () => {
  let calls = 0;
  const a = api({ '/auth/token': async () => (calls++, { body: { access_token: 'NEW', expires_in: 1800 } }) });
  const s = new Session({ api: a, vault: new TokenVault({ isSecureContext: false }) });
  await s.start({ accessToken: 'OLD', refreshToken: 'R', expiresAt: 0 }, { remember: false });
  const [x, y] = await Promise.all([s.getAccessToken(), s.getAccessToken()]);
  assert.equal(x, 'NEW');
  assert.equal(y, 'NEW');
  assert.equal(calls, 1);
  assert.equal(s.tokens.refreshToken, 'R', 'yenileme token\'ı korunur');
});

test('güvenli olmayan bağlamda token kalıcı saklanmaz', async () => {
  const vault = new TokenVault({ isSecureContext: false, cryptoImpl: globalThis.crypto, indexedDBImpl: {} });
  assert.equal(vault.canPersist, false);
  await assert.rejects(vault.save('x', 'R'), (e) => e.code === ErrorCode.INSECURE_CONTEXT);
  assert.equal(await vault.load(), null);
});

test('çıkışta yenileme token\'ı HA\'da iptal edilir', async () => {
  const f = fakeFetch({ '/auth/revoke': () => ({ body: '' }) });
  const a = new HaAuthApi({ baseUrl: 'https://ev.example', clientId: 'c', fetchImpl: f });
  const s = new Session({ api: a, vault: { clear: async () => {}, canPersist: false } });
  await s.start({ accessToken: 'A', refreshToken: 'R', expiresAt: Date.now() + 1e6 }, { remember: false });
  await s.logout();
  const rev = f.calls.find((c) => c.path === '/auth/revoke');
  assert.ok(rev);
  assert.match(rev.init.body, /token=R/);
  assert.equal(s.isLoggedIn, false);
});

test('HA erişilemezse anlaşılır hata', async () => {
  const a = new HaAuthApi({
    baseUrl: 'https://ev.example',
    clientId: 'c',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(a.startLoginFlow(), (e) => e.code === ErrorCode.HUB_UNREACHABLE);
});

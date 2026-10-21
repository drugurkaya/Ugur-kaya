import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, AppError, ErrorCode, fromHaError, fromHttpStatus, userMessageFor } from '../../app/js/core/errors.js';

test('redact: Bearer, JSON alanları ve JWT temizlenir', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJhYmNkZWZnaGkifQ.c2lnbmF0dXJlX3ZhbHVl';
  const s = redact(`Authorization: Bearer abc.def-123 {"access_token":"SECRET1","refresh_token": "SECRET2"} password=hunter2 ${jwt}`);
  assert.ok(!s.includes('abc.def-123'));
  assert.ok(!s.includes('SECRET1'));
  assert.ok(!s.includes('SECRET2'));
  assert.ok(!s.includes('hunter2'));
  assert.ok(!s.includes(jwt));
  assert.match(s, /Bearer \*\*\*/);
});

test('AppError Türkçe kullanıcı mesajı ve temizlenmiş ayrıntı içerir', () => {
  const e = new AppError(ErrorCode.HUB_UNREACHABLE, { details: 'ws failed token=abc123' });
  assert.equal(e.userMessage, 'Merkezle bağlantı kurulamadı. Ağ bağlantısını ve Home Assistant hizmetini kontrol edin.');
  assert.ok(!e.details.includes('abc123'));
});

test('bilinmeyen kod UNKNOWN olur', () => {
  const e = new AppError('nope');
  assert.equal(e.code, ErrorCode.UNKNOWN);
  assert.equal(userMessageFor('nope'), userMessageFor('unknown'));
});

test('HA hata kodları eşlenir', () => {
  assert.equal(fromHaError({ code: 'unauthorized', message: 'Unauthorized' }).code, ErrorCode.FORBIDDEN);
  assert.equal(fromHaError({ code: 'not_found' }).code, ErrorCode.NOT_FOUND);
  assert.equal(fromHaError({ code: 'invalid_format' }).code, ErrorCode.INVALID_INPUT);
  const sv = fromHaError({ code: 'home_assistant_error', message: 'Device offline' });
  assert.equal(sv.code, ErrorCode.SERVICE_FAILED);
  assert.match(sv.userMessage, /Device offline/);
});

test('HTTP durum kodları eşlenir', () => {
  assert.equal(fromHttpStatus(401).code, ErrorCode.AUTH_INVALID);
  assert.equal(fromHttpStatus(403).code, ErrorCode.FORBIDDEN);
  assert.equal(fromHttpStatus(404).code, ErrorCode.NOT_FOUND);
  assert.equal(fromHttpStatus(400, 'bad').code, ErrorCode.INVALID_INPUT);
  assert.equal(fromHttpStatus(502).code, ErrorCode.HUB_UNREACHABLE);
  assert.ok(!fromHttpStatus(500, '{"access_token":"leak"}').details.includes('leak'));
});

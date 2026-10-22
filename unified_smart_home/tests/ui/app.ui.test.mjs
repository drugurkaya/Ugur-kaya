// Uçtan uca arayüz testleri: gerçek tarayıcı (Chromium, iPhone emülasyonu) + gerçek Home Assistant çekirdeği.
// Cihazlar HA "demo" entegrasyonundandır (SİMÜLASYON). Bu testler iPhone Safari'de çalıştırılmış
// sayılmaz; WebKit/Safari'ye özgü davranışlar gerçek iPhone'da ayrıca doğrulanmalıdır (bkz. TEST_PLAN.md).
//
// Çalıştırma: scripts/run_tests.sh

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { HaAuthApi, loginWithPassword } from '../../app/js/core/auth.js';

const credPath = process.env.USH_HA_CREDENTIALS;
const skip = !credPath && 'USH_HA_CREDENTIALS tanımlı değil';
const cred = credPath ? JSON.parse(readFileSync(credPath, 'utf8')) : {};
const APP = `${cred.base}/local/unified-smart-home/index.html`;
const SHOTS = process.env.USH_SCREENSHOTS || 'test-results/screenshots';

let pw;
let browser;
let token;

async function ha(method, path, body) {
  const res = await fetch(cred.base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const state = (id) => ha('GET', `/api/states/${id}`);
async function waitState(id, pred, ms = 8000) {
  const end = Date.now() + ms;
  let s;
  while (Date.now() < end) {
    s = await state(id);
    if (pred(s)) return s;
    await new Promise((r) => setTimeout(r, 150));
  }
  return s;
}

async function newPage({ device = 'iPhone 13', colorScheme = 'light' } = {}) {
  const ctx = await browser.newContext({ ...pw.devices[device], locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  return page;
}

async function login(page, { password = cred.password } = {}) {
  await page.goto(APP);
  await page.fill('#u', cred.username);
  await page.fill('#p', password);
  await page.click('button[type=submit]');
}

async function loggedIn(opts) {
  const page = await newPage(opts);
  await login(page);
  await page.waitForSelector('.stats', { timeout: 15000 });
  return page;
}

const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(600);
};

test.before(async () => {
  if (skip) return;
  try {
    pw = await import('playwright');
  } catch {
    pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
  browser = await pw.chromium.launch();
  const api = new HaAuthApi({ baseUrl: cred.base, clientId: cred.client_id });
  token = (await loginWithPassword(api, cred.username, cred.password, async () => null)).accessToken;
  mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => browser && browser.close());

test('yanlış parola Türkçe ve anlaşılır hata gösterir', { skip }, async () => {
  const page = await newPage();
  await login(page, { password: 'yanlis' });
  await page.waitForSelector('.error-box');
  assert.match(await page.textContent('.error-box'), /Kullanıcı adı veya parola hatalı/);
  await page.context().close();
});

test('giriş sonrası ana ekran gerçek verilerle açılır; konsol hatası yok', { skip }, async () => {
  const page = await loggedIn();
  const stats = await page.$$eval('.stat .v', (els) => els.map((e) => e.textContent));
  assert.equal(stats.length, 3);
  assert.ok(Number(stats[0]) > 0, 'aktif cihaz sayısı gerçek durumdan gelir');
  // Simülasyon cihazları etiketli olmalı
  await go(page, '#/rooms/_odasiz');
  assert.ok((await page.locator('.badge.sim').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/home-light.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('GÜVENLİK: token localStorage\'da tutulmaz, parola hiçbir yerde saklanmaz', { skip }, async () => {
  const page = await loggedIn();
  const ls = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!/access_token|refresh_token|eyJ/.test(ls), ls);
  assert.ok(!ls.includes(cred.password));
  const idb = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('ush-vault', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readonly');
          const g = tx.objectStore('kv').get('session');
          g.onsuccess = () => res(g.result ? { hasCipher: g.result.cipher instanceof ArrayBuffer, keys: Object.keys(g.result) } : null);
        };
        r.onerror = () => res('err');
      }),
  );
  assert.ok(idb && idb.hasCipher, 'yenileme token\'ı yalnızca şifreli saklanmalı');
  // Yeniden yüklemede oturum şifreli kasadan geri gelir
  await page.reload();
  await page.waitForSelector('.stats', { timeout: 15000 });
  await page.context().close();
});

test('döşemeden hızlı aç/kapa: HA\'daki gerçek durum değişir ve doğrulanır', { skip }, async () => {
  await ha('POST', '/api/services/light/turn_off', { entity_id: 'light.bed_light' });
  const page = await loggedIn();
  await go(page, '#/rooms/_odasiz');
  const btn = page.locator('[data-entity="light.bed_light"] button.ic');
  await btn.click();
  const s = await waitState('light.bed_light', (x) => x.state === 'on');
  assert.equal(s.state, 'on');
  await page.waitForSelector('[data-entity="light.bed_light"].on');
  await page.locator('[data-entity="light.bed_light"] button.ic').click();
  assert.equal((await waitState('light.bed_light', (x) => x.state === 'off')).state, 'off');
  await page.context().close();
});

test('cihaz ekranı: parlaklık kaydırıcısı gerçek parlaklığı değiştirir, doğrulama gösterilir', { skip }, async () => {
  await ha('POST', '/api/services/light/turn_on', { entity_id: 'light.kitchen_lights', brightness_pct: 20 });
  const page = await loggedIn();
  await go(page, '#/device/light.kitchen_lights');
  const slider = page.locator('input[data-focus-key="bri"]');
  await slider.evaluate((el) => {
    el.value = 75;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  const s = await waitState('light.kitchen_lights', (x) => Math.abs((x.attributes.brightness / 255) * 100 - 75) <= 2);
  assert.ok(Math.abs((s.attributes.brightness / 255) * 100 - 75) <= 2);
  await page.waitForSelector('.phase-line.confirmed', { timeout: 8000 });
  await page.context().close();
});

test('GÜVENLİK: kilit açma için tek dokunuş yetmez, basılı tutma gerekir', { skip }, async () => {
  await ha('POST', '/api/services/lock/lock', { entity_id: 'lock.front_door' });
  await waitState('lock.front_door', (x) => x.state === 'locked');
  const page = await loggedIn();
  await go(page, '#/device/lock.front_door');
  await page.getByRole('button', { name: 'Kilidi aç' }).click();
  const confirmBtn = page.locator('.sheet .btn.danger');
  await confirmBtn.click(); // kısa dokunuş
  await page.waitForTimeout(1500);
  assert.equal((await state('lock.front_door')).state, 'locked', 'kısa dokunuş kilidi AÇMAMALI');
  // basılı tut
  const box = await confirmBtn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  const s = await waitState('lock.front_door', (x) => x.state === 'unlocked', 10000);
  assert.equal(s.state, 'unlocked');
  await ha('POST', '/api/services/lock/lock', { entity_id: 'lock.front_door' });
  await page.context().close();
});

test('alarm: kod HA\'ya gönderilir; yanlış kod reddedilir ve başarılı gösterilmez', { skip }, async () => {
  const page = await loggedIn();
  await go(page, '#/device/alarm_control_panel.security');
  await page.getByRole('button', { name: /Dışarıda modunda kur/ }).click();
  await page.fill('.sheet input[type=password]', '0000');
  await page.click('.sheet button[type=submit]');
  await page.waitForSelector('.phase-line.failed', { timeout: 8000 });
  assert.equal((await state('alarm_control_panel.security')).state, 'disarmed');
  await page.context().close();
});

test('otomasyon oluşturucu: arayüzden oluştur, test et, pasif kaydet, HA\'da doğrula, sil', { skip }, async () => {
  const page = await loggedIn();
  await go(page, '#/automation/new');
  await page.fill('input[aria-label="Otomasyon adı"]', 'UI test otomasyonu');
  await page.getByRole('button', { name: 'Tetikleyici ekle' }).click();
  await page.fill('.sheet input[type=time]', '19:00');
  await page.click('.sheet button[type=submit]');
  await page.getByRole('button', { name: 'İşlem ekle' }).click();
  await page.locator('.sheet select').nth(1).selectOption('light.ceiling_lights');
  await page.locator('.sheet select').nth(2).selectOption('turn_off');
  await page.click('.sheet button[type=submit]');
  assert.match(await page.textContent('main'), /Saat 19:00 olduğunda/);
  assert.match(await page.textContent('main'), /Ceiling Lights: kapat/);
  // Test modu
  await page.getByRole('button', { name: 'Test et' }).click();
  await page.waitForSelector('.sheet');
  assert.match(await page.textContent('.sheet'), /Hiçbir cihaza komut gönderilmedi/);
  await page.click('.sheet button[aria-label="Kapat"]');
  // Kaydet (pasif varsayılan)
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForFunction(() => location.hash === '#/automations', null, { timeout: 10000 });
  const states = await ha('GET', '/api/states');
  const auto = states.find((s) => s.entity_id.startsWith('automation.') && s.attributes.friendly_name === 'UI test otomasyonu');
  assert.ok(auto, 'HA\'da otomasyon oluşmalı');
  assert.equal(auto.state, 'off', 'yeni otomasyon pasif kaydedilmeli');
  const cfg = await ha('GET', `/api/config/automation/config/${auto.attributes.id}`);
  assert.deepEqual(cfg.triggers, [{ trigger: 'time', at: '19:00:00' }]);
  assert.equal(cfg.actions[0].action, 'light.turn_off');
  await ha('DELETE', `/api/config/automation/config/${auto.attributes.id}`);
  await page.context().close();
});

test('GÜVENLİK: otomasyon oluşturucuda kilit açma seçilemez', { skip }, async () => {
  const page = await loggedIn();
  await go(page, '#/automation/new');
  await page.getByRole('button', { name: 'İşlem ekle' }).click();
  await page.locator('.sheet select').nth(1).selectOption('lock.front_door');
  const unlockDisabled = await page.locator('.sheet select').nth(2).locator('option[value="unlock"]').evaluate((o) => o.disabled);
  assert.equal(unlockDisabled, true);
  await page.context().close();
});

test('senaryo: arayüzden oluştur, çalıştır, cihaz bazında doğrulanmış sonuç göster', { skip }, async () => {
  await ha('POST', '/api/services/light/turn_on', { entity_id: ['light.bed_light', 'light.office_rgbw_lights'] });
  const page = await loggedIn();
  await go(page, '#/scenario/new');
  await page.fill('input[aria-label="Senaryo adı"]', 'UI test gece');
  for (const id of ['light.bed_light', 'light.office_rgbw_lights']) {
    await page.getByRole('button', { name: 'Cihaz işlemi ekle' }).click();
    await page.locator('.sheet select').nth(1).selectOption(id);
    await page.locator('.sheet select').nth(2).selectOption('turn_off');
    await page.click('.sheet button[type=submit]');
  }
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForFunction(() => location.hash === '#/automations/scenarios');
  await page.waitForSelector('text=UI test gece');
  await page.getByRole('button', { name: 'Çalıştır: UI test gece' }).click();
  await page.waitForSelector('.sheet .result-row', { timeout: 20000 });
  const text = await page.textContent('.sheet');
  assert.match(text, /Bed Light: Başarılı/);
  assert.match(text, /Office RGBW Lights: Başarılı/);
  assert.match(text, /Tüm cihazlar doğrulandı/);
  assert.equal((await state('light.bed_light')).state, 'off');
  const scripts = (await ha('GET', '/api/states')).filter((s) => s.entity_id.startsWith('script.ush_ui_test_gece'));
  for (const s of scripts) await ha('DELETE', `/api/config/script/config/${s.entity_id.slice(7)}`);
  await page.context().close();
});

test('GÜVENLİK: cihaz adına gömülü HTML/betik çalıştırılmaz (XSS)', { skip }, async () => {
  // Kayıtlı bir varlığın adını kötü amaçlı bir metinle değiştir
  const ws = new WebSocket(cred.base.replace('http', 'ws') + '/api/websocket');
  let nextId = 1; // HA mesaj kimliklerinin artan olmasını şart koşar
  const send = (m) => new Promise((res) => {
    const id = nextId++;
    const on = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id === id) {
        ws.removeEventListener('message', on);
        res(d);
      }
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ ...m, id }));
  });
  await new Promise((r) => ws.addEventListener('message', function f(ev) {
    const d = JSON.parse(ev.data);
    if (d.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    if (d.type === 'auth_ok') {
      ws.removeEventListener('message', f);
      r();
    }
  }));
  const evil = '<img src=x onerror="window.__xss=1">Kötü<script>window.__xss=2</script>';
  await send({ type: 'config/entity_registry/update', entity_id: 'light.bed_light', name: evil });
  try {
    const page = await loggedIn();
    await go(page, '#/rooms/_odasiz');
    await go(page, '#/device/light.bed_light');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.ok((await page.textContent('h1')).includes('<img'), 'ad düz metin olarak görünmeli');
    // Boşluksuz uzun ad sayfayı yatayda taşırmamalı
    for (const hash of ['#/device/light.bed_light', '#/rooms/_odasiz']) {
      await go(page, hash);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${hash} taşma`);
    }
    await page.context().close();
  } finally {
    const restored = await send({ type: 'config/entity_registry/update', entity_id: 'light.bed_light', name: null });
    ws.close();
    assert.equal(restored.success, true, 'test verisi geri alınmalı');
  }
});

test('bağlantı kurulamazsa Türkçe ve anlaşılır hata gösterilir', { skip }, async () => {
  const page = await newPage();
  await page.routeWebSocket(/\/api\/websocket/, (ws) => ws.close());
  await login(page);
  await page.waitForSelector('.error-box', { timeout: 20000 });
  assert.match(await page.textContent('.error-box'), /Merkezle bağlantı kurulamadı|zamanında yanıt vermedi/);
  await page.context().close();
});

test('bağlantı koparsa uyarı şeridi görünür ve otomatik yeniden bağlanır', { skip }, async () => {
  const page = await newPage();
  let server;
  await page.routeWebSocket(/\/api\/websocket/, (ws) => {
    server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
  });
  await login(page);
  await page.waitForSelector('.stats', { timeout: 15000 });
  await server.close(); // merkez tarafında kopma
  await page.waitForSelector('.banner', { timeout: 5000 });
  assert.match(await page.textContent('.banner'), /bağlantı/i);
  await page.waitForSelector('.banner', { state: 'detached', timeout: 20000 });
  await page.context().close();
});

test('çıkış yapınca oturum HA\'da iptal edilir ve giriş ekranı açılır', { skip }, async () => {
  const page = await loggedIn();
  await go(page, '#/system');
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await page.locator('.sheet .btn.primary').click();
  await page.waitForSelector('#u');
  await page.reload();
  await page.waitForSelector('#u', { timeout: 10000 });
  await page.context().close();
});

for (const [device, scheme] of [
  ['iPhone SE', 'light'],
  ['iPhone 15 Pro Max', 'dark'],
  ['iPhone 13', 'dark'],
]) {
  test(`yerleşim: ${device} (${scheme === 'dark' ? 'koyu' : 'açık'} mod) — yatay taşma yok, dokunma alanları ≥32px`, { skip }, async () => {
    const page = await loggedIn({ device, colorScheme: scheme });
    for (const hash of ['#/home', '#/rooms', '#/device/climate.hvac', '#/automations', '#/energy', '#/system/health', '#/add']) {
      await go(page, hash);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `${hash} yatay taşma ${overflow}px`);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main button, main a.icon-btn, .tabbar a')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ el: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), h: el.getBoundingClientRect().height }))
          .filter((x) => x.h > 0 && x.h < 32),
      );
      assert.deepEqual(small, [], `${hash} küçük dokunma alanı`);
      await page.screenshot({ path: `${SHOTS}/${device.replace(/ /g, '_')}-${scheme}-${hash.replace(/[#/]/g, '_')}.png` });
    }
    if (scheme === 'dark') {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.equal(bg, 'rgb(0, 0, 0)');
    }
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

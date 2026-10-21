// Uygulama giriş noktası: oturum, bağlantı, yönlendirme.
// Uygulama Home Assistant tarafından aynı kökenden (/local/unified-smart-home/) sunulur;
// bu sayede CORS açmaya veya HA adresini ayrıca saklamaya gerek kalmaz.

import { HaAuthApi, loginWithPassword, Session, TokenVault } from './core/auth.js';
import { HaSocket, SocketStatus } from './core/ha-socket.js';
import { HomeStore } from './core/store.js';
import { AppError, ErrorCode } from './core/errors.js';
import { h, ic, clear, openSheet, toast, errorBox, notifyEntityChanged, resetLive, fill } from './ui/dom.js';
import { homeScreen } from './ui/screens/home.js';
import { roomsScreen, roomScreen } from './ui/screens/rooms.js';
import { deviceScreen } from './ui/screens/device.js';
import { automationsScreen, automationEditor, automationHistory } from './ui/screens/automations.js';
import { scenarioEditor } from './ui/screens/scenarios.js';
import { energyScreen } from './ui/screens/energy.js';
import { healthScreen } from './ui/screens/health.js';
import { settingsScreen } from './ui/screens/settings.js';
import { addDeviceScreen } from './ui/screens/add-device.js';

const root = document.getElementById('app');
const BASE_URL = location.origin;
const CLIENT_ID = new URL('./', location.href).href; // HA istemci kimliği = uygulama adresi

// ---------- tercihler (gizli bilgi İÇERMEZ: favoriler, tema, tarife) ----------
const PREFS_KEY = 'ush-prefs-v1';
export const prefs = (() => {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    data = {};
  }
  return {
    get: (k, d) => (data[k] === undefined ? d : data[k]),
    set: (k, v) => {
      data[k] = v;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(data));
      } catch {
        /* özel tarama modu */
      }
    },
  };
})();

function applyTheme() {
  const t = prefs.get('theme', 'system');
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();

// ---------- uygulama durumu ----------
const app = {
  store: null,
  socket: null,
  session: null,
  phases: new Map(), // entityId -> son komutun aşaması
  prefs,
  applyTheme,
  navigate: (path) => {
    location.hash = path;
  },
  logout,
  render: () => route(),
};
if (new URLSearchParams(location.search).has('debug')) window.__ush = app;

const api = new HaAuthApi({ baseUrl: BASE_URL, clientId: CLIENT_ID });
const vault = new TokenVault();

async function boot() {
  fill(root, h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', style: { width: '28px', height: '28px' } }), 'Merkeze bağlanılıyor…'));
  const session = new Session({ api, vault });
  app.session = session;
  session.onExpired = () => showLogin(new AppError(ErrorCode.AUTH_EXPIRED));
  try {
    const restored = await session.restore();
    if (!restored) return showLogin();
  } catch (e) {
    return showLogin(e.code === ErrorCode.HUB_UNREACHABLE ? e : new AppError(ErrorCode.AUTH_EXPIRED));
  }
  await start();
}

async function start() {
  const session = app.session;
  const socket = new HaSocket({
    url: BASE_URL.replace(/^http/, 'ws') + '/api/websocket',
    getAccessToken: () => session.getAccessToken(),
    refreshAccessToken: () => session.refresh(),
  });
  app.socket = socket;
  socket.onStatus((status) => {
    renderBanner();
    if (status === SocketStatus.AUTH_FAILED) showLogin(new AppError(ErrorCode.AUTH_EXPIRED));
  });
  try {
    await socket.connect();
  } catch (e) {
    if (e.code === ErrorCode.AUTH_INVALID || e.code === ErrorCode.AUTH_EXPIRED) return showLogin(e);
    // Ağ hatası: arka planda yeniden denenir; kullanıcıya açık mesaj gösterilir.
    fill(root, h('div', { class: 'login' }, errorBox(e), h('button', { class: 'btn primary block', onclick: () => location.reload() }, 'Yeniden dene')));
    return;
  }
  const store = new HomeStore({ socket, getAccessToken: () => session.getAccessToken(), baseUrl: BASE_URL });
  app.store = store;
  store.on((type, detail) => {
    if (type === 'state') notifyEntityChanged(detail.entityId);
    else if (type === 'loaded' || type === 'entities') scheduleRender();
    else if (type === 'connection') renderBanner();
  });
  try {
    await store.load();
  } catch (e) {
    fill(root, h('div', { class: 'login' }, errorBox(e), h('button', { class: 'btn primary block', onclick: () => location.reload() }, 'Yeniden dene')));
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') socket.reconnectNow();
  });
  window.addEventListener('online', () => {
    socket.reconnectNow();
    renderBanner();
  });
  window.addEventListener('offline', renderBanner);
  window.addEventListener('hashchange', route);
  route();
}

let renderQueued = false;
function scheduleRender() {
  // Düzenleme ekranlarında (form) tam yeniden çizim kullanıcının girdisini kaybettirir.
  if (renderQueued || currentScreen.editing) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    route({ keepScroll: true });
  });
}

// ---------- giriş ----------
function showLogin(err) {
  if (app.socket) app.socket.close();
  if (app.store) app.store.dispose();
  app.socket = null;
  app.store = null;
  resetLive();
  document.querySelector('.tabbar')?.remove();
  const canPersist = vault.canPersist;
  const user = h('input', { class: 'input', id: 'u', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'input', id: 'p', type: 'password', autocomplete: 'current-password', required: true });
  const remember = h('input', { type: 'checkbox', id: 'r', disabled: !canPersist, checked: canPersist });
  const errSlot = h('div', null, err ? errorBox(err) : null);
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Giriş yap');
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Giriş yapılıyor…';
        clear(errSlot);
        try {
          const tokens = await loginWithPassword(api, user.value.trim(), pass.value, askMfa);
          pass.value = '';
          app.session = app.session || new Session({ api, vault });
          app.session.onExpired = () => showLogin(new AppError(ErrorCode.AUTH_EXPIRED));
          await app.session.start(tokens, { remember: remember.checked });
          fill(root, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Yükleniyor…'));
          await start();
        } catch (ex) {
          fill(errSlot, errorBox(ex));
          submit.disabled = false;
          submit.textContent = 'Giriş yap';
        }
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'u' }, 'Kullanıcı adı'), user),
    h('div', { class: 'field' }, h('label', { for: 'p' }, 'Parola'), pass),
    h('label', { class: 'check', for: 'r' }, remember, h('span', null, 'Bu cihazda oturumu açık tut', h('div', { class: 'hint' }, canPersist ? 'Oturum anahtarı bu cihazda şifrelenmiş olarak saklanır. Parolanız saklanmaz.' : 'Bağlantı HTTPS olmadığı için oturum kalıcı saklanamaz; uygulamayı her açtığınızda giriş yapmanız gerekir.'))),
    errSlot,
    submit,
  );
  fill(root, 
    h(
      'main',
      { class: 'login' },
      h('div', { class: 'logo', 'aria-hidden': 'true' }, ic('home')),
      h('h1', null, 'Evim'),
      h('p', { class: 'c' }, 'Home Assistant hesabınızla giriş yapın'),
      !location.protocol.startsWith('https') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
        ? h('div', { class: 'warn-box' }, 'Bağlantı şifreli değil (HTTP). Ev dışından erişim için yalnızca HTTPS veya VPN kullanın.')
        : null,
      h('div', { class: 'card' }, form),
      h('p', { class: 'hint', style: { textAlign: 'center' } }, `Sunucu: ${BASE_URL}`),
    ),
  );
  user.focus();
}

function askMfa({ retry }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 8, 'aria-label': 'Doğrulama kodu' });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      ref.close();
      resolve(v);
    };
    const ref = openSheet(
      'İki adımlı doğrulama',
      h(
        'form',
        { onsubmit: (e) => (e.preventDefault(), finish(input.value.trim())) },
        retry ? h('div', { class: 'error-box' }, 'Kod hatalı. Güncel kodu girin.') : null,
        h('p', { style: { marginTop: 0 } }, 'Kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu girin.'),
        h('div', { class: 'field' }, input),
        h('button', { class: 'btn primary block', type: 'submit' }, 'Doğrula'),
      ),
      { onClose: () => finish('') },
    );
  });
}

async function logout() {
  if (app.socket) app.socket.close();
  if (app.store) app.store.dispose();
  await app.session.logout();
  location.hash = '';
  showLogin();
}

// ---------- bağlantı şeridi ----------
function renderBanner() {
  const slot = document.getElementById('banner-slot');
  if (!slot || !app.socket) return;
  const st = app.socket.status;
  let b = null;
  if (navigator.onLine === false) {
    b = h('div', { class: 'banner lvl-error', role: 'alert' }, ic('wifiOff'), 'Telefon çevrim dışı. Wi-Fi veya mobil veri bağlantısını kontrol edin.');
  } else if (st === SocketStatus.RECONNECTING || st === SocketStatus.CONNECTING) {
    b = h('div', { class: 'banner lvl-warn', role: 'status' }, h('span', { class: 'spinner' }), 'Merkezle bağlantı kesildi, yeniden bağlanılıyor… Gösterilen durumlar güncel olmayabilir.');
  } else if (st === SocketStatus.CLOSED) {
    b = h('div', { class: 'banner lvl-error', role: 'alert' }, ic('alert'), 'Merkezle bağlantı kurulamadı. Ağ bağlantısını ve Home Assistant hizmetini kontrol edin.');
  }
  fill(slot, b);
}

// ---------- yönlendirme ----------
const TABS = [
  ['#/home', 'Evim', 'home'],
  ['#/rooms', 'Odalar', 'rooms'],
  ['#/automations', 'Otomasyon', 'automation'],
  ['#/energy', 'Enerji', 'energy'],
  ['#/system', 'Sistem', 'system'],
];

function tabbar(active) {
  return h(
    'div',
    { class: 'tabbar' },
    h(
      'nav',
      { 'aria-label': 'Ana gezinme' },
      TABS.map(([href, label, iconName]) => h('a', { href, 'aria-current': active === href ? 'page' : null }, ic(iconName), h('span', null, label))),
    ),
  );
}

let currentScreen = { key: null, editing: false };

function route(opts = {}) {
  if (!app.store) return;
  const hash = location.hash || '#/home';
  const [, first, second, third] = hash.split('/');
  const p2 = second ? decodeURIComponent(second) : null;
  const p3 = third ? decodeURIComponent(third) : null;
  let screen;
  let tab = '#/home';
  let editing = false;
  const key = hash;
  if (currentScreen.key === key && currentScreen.editing && opts.keepScroll) return; // düzenleme sırasında yeniden çizme
  resetLive(); // önceki ekranın canlı bölgeleri; yeni ekran kendi kayıtlarını oluşturacak
  try {
    switch (first) {
      case 'rooms':
        tab = '#/rooms';
        screen = p2 ? roomScreen(app, p2) : roomsScreen(app);
        break;
      case 'device':
        tab = null;
        screen = deviceScreen(app, p2);
        break;
      case 'automations':
        tab = '#/automations';
        screen = automationsScreen(app, p2 || 'automations');
        break;
      case 'automation':
        tab = '#/automations';
        if (p3 === 'history') screen = automationHistory(app, p2);
        else {
          editing = true;
          screen = automationEditor(app, p2 === 'new' ? null : p2, p2 === 'new' ? app.prefill : null);
          app.prefill = null;
        }
        break;
      case 'scenario':
        tab = '#/automations';
        editing = true;
        screen = scenarioEditor(app, p2 === 'new' ? null : p2);
        break;
      case 'energy':
        tab = '#/energy';
        screen = energyScreen(app);
        break;
      case 'system':
        tab = '#/system';
        screen = p2 === 'health' ? healthScreen(app) : settingsScreen(app);
        break;
      case 'add':
        tab = '#/system';
        editing = true;
        screen = addDeviceScreen(app);
        break;
      default:
        screen = homeScreen(app);
    }
  } catch (e) {
    console.error(e);
    screen = h('div', null, errorBox(e instanceof AppError ? e : new AppError(ErrorCode.UNKNOWN, { cause: e })));
  }
  const scrollY = opts.keepScroll && currentScreen.key === key ? window.scrollY : 0;
  currentScreen = { key, editing };
  fill(root, h('div', { id: 'banner-slot' }), screen);
  document.querySelector('.tabbar')?.remove();
  document.body.appendChild(tabbar(tab));
  renderBanner();
  window.scrollTo(0, scrollY);
  if (!opts.keepScroll) {
    const h1 = root.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }
}

// Ekranların yeniden çizilmesini istemesi için
export function rerender() {
  route({ keepScroll: true });
}
app.rerender = rerender;
app.toast = toast;

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();

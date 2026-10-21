// Uygulamanın veri katmanı: HA'dan veriyi yükler, gerçek zamanlı olayları dinler, ortak modeli
// güncel tutar ve arayüze yalnızca bu katman üzerinden erişim verir. Arayüz hiçbir üreticiye
// veya entegrasyona doğrudan bağlanmaz.

import { buildHome, applyStateChange } from './model.js';
import { AppError, ErrorCode, fromHttpStatus } from './errors.js';
import { CommandRunner } from './commands.js';

export class HomeStore {
  /**
   * @param {object} deps
   * @param {import('./ha-socket.js').HaSocket} deps.socket
   * @param {() => Promise<string>} deps.getAccessToken
   * @param {string} deps.baseUrl
   * @param {typeof fetch} [deps.fetchImpl]
   */
  constructor({ socket, getAccessToken, baseUrl, fetchImpl }) {
    this.socket = socket;
    this.getAccessToken = getAccessToken;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.raw = { states: [], devices: [], entities: [], areas: [], floors: [], configEntries: [], manifests: [] };
    this.statesById = new Map();
    this.home = { areas: [], devices: new Map(), entities: new Map(), integrations: [] };
    this.config = null;
    this.user = null;
    this.listeners = new Set();
    this.stateListeners = new Set();
    this.events = []; // son olaylar (yerel, oturum içi)
    this.loaded = false;
    this._unsubs = [];
    this._registryTimer = null;
    this.commands = new CommandRunner({
      callService: (d, s, data, target) => this.socket.callService(d, s, data, target),
      getState: (id) => this.statesById.get(id) || null,
      onStateChange: (fn) => this.onStateChange(fn),
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(type, detail) {
    for (const fn of this.listeners) {
      try {
        fn(type, detail);
      } catch (e) {
        console.error('store listener', e);
      }
    }
  }

  onStateChange(fn) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  getState(entityId) {
    return this.statesById.get(entityId) || null;
  }

  get isAdmin() {
    return !!(this.user && this.user.is_admin);
  }

  async load() {
    const ws = this.socket;
    const [states, devices, entities, areas, configEntries, config, user] = await Promise.all([
      ws.sendMessage({ type: 'get_states' }),
      ws.sendMessage({ type: 'config/device_registry/list' }),
      ws.sendMessage({ type: 'config/entity_registry/list' }),
      ws.sendMessage({ type: 'config/area_registry/list' }),
      ws.sendMessage({ type: 'config_entries/get' }).catch(() => []),
      ws.sendMessage({ type: 'get_config' }),
      ws.sendMessage({ type: 'auth/current_user' }),
    ]);
    const floors = await ws.sendMessage({ type: 'config/floor_registry/list' }).catch(() => []);
    const domains = new Set([...configEntries.map((e) => e.domain), ...entities.map((e) => e.platform)]);
    const manifests = await ws.sendMessage({ type: 'manifest/list', integrations: [...domains] }).catch(() => []);
    this.config = config;
    this.user = user;
    this.raw = { states, devices, entities, areas, floors, configEntries, manifests };
    this._rebuild();
    if (!this.loaded) await this._subscribe();
    this.loaded = true;
    this._emit('loaded');
  }

  _rebuild() {
    this.statesById = new Map(this.raw.states.map((s) => [s.entity_id, s]));
    this.home = buildHome(this.raw);
  }

  async _subscribe() {
    const ws = this.socket;
    this._unsubs.push(
      await ws.subscribe({ type: 'subscribe_events', event_type: 'state_changed' }, (ev) => this._onStateChanged(ev.data)),
    );
    for (const evType of ['device_registry_updated', 'entity_registry_updated', 'area_registry_updated']) {
      this._unsubs.push(await ws.subscribe({ type: 'subscribe_events', event_type: evType }, () => this._scheduleRegistryReload()));
    }
    this._unsubs.push(
      await ws.subscribe({ type: 'config_entries/subscribe' }, (changes) => {
        for (const ch of changes || []) {
          const entry = ch.entry;
          if (!entry) continue;
          const i = this.raw.configEntries.findIndex((e) => e.entry_id === entry.entry_id);
          if (ch.type === 'removed') {
            if (i >= 0) this.raw.configEntries.splice(i, 1);
          } else if (i >= 0) this.raw.configEntries[i] = entry;
          else this.raw.configEntries.push(entry);
        }
        this._rebuild();
        this._emit('integrations');
      }).catch(() => () => {}),
    );
    // Yeniden bağlanınca kaçırılan değişiklikler için tam yeniden yükleme.
    ws.onStatus((status) => {
      if (status === 'connected' && this.loaded) this.load().catch((e) => this._emit('error', e));
      this._emit('connection', status);
    });
  }

  _scheduleRegistryReload() {
    clearTimeout(this._registryTimer);
    this._registryTimer = setTimeout(() => this.load().catch((e) => this._emit('error', e)), 800);
  }

  _onStateChanged(data) {
    const { entity_id: entityId, new_state: newState, old_state: oldState } = data;
    if (!newState) {
      this.statesById.delete(entityId);
      this.raw.states = this.raw.states.filter((s) => s.entity_id !== entityId);
      this.home.entities.delete(entityId);
      this._emit('entities', { entityId });
      return;
    }
    const existed = this.statesById.has(entityId);
    this.statesById.set(entityId, newState);
    if (!existed) {
      this.raw.states.push(newState);
      this._scheduleRegistryReload();
    } else {
      const idx = this.raw.states.findIndex((s) => s.entity_id === entityId);
      if (idx >= 0) this.raw.states[idx] = newState;
    }
    const entity = applyStateChange(this.home, newState);
    for (const fn of this.stateListeners) {
      try {
        fn(newState, oldState);
      } catch (e) {
        console.error('state listener', e);
      }
    }
    if (entity && oldState && oldState.state !== newState.state && !entity.category) {
      this.events.unshift({ entityId, name: entity.name, from: oldState.state, to: newState.state, at: newState.last_changed, domain: entity.domain });
      if (this.events.length > 50) this.events.pop();
    }
    this._emit('state', { entityId, entity });
  }

  // ------------- REST yardımcı -------------

  async rest(method, path, body) {
    const token = await this.getAccessToken();
    let res;
    try {
      res = await this.fetch(this.baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new AppError(ErrorCode.HUB_UNREACHABLE, { cause: e });
    }
    const text = await res.text();
    if (!res.ok) throw fromHttpStatus(res.status, text);
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  }

  // ------------- Otomasyonlar -------------

  automations() {
    return this.raw.states
      .filter((s) => s.entity_id.startsWith('automation.'))
      .map((s) => ({
        entityId: s.entity_id,
        configId: s.attributes.id || null,
        name: s.attributes.friendly_name || s.entity_id,
        enabled: s.state === 'on',
        unavailable: s.state === 'unavailable',
        lastTriggered: s.attributes.last_triggered || null,
        mode: s.attributes.mode || null,
        running: Number(s.attributes.current) || 0,
      }));
  }

  getAutomationConfig(configId) {
    return this.rest('GET', `/api/config/automation/config/${encodeURIComponent(configId)}`);
  }

  saveAutomationConfig(configId, cfg) {
    return this.rest('POST', `/api/config/automation/config/${encodeURIComponent(configId)}`, cfg);
  }

  deleteAutomation(configId) {
    return this.rest('DELETE', `/api/config/automation/config/${encodeURIComponent(configId)}`);
  }

  /** Kaydedilen otomasyonun entity_id'si oluşana kadar bekler. */
  waitForAutomationEntity(configId, timeoutMs = 8000) {
    const find = () => this.raw.states.find((s) => s.entity_id.startsWith('automation.') && s.attributes.id === configId);
    const found = find();
    if (found) return Promise.resolve(found.entity_id);
    return new Promise((resolve) => {
      const off = this.onStateChange((st) => {
        if (st.entity_id.startsWith('automation.') && st.attributes.id === configId) {
          off();
          clearTimeout(timer);
          resolve(st.entity_id);
        }
      });
      const timer = setTimeout(() => {
        off();
        resolve(find()?.entity_id || null);
      }, timeoutMs);
    });
  }

  setAutomationEnabled(entityId, enabled) {
    return this.socket.callService('automation', enabled ? 'turn_on' : 'turn_off', {}, { entity_id: entityId });
  }

  triggerAutomation(entityId, { skipCondition = false } = {}) {
    return this.socket.callService('automation', 'trigger', { skip_condition: skipCondition }, { entity_id: entityId });
  }

  traces(domain, itemId) {
    return this.socket.sendMessage({ type: 'trace/list', domain, ...(itemId ? { item_id: itemId } : {}) });
  }

  /** Son hata ile biten otomasyon çalışmaları (sağlık ekranı için). */
  async failedAutomationRuns() {
    const list = await this.traces('automation');
    const byId = new Map(this.automations().map((a) => [a.configId, a.name]));
    return (list || [])
      .filter((t) => t.error)
      .sort((a, b) => Date.parse(b.timestamp.start) - Date.parse(a.timestamp.start))
      .map((t) => ({ name: byId.get(t.item_id) || t.item_id, when: t.timestamp.start, error: t.error }));
  }

  // ------------- Senaryolar (HA script) -------------

  scripts() {
    return this.raw.states
      .filter((s) => s.entity_id.startsWith('script.'))
      .map((s) => ({ entityId: s.entity_id, configId: s.entity_id.slice(7), name: s.attributes.friendly_name || s.entity_id, icon: s.attributes.icon || null, running: s.state === 'on', lastTriggered: s.attributes.last_triggered || null }));
  }

  getScriptConfig(id) {
    return this.rest('GET', `/api/config/script/config/${encodeURIComponent(id)}`);
  }

  saveScriptConfig(id, cfg) {
    return this.rest('POST', `/api/config/script/config/${encodeURIComponent(id)}`, cfg);
  }

  deleteScript(id) {
    return this.rest('DELETE', `/api/config/script/config/${encodeURIComponent(id)}`);
  }

  // ------------- Alanlar ve cihaz kaydı -------------

  createArea(name) {
    return this.socket.sendMessage({ type: 'config/area_registry/create', name });
  }

  updateArea(areaId, name) {
    return this.socket.sendMessage({ type: 'config/area_registry/update', area_id: areaId, name });
  }

  deleteArea(areaId) {
    return this.socket.sendMessage({ type: 'config/area_registry/delete', area_id: areaId });
  }

  updateDevice(deviceId, { areaId, name }) {
    const msg = { type: 'config/device_registry/update', device_id: deviceId };
    if (areaId !== undefined) msg.area_id = areaId;
    if (name !== undefined) msg.name_by_user = name || null;
    return this.socket.sendMessage(msg);
  }

  updateEntity(entityId, { areaId, name }) {
    const msg = { type: 'config/entity_registry/update', entity_id: entityId };
    if (areaId !== undefined) msg.area_id = areaId;
    if (name !== undefined) msg.name = name || null;
    return this.socket.sendMessage(msg);
  }

  /** Bir varlığın ilişkili olduğu otomasyon/senaryolar (HA arama API'si). */
  related(itemType, itemId) {
    return this.socket.sendMessage({ type: 'search/related', item_type: itemType, item_id: itemId });
  }

  // ------------- Enerji / istatistik -------------

  statistics(statisticIds, start, end, period = 'day') {
    return this.socket.sendMessage(
      {
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        end_time: end ? end.toISOString() : undefined,
        statistic_ids: statisticIds,
        period,
        types: ['change'],
      },
      { timeoutMs: 20000 },
    );
  }

  // ------------- Sağlık -------------

  backupInfo() {
    return this.socket.sendMessage({ type: 'backup/info' });
  }

  // ------------- Entegrasyon ekleme (HA config flow) -------------

  discoveredFlows() {
    return this.socket.sendMessage({ type: 'config_entries/flow/progress' });
  }

  manifest(domain) {
    return this.socket.sendMessage({ type: 'manifest/get', integration: domain });
  }

  startFlow(handler) {
    return this.rest('POST', '/api/config/config_entries/flow', { handler, show_advanced_options: false });
  }

  continueFlow(flowId, data) {
    return this.rest('POST', `/api/config/config_entries/flow/${encodeURIComponent(flowId)}`, data);
  }

  abortFlow(flowId) {
    return this.rest('DELETE', `/api/config/config_entries/flow/${encodeURIComponent(flowId)}`);
  }

  // ------------- Oturumlar -------------

  refreshTokens() {
    return this.socket.sendMessage({ type: 'auth/refresh_tokens' });
  }

  deleteRefreshToken(id) {
    return this.socket.sendMessage({ type: 'auth/delete_refresh_token', refresh_token_id: id });
  }

  dispose() {
    clearTimeout(this._registryTimer);
    for (const u of this._unsubs) u();
    this._unsubs = [];
  }
}

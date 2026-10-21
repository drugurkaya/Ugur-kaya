// Ortak cihaz modeli: Home Assistant kayıtlarından (device/entity/area registry, config entries,
// manifest) ve durumlardan, markadan bağımsız bir görünüm üretir. Hiçbir değer uydurulmaz:
// bilinmeyen bilgiler null kalır ve arayüzde gösterilmez.

export const UNAVAILABLE = 'unavailable';
export const UNKNOWN = 'unknown';

/** Entegrasyonun yerel/bulut bağımlılığı (HA manifest iot_class alanından). */
export const Connectivity = Object.freeze({
  LOCAL: 'local',
  HYBRID: 'hybrid',
  CLOUD: 'cloud',
  PARTIAL: 'partial',
  CALCULATED: 'calculated',
  SIMULATED: 'simulated',
  UNVERIFIED: 'unverified',
});

export const CONNECTIVITY_LABELS = {
  local: 'Tamamen yerel',
  hybrid: 'Yerel ağ ve üretici bulutu',
  cloud: 'Yalnızca üretici bulutu',
  partial: 'Kısmen yerel',
  calculated: 'Home Assistant içinde hesaplanır',
  simulated: 'Simülasyon (gerçek cihaz değil)',
  unverified: 'Henüz doğrulanmadı',
};

// HA manifest'i tek bir iot_class bildirir; bazı entegrasyonlar gerçekte karma çalışır.
// Bu tablo yalnızca belgelenmiş davranışa göre düzeltme yapar (bkz. DEVICE_COMPATIBILITY.md).
const CONNECTIVITY_OVERRIDES = {
  demo: Connectivity.SIMULATED,
  sonoff: Connectivity.HYBRID, // AlexxIT/SonoffLAN: LAN öncelikli, bulut yedekli
  ewelink: Connectivity.HYBRID,
  tuya: Connectivity.CLOUD,
  tuya_local: Connectivity.LOCAL,
  localtuya: Connectivity.LOCAL,
};

export function connectivityFor(domain, iotClass) {
  if (CONNECTIVITY_OVERRIDES[domain]) return CONNECTIVITY_OVERRIDES[domain];
  switch (iotClass) {
    case 'local_push':
    case 'local_polling':
    case 'assumed_state':
      return Connectivity.LOCAL;
    case 'cloud_push':
    case 'cloud_polling':
      return Connectivity.CLOUD;
    case 'calculated':
      return Connectivity.CALCULATED;
    default:
      return Connectivity.UNVERIFIED;
  }
}

// Kullanıcının fiziksel cihaz olarak gördüğü alan adları (domain). Diğerleri (zone, sun, update...) gizlenir
// ya da yalnızca sistem ekranlarında kullanılır.
export const DEVICE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'cover', 'climate', 'lock', 'alarm_control_panel', 'sensor', 'binary_sensor',
  'valve', 'water_heater', 'humidifier', 'media_player', 'vacuum', 'siren', 'button', 'camera', 'number', 'select',
]);

export const CONTROLLABLE_DOMAINS = new Set([
  'light', 'switch', 'fan', 'cover', 'climate', 'lock', 'alarm_control_panel', 'valve', 'water_heater',
  'humidifier', 'media_player', 'siren', 'button', 'vacuum',
]);

// supported_features bit maskeleri (HA çekirdeği sabitleri)
const F = {
  light: { EFFECT: 4, FLASH: 8, TRANSITION: 32 },
  cover: { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8, OPEN_TILT: 16, CLOSE_TILT: 32, STOP_TILT: 64, SET_TILT_POSITION: 128 },
  valve: { OPEN: 1, CLOSE: 2, SET_POSITION: 4, STOP: 8 },
  fan: { SET_SPEED: 1, OSCILLATE: 2, DIRECTION: 4, PRESET_MODE: 8, TURN_OFF: 16, TURN_ON: 32 },
  climate: { TARGET_TEMPERATURE: 1, TARGET_TEMPERATURE_RANGE: 2, TARGET_HUMIDITY: 4, FAN_MODE: 8, PRESET_MODE: 16, SWING_MODE: 32, TURN_OFF: 128, TURN_ON: 256 },
  lock: { OPEN: 1 },
  alarm: { ARM_HOME: 1, ARM_AWAY: 2, ARM_NIGHT: 4, TRIGGER: 8, ARM_CUSTOM_BYPASS: 16, ARM_VACATION: 32 },
  media: { PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, TURN_ON: 128, TURN_OFF: 256, PLAY: 16384 },
  water_heater: { TARGET_TEMPERATURE: 1, OPERATION_MODE: 2, AWAY_MODE: 4, ON_OFF: 8 },
  vacuum: { TURN_ON: 1, TURN_OFF: 2, PAUSE: 4, STOP: 8, RETURN_HOME: 16, START: 8192 },
};

const has = (features, bit) => (Number(features) & bit) === bit;

/**
 * Bir varlığın HA durumundan GERÇEKTEN desteklediği yetenekleri çıkarır.
 * Arayüz yalnızca burada listelenen kontrolleri gösterir.
 */
export function capabilitiesFor(stateObj) {
  if (!stateObj) return [];
  const domain = stateObj.entity_id.split('.')[0];
  const a = stateObj.attributes || {};
  const f = a.supported_features || 0;
  const caps = [];
  switch (domain) {
    case 'light': {
      caps.push('on_off');
      const modes = a.supported_color_modes || [];
      if (modes.some((m) => m !== 'onoff')) caps.push('brightness');
      if (modes.includes('color_temp')) caps.push('color_temp');
      if (modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m))) caps.push('color');
      if (has(f, F.light.EFFECT) && Array.isArray(a.effect_list) && a.effect_list.length) caps.push('effect');
      break;
    }
    case 'switch':
    case 'siren':
    case 'humidifier':
      caps.push('on_off');
      if (domain === 'humidifier' && a.min_humidity != null) caps.push('target_humidity');
      break;
    case 'fan':
      if (has(f, F.fan.TURN_ON) || has(f, F.fan.TURN_OFF)) caps.push('on_off');
      if (has(f, F.fan.SET_SPEED)) caps.push('fan_speed');
      if (has(f, F.fan.OSCILLATE)) caps.push('oscillate');
      if (has(f, F.fan.PRESET_MODE) && Array.isArray(a.preset_modes) && a.preset_modes.length) caps.push('preset_mode');
      break;
    case 'cover':
      if (has(f, F.cover.OPEN)) caps.push('open');
      if (has(f, F.cover.CLOSE)) caps.push('close');
      if (has(f, F.cover.STOP)) caps.push('stop');
      if (has(f, F.cover.SET_POSITION)) caps.push('position');
      if (has(f, F.cover.SET_TILT_POSITION)) caps.push('tilt');
      break;
    case 'valve':
      if (has(f, F.valve.OPEN)) caps.push('open');
      if (has(f, F.valve.CLOSE)) caps.push('close');
      if (has(f, F.valve.STOP)) caps.push('stop');
      if (has(f, F.valve.SET_POSITION)) caps.push('position');
      break;
    case 'climate':
      if (Array.isArray(a.hvac_modes) && a.hvac_modes.length) caps.push('hvac_mode');
      if (has(f, F.climate.TARGET_TEMPERATURE)) caps.push('target_temperature');
      if (has(f, F.climate.TARGET_TEMPERATURE_RANGE)) caps.push('target_temperature_range');
      if (has(f, F.climate.TARGET_HUMIDITY)) caps.push('target_humidity');
      if (has(f, F.climate.FAN_MODE) && Array.isArray(a.fan_modes) && a.fan_modes.length) caps.push('fan_mode');
      if (has(f, F.climate.PRESET_MODE) && Array.isArray(a.preset_modes) && a.preset_modes.length) caps.push('preset_mode');
      if (a.current_temperature != null) caps.push('temperature');
      if (a.current_humidity != null) caps.push('humidity');
      break;
    case 'water_heater':
      if (has(f, F.water_heater.TARGET_TEMPERATURE)) caps.push('target_temperature');
      if (has(f, F.water_heater.OPERATION_MODE) && Array.isArray(a.operation_list)) caps.push('operation_mode');
      if (has(f, F.water_heater.ON_OFF)) caps.push('on_off');
      if (a.current_temperature != null) caps.push('temperature');
      break;
    case 'lock':
      caps.push('lock', 'unlock');
      if (has(f, F.lock.OPEN)) caps.push('open_latch');
      break;
    case 'alarm_control_panel':
      caps.push('disarm');
      if (has(f, F.alarm.ARM_HOME)) caps.push('arm_home');
      if (has(f, F.alarm.ARM_AWAY)) caps.push('arm_away');
      if (has(f, F.alarm.ARM_NIGHT)) caps.push('arm_night');
      if (has(f, F.alarm.ARM_VACATION)) caps.push('arm_vacation');
      if (a.code_format) caps.push('code_required');
      break;
    case 'media_player':
      if (has(f, F.media.TURN_ON) && has(f, F.media.TURN_OFF)) caps.push('on_off');
      if (has(f, F.media.PLAY) && has(f, F.media.PAUSE)) caps.push('play_pause');
      if (has(f, F.media.VOLUME_SET)) caps.push('volume');
      break;
    case 'vacuum':
      if (has(f, F.vacuum.START)) caps.push('start');
      if (has(f, F.vacuum.STOP)) caps.push('stop');
      if (has(f, F.vacuum.RETURN_HOME)) caps.push('return_home');
      break;
    case 'button':
      caps.push('press');
      break;
    case 'sensor': {
      const dc = a.device_class;
      if (dc === 'temperature') caps.push('temperature');
      else if (dc === 'humidity') caps.push('humidity');
      else if (dc === 'power') caps.push('power');
      else if (dc === 'energy') caps.push('energy');
      else if (dc === 'battery') caps.push('battery');
      else caps.push('measurement');
      break;
    }
    case 'binary_sensor': {
      const dc = a.device_class;
      if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') caps.push('motion');
      else if (['door', 'window', 'opening', 'garage_door'].includes(dc)) caps.push('contact');
      else if (dc === 'battery') caps.push('battery_low');
      else if (['smoke', 'gas', 'moisture', 'safety', 'carbon_monoxide', 'problem'].includes(dc)) caps.push('safety_alert');
      else caps.push('binary');
      break;
    }
    default:
      break;
  }
  return caps;
}

// Güvenlik açısından hassas cihazlar: kullanıcının açık eylemi ve ek onay gerekir.
const SENSITIVE_COVER_CLASSES = new Set(['garage', 'gate', 'door']);

export function isSensitive(stateObj) {
  if (!stateObj) return false;
  const domain = stateObj.entity_id.split('.')[0];
  if (domain === 'lock' || domain === 'alarm_control_panel') return true;
  if ((domain === 'cover' || domain === 'valve') && SENSITIVE_COVER_CLASSES.has(stateObj.attributes?.device_class)) return true;
  return false;
}

export function availabilityOf(stateObj) {
  if (!stateObj) return 'missing';
  if (stateObj.state === UNAVAILABLE) return 'offline';
  if (stateObj.state === UNKNOWN) return 'unknown';
  return 'online';
}

/** Cihaz "aktif" mi (açık / çalışıyor)? Sayım ve ana ekran için. Sensörler aktif sayılmaz. */
export function isActive(stateObj) {
  if (!stateObj) return false;
  const domain = stateObj.entity_id.split('.')[0];
  const s = stateObj.state;
  switch (domain) {
    case 'light':
    case 'switch':
    case 'fan':
    case 'siren':
    case 'humidifier':
      return s === 'on';
    case 'cover':
    case 'valve':
      return s === 'open' || s === 'opening';
    case 'climate':
      return s !== 'off' && s !== UNAVAILABLE && s !== UNKNOWN;
    case 'media_player':
      return s === 'playing' || s === 'on';
    case 'lock':
      return s === 'unlocked' || s === 'open';
    case 'vacuum':
      return s === 'cleaning';
    default:
      return false;
  }
}

function indexBy(list, key) {
  const m = new Map();
  for (const x of list || []) m.set(x[key], x);
  return m;
}

/**
 * Tüm HA verisinden ortak modeli kurar.
 * @param {object} raw
 * @param {Array} raw.states get_states
 * @param {Array} raw.devices config/device_registry/list
 * @param {Array} raw.entities config/entity_registry/list
 * @param {Array} raw.areas config/area_registry/list
 * @param {Array} [raw.floors]
 * @param {Array} [raw.configEntries] config_entries/get
 * @param {Array} [raw.manifests] manifest/list
 */
export function buildHome(raw) {
  const statesById = indexBy(raw.states, 'entity_id');
  const devById = indexBy(raw.devices, 'id');
  const regById = indexBy(raw.entities, 'entity_id');
  const entryById = indexBy(raw.configEntries, 'entry_id');
  const manifestByDomain = indexBy(raw.manifests, 'domain');

  const integrationFor = (domain) => {
    const m = manifestByDomain.get(domain);
    return {
      domain,
      name: (m && m.name) || domain,
      iotClass: (m && m.iot_class) || null,
      connectivity: connectivityFor(domain, m && m.iot_class),
      isBuiltIn: m ? m.is_built_in !== false : null,
      version: (m && m.version) || null,
    };
  };

  const areas = (raw.areas || []).map((a) => ({
    id: a.area_id,
    name: a.name,
    icon: a.icon || null,
    floorId: a.floor_id || null,
    temperatureEntityId: a.temperature_entity_id || null,
    humidityEntityId: a.humidity_entity_id || null,
  }));

  const integrations = (raw.configEntries || []).map((e) => {
    const base = integrationFor(e.domain);
    return {
      ...base,
      entryId: e.entry_id,
      title: e.title,
      state: e.state,
      reason: e.reason || null,
      disabled: !!e.disabled_by,
      source: e.source,
    };
  });

  const devices = new Map();
  for (const d of raw.devices || []) {
    if (d.disabled_by) continue;
    const entry = entryById.get(d.primary_config_entry || (d.config_entries || [])[0]);
    const domain = entry ? entry.domain : (d.identifiers && d.identifiers[0] && d.identifiers[0][0]) || null;
    const integ = domain ? integrationFor(domain) : null;
    devices.set(d.id, {
      id: d.id,
      name: d.name_by_user || d.name || 'Adsız cihaz',
      manufacturer: d.manufacturer || null,
      model: d.model || null,
      modelId: d.model_id || null,
      swVersion: d.sw_version || null,
      hwVersion: d.hw_version || null,
      areaId: d.area_id || null,
      integration: domain,
      integrationName: integ ? integ.name : null,
      connectivity: integ ? integ.connectivity : Connectivity.UNVERIFIED,
      simulated: domain === 'demo',
      viaDeviceId: d.via_device_id || null,
      entryType: d.entry_type || null,
      entityIds: [],
    });
  }

  const entities = new Map();
  for (const st of raw.states || []) {
    const entityId = st.entity_id;
    const domain = entityId.split('.')[0];
    if (!DEVICE_DOMAINS.has(domain)) continue;
    const reg = regById.get(entityId) || null;
    if (reg && (reg.hidden_by || reg.disabled_by)) continue;
    const device = reg && reg.device_id ? devices.get(reg.device_id) : null;
    const platform = reg ? reg.platform : null;
    const integ = platform ? integrationFor(platform) : null;
    const entity = {
      id: entityId,
      domain,
      name: (reg && reg.name) || st.attributes.friendly_name || entityId,
      deviceId: device ? device.id : null,
      areaId: (reg && reg.area_id) || (device && device.areaId) || null,
      integration: platform,
      connectivity: device ? device.connectivity : integ ? integ.connectivity : Connectivity.UNVERIFIED,
      simulated: platform === 'demo' || (device && device.simulated) || false,
      category: (reg && reg.entity_category) || null,
      state: st.state,
      attributes: st.attributes,
      lastChanged: st.last_changed,
      lastUpdated: st.last_updated,
      availability: availabilityOf(st),
      capabilities: capabilitiesFor(st),
      assumedState: st.attributes.assumed_state === true,
      sensitive: isSensitive(st),
      controllable: CONTROLLABLE_DOMAINS.has(domain),
    };
    entities.set(entityId, entity);
    if (device) device.entityIds.push(entityId);
  }

  // Varlığı olmayan (yalnızca servis/köprü) cihazları listeden çıkar.
  for (const [id, d] of devices) if (!d.entityIds.length) devices.delete(id);

  return { areas, devices, entities, integrations };
}

/** Bir varlık durum değiştirdiğinde modeli yerinde günceller. */
export function applyStateChange(home, newState) {
  if (!newState) return null;
  const e = home.entities.get(newState.entity_id);
  if (!e) return null;
  e.state = newState.state;
  e.attributes = newState.attributes;
  e.lastChanged = newState.last_changed;
  e.lastUpdated = newState.last_updated;
  e.availability = availabilityOf(newState);
  e.capabilities = capabilitiesFor(newState);
  e.assumedState = newState.attributes.assumed_state === true;
  e.sensitive = isSensitive(newState);
  return e;
}

/** Ana ekran özeti. Değeri olmayan alanlar null döner (sahte değer gösterilmez). */
export function summarize(home) {
  let active = 0;
  let offline = 0;
  let controllable = 0;
  const alarms = [];
  const openContacts = [];
  for (const e of home.entities.values()) {
    if (e.category) continue; // yapılandırma/teşhis varlıkları sayılmaz
    if (e.availability === 'offline') offline++;
    if (e.controllable) {
      controllable++;
      if (isActive({ entity_id: e.id, state: e.state })) active++;
    }
    if (e.domain === 'alarm_control_panel' && ['triggered', 'pending', 'arming'].includes(e.state)) alarms.push(e);
    if (e.domain === 'binary_sensor' && e.capabilities.includes('safety_alert') && e.state === 'on') alarms.push(e);
    if (e.domain === 'binary_sensor' && e.capabilities.includes('contact') && e.state === 'on') openContacts.push(e);
  }
  return { active, offline, controllable, alarms, openContacts };
}

/** Alan için iç ortam sıcaklık/nem değerini bulur: önce alanın tanımlı sensörü, sonra alandaki ilk sensör. */
export function climateReadingFor(home, areaId) {
  const area = home.areas.find((a) => a.id === areaId);
  const pick = (explicitId, cap) => {
    if (explicitId && home.entities.get(explicitId)?.availability === 'online') return home.entities.get(explicitId);
    for (const e of home.entities.values()) {
      if (e.areaId === areaId && e.domain === 'sensor' && e.capabilities.includes(cap) && e.availability === 'online') return e;
    }
    return null;
  };
  return {
    temperature: pick(area && area.temperatureEntityId, 'temperature'),
    humidity: pick(area && area.humidityEntityId, 'humidity'),
  };
}

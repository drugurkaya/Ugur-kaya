// Komut yaşam döngüsü: GÖNDERİLDİ → MERKEZ KABUL ETTİ → DURUM DOĞRULANDI.
// Arayüzdeki anlık geri bildirim, komutun fiziksel olarak uygulandığı anlamına gelmez; doğrulama
// yalnızca cihazdan gelen gerçek durum güncellemesiyle (state_changed) yapılır.

import { AppError, ErrorCode } from './errors.js';

export const CommandPhase = Object.freeze({
  SENDING: 'sending', // istek yolda
  ACCEPTED: 'accepted', // HA servisi hatasız tamamladı, cihaz durumu bekleniyor
  IN_PROGRESS: 'in_progress', // cihaz ara durumda (açılıyor, kilitleniyor...)
  CONFIRMED: 'confirmed', // cihazın bildirdiği durum beklenenle eşleşti
  UNCONFIRMED: 'unconfirmed', // süre içinde beklenen durum gelmedi
  UNVERIFIABLE: 'unverifiable', // cihaz durum bildirmiyor (assumed_state) ya da komutun durumu yok
  FAILED: 'failed', // HA veya cihaz hatası
});

export const PHASE_LABELS = {
  sending: 'Gönderiliyor…',
  accepted: 'Merkez kabul etti, cihaz yanıtı bekleniyor…',
  in_progress: 'Cihaz işlemi yürütüyor…',
  confirmed: 'Cihaz durumu doğrulandı',
  unconfirmed: 'Komut iletildi ancak cihazdan doğrulama gelmedi',
  unverifiable: 'Komut iletildi; bu cihaz durum bilgisi göndermediği için doğrulanamıyor',
  failed: 'Komut başarısız',
};

const TERMINAL = new Set(['confirmed', 'unconfirmed', 'unverifiable', 'failed']);

const ON_OFF_DOMAINS = new Set(['light', 'switch', 'fan', 'siren', 'humidifier', 'input_boolean', 'automation']);

// Yavaş hareket eden cihazlar için daha uzun doğrulama süresi.
const SLOW_DOMAINS = { cover: 90000, valve: 60000, lock: 30000, alarm_control_panel: 30000, climate: 20000, vacuum: 30000 };
const DEFAULT_CONFIRM_MS = 8000;

const near = (a, b, tol) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol;

/**
 * Bir servis çağrısından sonra beklenen durumu tarif eden doğrulayıcı üretir.
 * @returns {null | ((st: object) => 'match' | 'progress' | 'no')} null => doğrulanamaz
 */
export function expectationFor(domain, service, data = {}, currentState = null) {
  const cur = currentState ? currentState.state : null;
  if (ON_OFF_DOMAINS.has(domain) || domain === 'media_player' || domain === 'water_heater') {
    let target = null;
    if (service === 'turn_on') target = 'on';
    else if (service === 'turn_off') target = 'off';
    else if (service === 'toggle' && (cur === 'on' || cur === 'off')) target = cur === 'on' ? 'off' : 'on';
    if (target) {
      return (st) => {
        if (domain === 'media_player' && target === 'on') return st.state !== 'off' && st.state !== 'unavailable' ? 'match' : 'no';
        if (st.state !== target) return 'no';
        if (domain === 'light' && target === 'on' && data.brightness_pct != null) {
          const pct = st.attributes.brightness != null ? (st.attributes.brightness / 255) * 100 : null;
          return near(pct, data.brightness_pct, 2) ? 'match' : 'progress';
        }
        if (domain === 'light' && target === 'on' && data.color_temp_kelvin != null) {
          return near(st.attributes.color_temp_kelvin, data.color_temp_kelvin, 60) ? 'match' : 'progress';
        }
        if (domain === 'fan' && target === 'on' && data.percentage != null) {
          return near(st.attributes.percentage, data.percentage, 1) ? 'match' : 'progress';
        }
        return 'match';
      };
    }
  }
  if (domain === 'fan' && service === 'set_percentage') {
    return (st) => (data.percentage === 0 ? (st.state === 'off' ? 'match' : 'no') : near(st.attributes.percentage, data.percentage, 1) ? 'match' : 'no');
  }
  if (domain === 'cover' || domain === 'valve') {
    const map = {
      open_cover: ['open', 'opening'],
      close_cover: ['closed', 'closing'],
      open_valve: ['open', 'opening'],
      close_valve: ['closed', 'closing'],
    };
    if (map[service]) {
      const [done, moving] = map[service];
      return (st) => (st.state === done ? 'match' : st.state === moving ? 'progress' : 'no');
    }
    if (service === 'set_cover_position' || service === 'set_valve_position') {
      return (st) =>
        near(st.attributes.current_position, data.position, 1) ? 'match' : ['opening', 'closing'].includes(st.state) ? 'progress' : 'no';
    }
    if (service === 'stop_cover' || service === 'stop_valve') {
      return (st) => (['opening', 'closing'].includes(st.state) ? 'progress' : 'match');
    }
  }
  if (domain === 'lock') {
    const map = { lock: ['locked', 'locking'], unlock: ['unlocked', 'unlocking'], open: ['open', 'opening'] };
    if (map[service]) {
      const [done, moving] = map[service];
      return (st) => (st.state === done || (service === 'open' && st.state === 'unlocked') ? 'match' : st.state === moving ? 'progress' : 'no');
    }
  }
  if (domain === 'alarm_control_panel') {
    const map = {
      alarm_disarm: 'disarmed',
      alarm_arm_home: 'armed_home',
      alarm_arm_away: 'armed_away',
      alarm_arm_night: 'armed_night',
      alarm_arm_vacation: 'armed_vacation',
    };
    if (map[service]) {
      const target = map[service];
      return (st) => (st.state === target ? 'match' : ['arming', 'pending', 'disarming'].includes(st.state) ? 'progress' : 'no');
    }
  }
  if (domain === 'climate') {
    if (service === 'set_hvac_mode') return (st) => (st.state === data.hvac_mode ? 'match' : 'no');
    if (service === 'turn_off') return (st) => (st.state === 'off' ? 'match' : 'no');
    if (service === 'turn_on') return (st) => (st.state !== 'off' ? 'match' : 'no');
    if (service === 'set_temperature' && data.temperature != null) return (st) => (near(st.attributes.temperature, data.temperature, 0.05) ? 'match' : 'no');
    if (service === 'set_preset_mode') return (st) => (st.attributes.preset_mode === data.preset_mode ? 'match' : 'no');
    if (service === 'set_fan_mode') return (st) => (st.attributes.fan_mode === data.fan_mode ? 'match' : 'no');
  }
  if (domain === 'button' && service === 'press') {
    // Düğmenin durumu son basılma zamanıdır; değişirse basma kaydedilmiştir.
    return (st) => (cur != null && st.state !== cur ? 'match' : 'no');
  }
  if (domain === 'vacuum') {
    if (service === 'start') return (st) => (st.state === 'cleaning' ? 'match' : 'no');
    if (service === 'return_to_base') return (st) => (['returning', 'docked'].includes(st.state) ? 'match' : 'no');
    if (service === 'stop') return (st) => (st.state !== 'cleaning' ? 'match' : 'no');
  }
  return null;
}

/**
 * Komutları HA'ya gönderir ve sonucunu gerçek durumla doğrular.
 * @param {object} deps
 * @param {(domain, service, data, target) => Promise<any>} deps.callService
 * @param {(entityId: string) => object|null} deps.getState ham HA durum nesnesi
 * @param {(fn: (newState) => void) => () => void} deps.onStateChange
 */
export class CommandRunner {
  constructor(deps) {
    this.callService = deps.callService;
    this.getState = deps.getState;
    this.onStateChange = deps.onStateChange;
    this.t = deps.timers || globalThis;
    this.inflight = new Map(); // entityId -> komut (aynı varlığa çakışan komutları izlemek için)
    this.history = [];
  }

  /**
   * @param {object} cmd {entityId, service, data?, confirmTimeoutMs?}
   * @param {(update: {phase: string, error?: AppError}) => void} [onUpdate]
   * @returns {Promise<{phase: string, error?: AppError, entityId: string, durationMs: number}>}
   */
  run(cmd, onUpdate = () => {}) {
    const { entityId, service } = cmd;
    const data = cmd.data || {};
    const domain = entityId.split('.')[0];
    const started = Date.now();
    const before = this.getState(entityId);
    const record = { entityId, service, data, phase: CommandPhase.SENDING, startedAt: started, error: null };
    this.history.unshift(record);
    if (this.history.length > 100) this.history.pop();

    return new Promise((resolve) => {
      let finished = false;
      let unsubscribe = () => {};
      let timer = null;
      const emit = (phase, error) => {
        if (finished) return;
        record.phase = phase;
        record.error = error || null;
        onUpdate({ phase, error });
        if (TERMINAL.has(phase)) {
          finished = true;
          unsubscribe();
          if (timer) this.t.clearTimeout(timer);
          if (this.inflight.get(entityId) === record) this.inflight.delete(entityId);
          resolve({ phase, error, entityId, durationMs: Date.now() - started });
        }
      };

      if (!before) {
        emit(CommandPhase.FAILED, new AppError(ErrorCode.NOT_FOUND, { details: entityId }));
        return;
      }
      if (before.state === 'unavailable') {
        emit(CommandPhase.FAILED, new AppError(ErrorCode.DEVICE_UNAVAILABLE, { details: entityId }));
        return;
      }
      this.inflight.set(entityId, record);
      emit(CommandPhase.SENDING);

      const check = before.attributes && before.attributes.assumed_state === true ? null : expectationFor(domain, service, data, before);
      let accepted = false;
      let lastSeen = null;
      const evaluate = (st) => {
        if (!check || !st) return;
        if (st.state === 'unavailable') {
          emit(CommandPhase.FAILED, new AppError(ErrorCode.DEVICE_UNAVAILABLE, { details: `${entityId} unavailable after command` }));
          return;
        }
        const r = check(st);
        if (r === 'match' && accepted) emit(CommandPhase.CONFIRMED);
        else if (r === 'progress' && accepted) emit(CommandPhase.IN_PROGRESS);
      };
      if (check) {
        unsubscribe = this.onStateChange((st) => {
          if (st.entity_id !== entityId) return;
          lastSeen = st;
          evaluate(st);
        });
      }

      this.callService(domain, service, data, { entity_id: entityId })
        .then(() => {
          accepted = true;
          if (!check) {
            emit(CommandPhase.UNVERIFIABLE);
            return;
          }
          emit(CommandPhase.ACCEPTED);
          // Durum güncellemesi yanıttan önce gelmiş olabilir.
          evaluate(lastSeen || this.getState(entityId));
          if (finished) return;
          const ms = cmd.confirmTimeoutMs || SLOW_DOMAINS[domain] || DEFAULT_CONFIRM_MS;
          timer = this.t.setTimeout(() => emit(CommandPhase.UNCONFIRMED), ms);
        })
        .catch((err) => {
          emit(CommandPhase.FAILED, err instanceof AppError ? err : new AppError(ErrorCode.SERVICE_FAILED, { cause: err }));
        });
    });
  }
}

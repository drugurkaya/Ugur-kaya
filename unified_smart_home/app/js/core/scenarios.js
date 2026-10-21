// Senaryolar (toplu kontrol): Home Assistant "script" olarak saklanır; böylece HA'dan, sesli asistandan
// veya başka otomasyonlardan da çalıştırılabilir. Uygulama senaryoyu HA'ya çalıştırtır ve ardından
// her adımın hedef cihazında gerçek durumu ayrı ayrı doğrular (kısmi başarı açıkça raporlanır).

import { AppError, ErrorCode } from './errors.js';
import { expectationFor, CommandPhase } from './commands.js';
import { isBlockedAction, describeAction } from './automations.js';

export const SCENARIO_ICONS = ['mdi:home', 'mdi:home-export-outline', 'mdi:weather-night', 'mdi:account-group', 'mdi:airplane', 'mdi:movie-open', 'mdi:lightbulb-off', 'mdi:flower', 'mdi:radiator'];

export function validateScenario(s, getState) {
  const errors = [];
  if (!s.name || !String(s.name).trim()) errors.push('Senaryo adı boş olamaz.');
  if (!s.steps || !s.steps.length) errors.push('En az bir cihaz işlemi ekleyin.');
  (s.steps || []).forEach((st, i) => {
    const where = `Adım ${i + 1}`;
    const state = getState(st.entityId);
    if (!state) errors.push(`${where}: cihaz bulunamadı.`);
    if (!st.service) errors.push(`${where}: komut seçin.`);
    if (state && isBlockedAction(state, st.service)) errors.push(`${where}: güvenlik nedeniyle bu komut senaryoda kullanılamaz.`);
  });
  return errors;
}

export function scenarioToScript(s) {
  return {
    alias: String(s.name).trim(),
    icon: s.icon || 'mdi:play-circle-outline',
    description: 'Unified Smart Home senaryosu',
    // Aynı senaryonun çakışan çalışmalarını engeller; ikinci basış sessizce yok sayılır.
    mode: 'single',
    max_exceeded: 'silent',
    sequence: s.steps.map((st) => {
      const domain = st.entityId.split('.')[0];
      const out = { action: `${domain}.${st.service}`, target: { entity_id: st.entityId }, continue_on_error: true };
      if (st.data && Object.keys(st.data).length) out.data = { ...st.data };
      return out;
    }),
    variables: { ush_scenario: true },
  };
}

export function scriptToScenario(id, cfg) {
  const steps = [];
  let editable = true;
  for (const a of cfg.sequence || []) {
    const svc = a.action || a.service;
    const eid = a.target?.entity_id ?? a.entity_id;
    if (!svc || typeof eid !== 'string') {
      editable = false;
      continue;
    }
    const [, service] = svc.split('.');
    steps.push({ entityId: eid, service, data: a.data || {} });
  }
  return { editable, model: { id, name: cfg.alias || id, icon: cfg.icon || null, steps } };
}

/**
 * Senaryoyu HA'da çalıştırır ve adım adım doğrular.
 * @param {object} deps {callService, getState, onStateChange, timers}
 * @returns {Promise<Array<{entityId, text, phase, reason?}>>}
 */
export async function runScenario(scriptEntityId, scenario, deps, { timeoutMs = 15000 } = {}) {
  const t = deps.timers || globalThis;
  const steps = scenario.steps.map((st) => {
    const before = deps.getState(st.entityId);
    const domain = st.entityId.split('.')[0];
    const res = { entityId: st.entityId, text: describeAction({ kind: 'service', ...st }, deps.getState), phase: CommandPhase.ACCEPTED, reason: null };
    if (!before) {
      res.phase = CommandPhase.FAILED;
      res.reason = 'Cihaz bulunamadı';
    } else if (before.state === 'unavailable') {
      res.phase = CommandPhase.FAILED;
      res.reason = 'Cihaz çevrim dışı — yanıt alınamadı';
    } else if (before.attributes.assumed_state) {
      res.check = null;
    } else {
      res.check = expectationFor(domain, st.service, st.data || {}, before);
    }
    return res;
  });

  const pending = () => steps.filter((s) => s.check && s.phase !== CommandPhase.CONFIRMED && s.phase !== CommandPhase.FAILED);
  let resolveAll;
  const allDone = new Promise((r) => (resolveAll = r));
  const unsubscribe = deps.onStateChange((st) => {
    for (const s of steps) {
      if (s.entityId !== st.entity_id || !s.check) continue;
      if (s.phase === CommandPhase.FAILED) continue;
      if (st.state === 'unavailable') {
        s.phase = CommandPhase.FAILED;
        s.reason = 'Cihaz çevrim dışı oldu';
      } else {
        const r = s.check(st);
        if (r === 'match') s.phase = CommandPhase.CONFIRMED;
        else if (r === 'progress') s.phase = CommandPhase.IN_PROGRESS;
      }
    }
    if (!pending().length) resolveAll();
  });

  try {
    // Script'i doğrudan çağırmak HA tarafında tamamlanana kadar bekler.
    const [domain, object] = scriptEntityId.split('.');
    if (domain !== 'script') throw new AppError(ErrorCode.INVALID_INPUT, { details: scriptEntityId });
    await deps.callService('script', object, {}, undefined, { timeoutMs: timeoutMs + 5000 });
  } catch (e) {
    unsubscribe();
    const err = e instanceof AppError ? e : new AppError(ErrorCode.SERVICE_FAILED, { cause: e });
    for (const s of steps) {
      if (s.phase !== CommandPhase.FAILED) {
        s.phase = CommandPhase.FAILED;
        s.reason = err.userMessage;
      }
    }
    return steps.map(strip);
  }

  // Yanıt gelmeden önce gelen durum değişikliklerini yakalamak için mevcut durumları da kontrol et.
  for (const s of pending()) {
    const cur = deps.getState(s.entityId);
    if (cur && s.check(cur) === 'match') s.phase = CommandPhase.CONFIRMED;
  }
  if (pending().length) {
    await Promise.race([allDone, new Promise((r) => t.setTimeout(r, timeoutMs))]);
  }
  unsubscribe();
  for (const s of steps) {
    if (s.phase === CommandPhase.FAILED || s.phase === CommandPhase.CONFIRMED) continue;
    if (!s.check) {
      s.phase = CommandPhase.UNVERIFIABLE;
      s.reason = 'Cihaz durum bildirmiyor';
    } else {
      s.phase = CommandPhase.UNCONFIRMED;
      s.reason = 'Yanıt alınamadı';
    }
  }
  return steps.map(strip);
}

function strip(s) {
  return { entityId: s.entityId, text: s.text, phase: s.phase, reason: s.reason };
}

export function summarizeRun(results) {
  const ok = results.filter((r) => r.phase === CommandPhase.CONFIRMED).length;
  const failed = results.filter((r) => r.phase === CommandPhase.FAILED || r.phase === CommandPhase.UNCONFIRMED).length;
  const unknown = results.length - ok - failed;
  return { ok, failed, unknown, total: results.length, allOk: failed === 0 && unknown === 0 };
}

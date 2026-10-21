import { h, ic, section, topbar, openSheet, confirmDialog, toast, errorBox, fill } from '../dom.js';
import { editStep } from './automations.js';
import { scenarioToScript, scriptToScenario, validateScenario, runScenario, summarizeRun } from '../../core/scenarios.js';
import { describeAction, slugify } from '../../core/automations.js';
import { CommandPhase } from '../../core/commands.js';
import { relativeTime } from '../../core/format.js';

const running = new Set();

/** Senaryoyu çalıştırır ve cihaz bazında sonucu gösterir. */
export async function runScenarioUI(app, script) {
  if (running.has(script.entityId)) return;
  running.add(script.entityId);
  const body = h('div', null, h('div', { class: 'phase-line' }, h('span', { class: 'spinner' }), 'Senaryo çalıştırılıyor, cihaz yanıtları bekleniyor…'));
  openSheet(script.name, body);
  try {
    let scenario = null;
    if (app.store.isAdmin) {
      try {
        const cfg = await app.store.getScriptConfig(script.configId);
        const r = scriptToScenario(script.configId, cfg);
        if (r.editable) scenario = r.model;
      } catch {
        scenario = null;
      }
    }
    if (!scenario) {
      await app.socket.callService('script', 'turn_on', {}, { entity_id: script.entityId });
      fill(body, h('div', { class: 'phase-line unverifiable' }, ic('info'), 'Senaryo Home Assistant\'ta başlatıldı. Bu senaryonun adımları cihaz bazında doğrulanamıyor.'));
      return;
    }
    const results = await runScenario(script.entityId, scenario, {
      callService: (d, s, data, target, opts) => app.socket.callService(d, s, data, target, opts),
      getState: (id) => app.store.getState(id),
      onStateChange: (fn) => app.store.onStateChange(fn),
    });
    const sum = summarizeRun(results);
    const markFor = (p) => (p === CommandPhase.CONFIRMED ? ['ok', 'check', 'Başarılı'] : p === CommandPhase.UNVERIFIABLE ? ['unk', 'info', 'Doğrulanamadı'] : ['bad', 'x', 'Başarısız']);
    fill(body, 
      h('div', { class: `phase-line ${sum.allOk ? 'confirmed' : sum.failed ? 'failed' : 'unverifiable'}`, role: 'status' }, ic(sum.allOk ? 'check' : 'alert'), sum.allOk ? 'Tüm cihazlar doğrulandı.' : `${sum.ok}/${sum.total} cihaz doğrulandı${sum.failed ? `, ${sum.failed} cihazdan yanıt alınamadı` : ''}.`),
      h(
        'div',
        { class: 'card', style: { marginTop: '12px' } },
        results.map((r) => {
          const [k, i, l] = markFor(r.phase);
          const name = app.store.home.entities.get(r.entityId)?.name || r.entityId;
          return h('div', { class: 'result-row' }, h('span', { class: `mark ${k}` }, ic(i)), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, `${name}: ${l}`), h('div', { class: 'meta' }, r.text, r.reason ? ` · ${r.reason}` : '')));
        }),
      ),
    );
  } catch (e) {
    fill(body, errorBox(e));
  } finally {
    running.delete(script.entityId);
  }
}

function scripts(app) {
  return app.store.scripts().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function scenarioChips(app) {
  const list = scripts(app);
  if (!list.length) return h('div', { class: 'card empty' }, h('strong', null, 'Senaryo yok'), 'Örn. "Evden çıkıyorum": seçili ışıkları kapat. Otomasyon > Senaryolar\'dan oluşturun.');
  return h(
    'div',
    { class: 'readings' },
    list.slice(0, 10).map((s) => h('button', { class: 'reading', style: { border: 0, textAlign: 'left', minHeight: '64px' }, onclick: () => runScenarioUI(app, s), 'aria-label': `Senaryoyu çalıştır: ${s.name}` }, h('div', { class: 'l' }, ic('play')), h('div', { style: { fontWeight: 650 } }, s.name))),
  );
}

export function scenariosList(app) {
  const list = scripts(app);
  if (!list.length) return h('div', { class: 'card empty' }, h('strong', null, 'Henüz senaryo yok'), app.store.isAdmin ? '+ ile birden fazla cihazı tek dokunuşla kontrol eden bir senaryo oluşturun.' : 'Senaryo oluşturmak için yönetici yetkisi gerekir.');
  return h(
    'div',
    { class: 'list' },
    list.map((s) =>
      h(
        'div',
        { class: 'item' },
        h('button', { class: 'icon-btn', 'aria-label': `Çalıştır: ${s.name}`, onclick: () => runScenarioUI(app, s) }, ic('play')),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, s.name), h('div', { class: 'meta' }, `Son çalışma: ${s.lastTriggered ? relativeTime(s.lastTriggered) : 'hiç'}`)),
        app.store.isAdmin ? h('a', { class: 'icon-btn plain', href: `#/scenario/${encodeURIComponent(s.configId)}`, 'aria-label': `Düzenle: ${s.name}` }, ic('edit')) : null,
      ),
    ),
  );
}

export function scenarioEditor(app, configId) {
  const getState = (id) => app.store.getState(id);
  const isNew = !configId;
  const container = h('div', null, h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
  const main = h('main', null, topbar(isNew ? 'Yeni senaryo' : 'Senaryoyu düzenle', { back: () => app.navigate('#/automations/scenarios') }), container);
  if (!app.store.isAdmin) {
    fill(container, h('div', { class: 'warn-box' }, 'Senaryo düzenlemek için yönetici yetkisi gerekir.'));
    return main;
  }
  const start = (model, editable) => {
    if (!editable) {
      fill(container, h('div', { class: 'info-box' }, 'Bu senaryo gelişmiş adımlar içerdiği için yalnızca Home Assistant\'ta düzenlenebilir.'));
      return;
    }
    const name = h('input', { class: 'input', value: model.name || '', maxlength: 80, placeholder: 'ör. Evden çıkıyorum', 'aria-label': 'Senaryo adı' });
    const stepsEl = h('div');
    const renderSteps = () => {
      fill(stepsEl, 
        ...model.steps.map((st, i) =>
          h(
            'div',
            { class: 'step' },
            h('button', { class: 'grow', style: { background: 'none', border: 0, textAlign: 'left', padding: 0, minHeight: '44px' }, onclick: () => editStep(app, 'action', { kind: 'service', ...st }, (v) => ((model.steps[i] = { entityId: v.entityId, service: v.service, data: v.data }), renderSteps()), ['service']) }, describeAction({ kind: 'service', ...st }, getState)),
            h('button', { class: 'icon-btn plain', 'aria-label': 'Sil', onclick: () => (model.steps.splice(i, 1), renderSteps()) }, ic('trash')),
          ),
        ),
        h('button', { class: 'btn block', onclick: () => editStep(app, 'action', null, (v) => (model.steps.push({ entityId: v.entityId, service: v.service, data: v.data }), renderSteps()), ['service']) }, ic('plus'), 'Cihaz işlemi ekle'),
      );
    };
    renderSteps();
    const err = h('div');
    fill(container, 
      h('div', { class: 'field' }, h('label', null, 'Ad'), name),
      section('Cihaz işlemleri', stepsEl),
      h('p', { class: 'hint' }, 'Senaryo Home Assistant\'ta "script" olarak saklanır; çalıştırıldığında her cihazın sonucu ayrı ayrı doğrulanır. Bir cihaz yanıt vermezse diğerleri yine çalışır.'),
      err,
      h(
        'button',
        {
          class: 'btn primary block',
          onclick: async () => {
            model.name = name.value.trim();
            const errs = validateScenario(model, getState);
            if (errs.length) return fill(err, h('div', { class: 'error-box' }, errs.map((x) => h('div', null, x))));
            const id = configId || `ush_${slugify(model.name)}_${Date.now().toString(36).slice(-4)}`;
            try {
              await app.store.saveScriptConfig(id, scenarioToScript(model));
              toast('Senaryo kaydedildi');
              app.navigate('#/automations/scenarios');
            } catch (e) {
              fill(err, errorBox(e));
            }
          },
        },
        'Kaydet',
      ),
      !isNew
        ? h(
            'button',
            {
              class: 'btn danger block',
              style: { marginTop: '12px' },
              onclick: async () => {
                if (!(await confirmDialog({ title: 'Senaryo silinsin mi?', message: `"${model.name}" kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true }))) return;
                try {
                  await app.store.deleteScript(configId);
                  app.navigate('#/automations/scenarios');
                } catch (e) {
                  fill(err, errorBox(e));
                }
              },
            },
            'Senaryoyu sil',
          )
        : null,
    );
  };
  if (isNew) start({ name: '', steps: [] }, true);
  else
    app.store
      .getScriptConfig(configId)
      .then((cfg) => {
        const r = scriptToScenario(configId, cfg);
        start(r.model, r.editable);
      })
      .catch((e) => fill(container, errorBox(e)));
  return main;
}

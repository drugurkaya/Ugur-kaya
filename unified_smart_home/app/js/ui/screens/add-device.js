// Cihaz ekleme sihirbazı. Yeni entegrasyonu Home Assistant'ın kendi yapılandırma akışı (config flow)
// üzerinden kurar; uygulama üreticiye doğrudan bağlanmaz ve hesap bilgilerini saklamaz.

import { h, ic, section, topbar, errorBox, openSheet, fill } from '../dom.js';
import { BRANDS, DISCOVERY_TROUBLESHOOTING } from '../../core/catalog.js';
import { CONNECTIVITY_LABELS } from '../../core/model.js';

function flowField(f) {
  const id = `f_${f.name}`;
  const label = f.name;
  let input;
  if (f.type === 'boolean') input = h('input', { type: 'checkbox', id, name: f.name, checked: !!f.default });
  else if (f.type === 'select' && Array.isArray(f.options)) {
    input = h(
      'select',
      { class: 'input', id, name: f.name },
      f.options.map((o) => (Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o.value ?? o }, o.label ?? o))),
    );
  } else if (f.type === 'integer' || f.type === 'float') input = h('input', { class: 'input', type: 'number', id, name: f.name, value: f.default ?? '', step: f.type === 'float' ? 'any' : 1 });
  else if (f.type === 'string') input = h('input', { class: 'input', id, name: f.name, value: f.default ?? '', type: /pass|token|key|secret/i.test(f.name) ? 'password' : 'text', autocomplete: 'off', autocapitalize: 'none' });
  else return null; // desteklenmeyen alan türü
  return { el: f.type === 'boolean' ? h('label', { class: 'check', for: id }, input, label) : h('div', { class: 'field' }, h('label', { for: id }, label, f.required ? ' *' : ''), input), read: () => (f.type === 'boolean' ? input.checked : f.type === 'integer' ? Number(input.value) : f.type === 'float' ? Number(input.value) : input.value), name: f.name };
}

/** HA config flow adımlarını genel olarak gösterir. */
function runFlow(app, start, onDone) {
  const body = h('div', null, h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
  const ref = openSheet('Entegrasyon kurulumu', body, {
    onClose: () => {
      if (current && current.flow_id && current.type !== 'create_entry' && current.type !== 'abort') app.store.abortFlow(current.flow_id).catch(() => {});
    },
  });
  let current = null;
  const show = (step) => {
    current = step;
    if (step.type === 'form') {
      const fields = (step.data_schema || []).map(flowField);
      if (fields.some((f) => f === null)) {
        fill(body, h('div', { class: 'warn-box' }, 'Bu adım uygulamanın gösteremediği bir alan türü içeriyor. Kurulumu Home Assistant arayüzünde (Ayarlar > Cihazlar ve Hizmetler) tamamlayın.'));
        return;
      }
      const errs = step.errors && Object.keys(step.errors).length ? h('div', { class: 'error-box' }, Object.entries(step.errors).map(([k, v]) => h('div', null, `${k === 'base' ? '' : k + ': '}${v}`))) : null;
      fill(body, 
        h(
          'form',
          {
            onsubmit: async (e) => {
              e.preventDefault();
              const data = {};
              for (const f of fields) data[f.name] = f.read();
              fill(body, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Bağlantı test ediliyor…'));
              try {
                show(await app.store.continueFlow(step.flow_id, data));
              } catch (ex) {
                fill(body, errorBox(ex));
              }
            },
          },
          h('p', { class: 'hint', style: { marginTop: 0 } }, `Adım: ${step.step_id}. Girilen hesap bilgileri yalnızca Home Assistant'a gönderilir.`),
          errs,
          fields.map((f) => f.el),
          h('button', { class: 'btn primary block', type: 'submit' }, 'Devam'),
        ),
      );
    } else if (step.type === 'menu') {
      const opts = Array.isArray(step.menu_options) ? step.menu_options.map((o) => [o, o]) : Object.entries(step.menu_options || {});
      fill(body, h('div', { class: 'list' }, opts.map(([k, l]) => h('button', { class: 'item', onclick: async () => show(await app.store.continueFlow(step.flow_id, { next_step_id: k })) }, h('div', { class: 'grow title' }, l)))));
    } else if (step.type === 'external' || step.type === 'external_step') {
      fill(body, h('div', { class: 'info-box' }, 'Bu adım üreticinin oturum açma sayfasında tamamlanır.'), h('a', { class: 'btn primary block', href: step.url, target: '_blank', rel: 'noopener' }, 'Üretici sayfasını aç'), h('p', { class: 'hint' }, 'Tamamladıktan sonra Home Assistant akışı otomatik ilerler; ardından Sistem sağlığı ekranından kontrol edin.'));
    } else if (step.type === 'create_entry') {
      fill(body, h('div', { class: 'phase-line confirmed' }, ic('check'), `Bağlantı başarılı: ${step.title || step.handler}`), h('p', null, 'Yeni cihazlar birkaç saniye içinde listede görünür. Ad ve oda atamak için cihazın ayrıntı ekranını açın.'), h('button', { class: 'btn primary block', onclick: () => (ref.close(), onDone && onDone(step)) }, 'Tamam'));
    } else if (step.type === 'abort') {
      const reasons = { already_configured: 'Bu cihaz/hesap zaten ekli.', single_instance_allowed: 'Bu entegrasyon zaten kurulu (yalnızca bir kez eklenebilir).', no_devices_found: 'Ağda cihaz bulunamadı.', cannot_connect: 'Bağlantı kurulamadı.' };
      fill(body, h('div', { class: 'warn-box' }, reasons[step.reason] || `Kurulum durduruldu: ${step.reason}`), troubleshooting());
    } else if (step.type === 'progress' || step.type === 'show_progress') {
      fill(body, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Home Assistant işlemi sürdürüyor…'));
      setTimeout(async () => show(await app.store.continueFlow(step.flow_id, {}).catch(() => step)), 2000);
    } else {
      fill(body, h('div', { class: 'warn-box' }, 'Bu adım uygulamada desteklenmiyor. Home Assistant arayüzünde tamamlayın.'));
    }
  };
  start()
    .then(show)
    .catch((e) => fill(body, e.code === 'not_found' || e.code === 'invalid_input' ? h('div', null, h('div', { class: 'warn-box' }, 'Bu entegrasyon Home Assistant\'ta kurulu değil. Topluluk entegrasyonları (ör. Sonoff LAN) önce HACS ile kurulmalıdır.'), errorBox(e)) : errorBox(e)));
}

function troubleshooting() {
  return h(
    'details',
    { class: 'card', style: { marginTop: '12px' } },
    h('summary', { style: { fontWeight: 650, minHeight: '44px', display: 'flex', alignItems: 'center' } }, 'Cihaz bulunamadı mı? Olası nedenler'),
    h('ol', { style: { paddingLeft: '20px' } }, DISCOVERY_TROUBLESHOOTING.map(([t, d]) => h('li', { style: { marginBottom: '8px' } }, h('strong', null, t), h('div', { class: 'meta' }, d)))),
  );
}

function brandSheet(app, brand) {
  openSheet(
    brand.name,
    h(
      'div',
      null,
      h('div', { class: 'info-box' }, brand.summary),
      h('dl', { class: 'kv', style: { margin: '12px 0' } }, h('dt', null, 'Durum'), h('dd', null, brand.status), h('dt', null, 'Protokoller'), h('dd', null, brand.protocols.join(', ')), h('dt', null, 'Bağlantı'), h('dd', null, CONNECTIVITY_LABELS[brand.connectivity] || '-')),
      brand.paths.map((p) =>
        h(
          'div',
          { class: 'card', style: { marginBottom: '10px' } },
          h('div', { style: { fontWeight: 700 } }, p.title),
          h('div', { class: 'meta', style: { margin: '4px 0 8px' } }, `${p.kind === 'core' ? 'HA çekirdek entegrasyonu' : p.kind === 'hacs' ? 'Topluluk entegrasyonu (HACS)' : 'HA entegrasyonu yok'} · ${CONNECTIVITY_LABELS[p.connectivity] || ''}`),
          p.steps.length ? h('ol', { style: { paddingLeft: '20px', margin: '0 0 8px' } }, p.steps.map((s) => h('li', null, s))) : null,
          p.notes.map((n) => h('div', { class: 'hint' }, `• ${n}`)),
          p.integration && app.store.isAdmin ? h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: () => runFlow(app, () => app.store.startFlow(p.integration)) }, ic('plus'), 'Bu yolla kurulumu başlat') : null,
        ),
      ),
    ),
  );
}

export function addDeviceScreen(app) {
  const discovered = h('div', { class: 'list' }, h('div', { class: 'empty' }, 'Ağda keşfedilen cihazlar aranıyor…'));
  if (app.store.isAdmin) {
    app.store
      .discoveredFlows()
      .then((flows) => {
        const list = (flows || []).filter((f) => f.context && f.context.source !== 'user');
        if (!list.length) {
          fill(discovered, h('div', { class: 'empty' }, h('strong', null, 'Home Assistant yeni cihaz keşfetmedi'), 'Aşağıdan markayı seçerek elle ekleyebilirsiniz.'));
          return;
        }
        fill(discovered, 
          ...list.map((f) =>
            h(
              'button',
              { class: 'item', onclick: () => runFlow(app, () => app.store.getFlow(f.flow_id)) },
              ic('sensor'),
              h('div', { class: 'grow' }, h('div', { class: 'title' }, (f.context.title_placeholders && f.context.title_placeholders.name) || f.handler), h('div', { class: 'meta' }, `${f.handler} · ${f.context.source} ile keşfedildi`)),
              ic('chevron', 'chev'),
            ),
          ),
        );
      })
      .catch((e) => fill(discovered, errorBox(e)));
  } else {
    fill(discovered, h('div', { class: 'warn-box' }, 'Cihaz eklemek için Home Assistant yönetici yetkisi gerekir.'));
  }
  return h(
    'main',
    null,
    topbar('Yeni cihaz ekle', { back: () => app.navigate('#/system') }),
    h('p', { class: 'subtitle' }, 'Cihazlar Home Assistant entegrasyonları üzerinden eklenir. Her marka aynı şekilde bağlanmaz; önce markanızı seçip uyumluluk bilgisini okuyun.'),
    section('Ağda bulunanlar', discovered),
    section(
      'Marka seçin',
      h(
        'div',
        { class: 'list' },
        BRANDS.map((b) => h('button', { class: 'item', onclick: () => brandSheet(app, b) }, h('div', { class: 'grow' }, h('div', { class: 'title' }, b.name), h('div', { class: 'meta' }, `${b.status} · ${b.protocols.join(', ')}`)), ic('chevron', 'chev'))),
      ),
    ),
    troubleshooting(),
    h('p', { class: 'hint' }, 'Güvenlik: Sihirbaz ağdaki cihazlara parola denemesi veya izinsiz erişim girişiminde bulunmaz; yalnızca Home Assistant\'ın standart keşif (mDNS/SSDP/DHCP/Bluetooth) sonuçlarını gösterir.'),
  );
}


import { h, ic, section, topbar, openSheet, confirmDialog, toast, errorBox, fill } from '../dom.js';
import { tilesFor, runCommand } from '../components.js';
import { climateReadingFor, isActive } from '../../core/model.js';
import { num, DOMAIN_LABELS } from '../../core/format.js';

const UNASSIGNED = '_odasiz';

function visibleEntities(app, areaId) {
  return [...app.store.home.entities.values()]
    .filter((e) => !e.category && (areaId === UNASSIGNED ? !e.areaId : e.areaId === areaId))
    .sort((a, b) => Number(b.controllable) - Number(a.controllable) || a.name.localeCompare(b.name, 'tr'));
}

function areaForm(app, area) {
  const input = h('input', { class: 'input', value: area ? area.name : '', 'aria-label': 'Oda adı', maxlength: 60, required: true });
  const err = h('div');
  let ref;
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) return;
        try {
          if (area) await app.store.updateArea(area.id, name);
          else await app.store.createArea(name);
          ref.close();
          toast(area ? 'Oda adı güncellendi' : 'Oda eklendi');
        } catch (ex) {
          fill(err, errorBox(ex));
        }
      },
    },
    h('div', { class: 'field' }, h('label', null, 'Oda adı'), input),
    err,
    h('button', { class: 'btn primary block', type: 'submit' }, 'Kaydet'),
    area
      ? h(
          'button',
          {
            class: 'btn danger block',
            type: 'button',
            style: { marginTop: '10px' },
            onclick: async () => {
              const ok = await confirmDialog({ title: `"${area.name}" silinsin mi?`, message: 'Odadaki cihazlar silinmez; "Odasız" olarak görünür.', confirmText: 'Odayı sil', danger: true });
              if (!ok) return;
              try {
                await app.store.deleteArea(area.id);
                ref.close();
                app.navigate('#/rooms');
              } catch (ex) {
                fill(err, errorBox(ex));
              }
            },
          },
          'Odayı sil',
        )
      : null,
  );
  ref = openSheet(area ? 'Odayı düzenle' : 'Yeni oda', form);
}

export function roomsScreen(app) {
  const { home } = app.store;
  const cards = home.areas
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    .map((area) => {
      const ents = visibleEntities(app, area.id);
      const active = ents.filter((e) => e.controllable && isActive({ entity_id: e.id, state: e.state })).length;
      const offline = ents.filter((e) => e.availability === 'offline').length;
      const r = climateReadingFor(home, area.id);
      return h(
        'a',
        { class: 'room', href: `#/rooms/${encodeURIComponent(area.id)}`, style: { color: 'inherit', textDecoration: 'none' } },
        h('div', null, h('div', { class: 'rn' }, area.name), h('div', { class: 'rm' }, `${ents.length} cihaz${active ? ` · ${active} açık` : ''}${offline ? ` · ${offline} çevrim dışı` : ''}`)),
        h('div', { class: 'rt' }, r.temperature ? `${num(r.temperature.state)}°` : '', r.humidity ? `  %${num(r.humidity.state, 0)}` : ''),
      );
    });
  const unassigned = visibleEntities(app, UNASSIGNED);
  if (unassigned.length) {
    cards.push(h('a', { class: 'room', href: `#/rooms/${UNASSIGNED}`, style: { color: 'inherit', textDecoration: 'none' } }, h('div', null, h('div', { class: 'rn' }, 'Odasız cihazlar'), h('div', { class: 'rm' }, `${unassigned.length} cihaz`)), h('div', { class: 'rm' }, 'Bir odaya atayın')));
  }
  return h(
    'main',
    null,
    topbar('Odalar', { actions: app.store.isAdmin ? [h('button', { class: 'icon-btn', 'aria-label': 'Oda ekle', onclick: () => areaForm(app, null) }, ic('plus'))] : [] }),
    home.areas.length ? null : h('div', { class: 'info-box' }, 'Henüz oda tanımlanmamış. + ile oda ekleyip cihazları ayrıntı ekranından odalara atayabilirsiniz.'),
    h('div', { class: 'rooms' }, cards),
  );
}

export function roomScreen(app, areaId) {
  const area = app.store.home.areas.find((a) => a.id === areaId);
  const title = areaId === UNASSIGNED ? 'Odasız cihazlar' : area ? area.name : 'Oda bulunamadı';
  if (!area && areaId !== UNASSIGNED) return h('main', null, topbar(title, { back: () => app.navigate('#/rooms') }), h('div', { class: 'empty' }, 'Bu oda silinmiş olabilir.'));
  const ents = visibleEntities(app, areaId);
  const groups = new Map();
  for (const e of ents) {
    const g = e.controllable ? DOMAIN_LABELS[e.domain] || 'Diğer' : 'Sensörler';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e.id);
  }
  const lightsOn = ents.filter((e) => e.domain === 'light' && e.state === 'on');
  return h(
    'main',
    null,
    topbar(title, {
      back: () => app.navigate('#/rooms'),
      actions: area && app.store.isAdmin ? [h('button', { class: 'icon-btn', 'aria-label': 'Odayı düzenle', onclick: () => areaForm(app, area) }, ic('edit'))] : [],
    }),
    lightsOn.length > 1
      ? h(
          'button',
          {
            class: 'btn block',
            onclick: () => Promise.all(lightsOn.map((e) => runCommand(app, e, 'turn_off'))),
          },
          ic('bulb'),
          `Bu odadaki ${lightsOn.length} ışığı kapat`,
        )
      : null,
    ents.length ? [...groups.entries()].map(([g, ids]) => section(g, tilesFor(app, ids))) : h('div', { class: 'empty' }, 'Bu odada cihaz yok.'),
  );
}

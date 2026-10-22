import type { Dialogue } from '../types';
import { L, P, flag, hist, isTruth, notFlag } from './helpers';

/** Chapter 4: the operating room. */
export const or: Dialogue = {
  id: 'or',
  start: 'enter',
  nodes: {
    enter: {
      id: 'enter',
      onEnter: { minutes: 8, objective: 'operate' },
      lines: [
        { speaker: null, cond: flag('bedsideOpen'), text: L('Göğüs yoğun bakımda açıldı; kalp yeniden doldu. Kesin kontrol için ameliyathaneye taşındınız.', 'The chest was opened in the ICU; the heart filled again. You moved to theatre for definitive control.'), shot: 'orWide' },
        { speaker: null, cond: notFlag('bedsideOpen'), text: L('Ameliyathane 2. Soğuk hava, scialitik lambanın beyaz ışığı, pompanın düzenli uğultusu.', 'Theatre 2. Cold air, the white light of the surgical lamp, the steady hum of the machines.'), shot: 'orWide' },
        { speaker: 'murat', cond: { all: [{ memory: 'murat', key: 'wokenAt5' }, { rel: 'murat', min: 10 }] }, text: L('Erken aradığın iyi oldu Kemal. Hazırız.', 'Good that you called early, Kemal. We are ready.'), expr: 'focused' },
        { speaker: 'murat', cond: notFlag('orMobilised'), text: L('Kemal, ekibi on dakikada topladık. Kan ürünleri yolda.', 'Kemal, we pulled the team together in ten minutes. Blood is on its way.'), expr: 'worried' },
        { speaker: 'murat', text: L('Hasta entübe, OAB {map}. Hazır olduğunda.', 'He is intubated, MAP {map}. When you are ready.') },
      ],
      next: 'timeout',
    },
    timeout: {
      id: 'timeout',
      redirect: [{ cond: flag('bedsideOpen'), to: 'pump' }],
      lines: [{ speaker: 'hulya', text: L('Hocam, time-out yapalım mı?', 'Doctor, shall we do the time-out?'), expr: 'neutral' }],
      card: { title: L('Time-out', 'Time-out'), context: L('Kimlik, işlem, kan ürünleri, beklenen kanama, ekipman, roller.', 'Identity, procedure, blood availability, anticipated bleeding, equipment, roles.') },
      choices: [
        {
          id: 'full',
          text: L('Evet, eksiksiz. Herkes konuşsun.', 'Yes, all of it. Everyone speaks.'),
          detail: L('2 dakika', '2 minutes'),
          tags: ['team', 'record'],
          effects: { minutes: 2, flags: { timeoutDone: true }, goodPractice: 'timeOut', stats: { teamTrust: 5, documentation: 4 }, rel: { hulya: 6, murat: 3, serkan: 3 }, history: hist('team', 'Acil vakada bile tam time-out yaptın.', 'You ran a full time-out, even in an emergency.') },
          next: 'timeoutSpoken',
        },
        {
          id: 'short',
          text: L('Kısa geçelim; hasta kötü.', 'Keep it short; he is unstable.'),
          tags: ['time'],
          effects: { minutes: 1, stats: { teamTrust: -1 }, rel: { hulya: -2 } },
          next: 'pump',
        },
        {
          id: 'skip',
          text: L('Atla. Bıçak.', 'Skip it. Scalpel.'),
          tags: ['time', 'risk'],
          showIf: { patient: 'ahmet', metric: 'map', min: 45 },
          effects: { deviation: 'skippedTimeOut', stats: { teamTrust: -6 }, rel: { hulya: -8, murat: -4 }, memory: [{ char: 'hulya', key: 'skippedTimeOut' }] },
          next: 'pump',
        },
      ],
    },
    timeoutSpoken: {
      id: 'timeoutSpoken',
      lines: [
        { speaker: 'hulya', text: L('Hasta Ahmet Demirtaş, işlem re-eksplorasyon. 4 ünite eritrosit ve 4 TDP odada.', 'Patient Ahmet Demirtaş, procedure re-exploration. Four units of red cells and four plasma in the room.') },
        { speaker: 'serkan', text: L('Bir sorum var: pompayı prime edeyim mi, yoksa sadece set mi açık kalsın?', 'One question: should I prime the pump, or just keep the set open?'), expr: 'focused' },
      ],
      next: 'pump',
    },
    pump: {
      id: 'pump',
      lines: [{ speaker: 'serkan', cond: notFlag('timeoutDone'), text: L('Hocam, pompa için ne dersiniz?', 'Doctor, what about the pump?') }],
      card: { title: L('Ekipman hazırlığı', 'Equipment readiness') },
      choices: [
        {
          id: 'prime',
          text: L('Prime et, kanüller masada hazır olsun.', 'Prime it; have cannulae ready on the table.'),
          detail: L('Belki gereksiz bir set. Belki bir can simidi.', 'Maybe a wasted circuit. Maybe a lifeline.'),
          tags: ['team', 'care', 'money'],
          effects: { flags: { pumpPrimed: true }, rel: { serkan: 6 }, stats: { finance: -1 } },
          next: 'products',
        },
        {
          id: 'standby',
          text: L('Gerek yok, set kapalı dursun.', 'No need, keep the set closed.'),
          tags: ['money'],
          effects: { flags: { pumpPrimed: false } },
          next: 'products',
        },
      ],
    },
    products: {
      id: 'products',
      lines: [{ speaker: 'murat', text: L('Hücre kurtarıcıyı da kuralım mı? Teknisyen yolda, 3 dakika.', 'Shall we set up the cell saver too? The technician is 3 minutes away.') }],
      choices: [
        { id: 'yes', text: L('Evet, kurulsun.', 'Yes, set it up.'), tags: ['care', 'time'], effects: { minutes: 1, flags: { cellSaver: true }, patient: P('transfuseRBC'), rel: { murat: 3 } }, next: 'open' },
        { id: 'no', text: L('Beklemeyelim.', 'Let\'s not wait.'), tags: ['time'], next: 'open' },
      ],
    },
    open: {
      id: 'open',
      onEnter: { minutes: 6 },
      redirect: [{ cond: flag('bedsideOpen'), to: 'finding' }],
      lines: [{ speaker: null, text: L('Sternal teller kesiliyor. Retraktör. Perikard boşluğu…', 'The sternal wires are cut. Retractor. The pericardial space…'), shot: 'orTable' }],
      next: 'finding',
    },
    finding: {
      id: 'finding',
      onEnter: { patient: P('reExplore'), flags: { reExplored: true } },
      lines: [
        { speaker: null, cond: isTruth('surgical'), text: L('Pıhtıların altında, bir safen ven greftinin yan dalından nabızla gelen arteryel kanama.', 'Beneath the clots, pulsatile arterial bleeding from a side branch of a saphenous vein graft.'), selfExpr: 'focused' },
        { speaker: null, cond: isTruth('tamponade'), text: L('Perikardda ~400 ml organize pıhtı sağ atriyumu sıkıştırıyor. Pıhtı çıkınca tansiyon hemen yükseliyor. Bir sternal tel deliğinden sızıntı.', '~400 ml of organised clot compressing the right atrium. As it comes out, pressure rises at once. Oozing from a sternal wire hole.'), selfExpr: 'focused' },
        { speaker: null, cond: isTruth('coagulopathy'), text: L('Belirgin bir cerrahi odak yok. Her yerden yaygın, ince bir sızıntı.', 'No obvious surgical source. A diffuse, fine ooze from everywhere.'), selfExpr: 'worried' },
        { speaker: 'murat', text: L('OAB şimdi {map}.', 'MAP is {map} now.') },
      ],
      next: 'fix',
    },
    fix: {
      id: 'fix',
      card: { title: L('Bulgu', 'Finding') },
      choices: [
        {
          id: 'repair',
          text: L('Pledgetli 5/0 prolen ile yan dalı bağla.', 'Ligate the side branch with a pledgeted 5/0 Prolene.'),
          showIf: isTruth('surgical'),
          tags: ['care'],
          effects: { minutes: 6, patient: P('definitiveRepair'), flags: { sourceFound: true } },
          next: 'systematic',
        },
        {
          id: 'evacuate',
          text: L('Pıhtıyı boşalt, tel deliğini kontrol et, yıka.', 'Evacuate the clot, control the wire hole, irrigate.'),
          showIf: isTruth('tamponade'),
          tags: ['care'],
          effects: { minutes: 6, patient: P('definitiveRepair'), flags: { sourceFound: true } },
          next: 'systematic',
        },
        {
          id: 'coag',
          text: L('Murat ile ROTEM eşliğinde koagülopatiyi düzelt; sıcak serum, sabır.', 'Correct the coagulopathy with Murat, guided by ROTEM; warm saline, patience.'),
          showIf: isTruth('coagulopathy'),
          tags: ['care', 'team'],
          effects: { minutes: 15, patient: P('correctCoagulopathy', 'givePlasma', 'givePlatelets'), rel: { murat: 5 }, flags: { coagFixedInOR: true } },
          next: 'systematic',
        },
        {
          id: 'hunt',
          text: L('Bir kaynak olmalı. Aramaya devam et.', 'There must be a source. Keep searching.'),
          showIf: isTruth('coagulopathy'),
          tags: ['risk', 'time'],
          effects: { minutes: 20, patient: P('minorInsult'), rel: { murat: -4 }, stats: { stress: 5 } },
          next: 'fix',
        },
      ],
    },
    systematic: {
      id: 'systematic',
      lines: [{ speaker: 'hulya', text: L('Hocam, kapatmadan önce?', 'Doctor, before we close?') }],
      choices: [
        {
          id: 'check',
          text: L('Tüm anastomozları, greft yataklarını ve sternal kenarları sistematik kontrol et.', 'Systematically check every anastomosis, graft bed and sternal edge.'),
          detail: L('5 dakika · dikkat ister', '5 minutes · demands focus'),
          tags: ['care'],
          cond: { stat: 'fatigue', max: 72 },
          lockedReason: L('Ellerin titriyor; yorgunluk dikkatini dağıtıyor. (Yorgunluk > 72)', 'Your hands tremble; fatigue scatters your focus. (Fatigue > 72)'),
          effects: { minutes: 5, flags: { thoroughCheck: true }, stats: { reputation: 2 }, history: hist('clinical', 'Kapatmadan önce sistematik kontrol yaptın.', 'You did a systematic check before closing.') },
          next: 'vf',
        },
        { id: 'close', text: L('Kuru görünüyor. Kapatmaya geçelim.', 'It looks dry. Let\'s move to closure.'), tags: ['time'], effects: { flags: { thoroughCheck: false } }, next: 'vf' },
      ],
    },
    vf: {
      id: 'vf',
      onEnter: { stats: { stress: 10 } },
      lines: [
        { speaker: 'murat', text: L('VF! Kemal, VF!', 'VF! Kemal, VF!'), expr: 'alarmed', sfx: 'alarm', selfExpr: 'alarmed', shot: 'orMonitor' },
      ],
      card: { title: L('Beklenmedik olay: ventriküler fibrilasyon', 'Unexpected event: ventricular fibrillation') },
      timer: 12,
      timeoutChoice: 'adrenaline',
      choices: [
        {
          id: 'defib',
          text: L('İç kaşıklar, 10 joule. Üç şok, sonra iç masaj.', 'Internal paddles, 10 joules. Three shocks, then internal massage.'),
          tags: ['care'],
          effects: { goodPractice: 'stsArrest', rel: { murat: 4 }, stats: { reputation: 2 }, history: hist('clinical', 'Ameliyathanede VF\'yi iç defibrilasyonla hemen sonlandırdın.', 'You promptly terminated intraoperative VF with internal defibrillation.') },
          next: 'vfOk',
        },
        {
          id: 'pump',
          text: L('Pompaya giriyoruz!', 'We go on bypass!'),
          tags: ['risk'],
          effects: { patient: P('minorInsult') },
          next: 'vfPump',
        },
        {
          id: 'adrenaline',
          text: L('Adrenalin 1 mg ver!', 'Give 1 mg of adrenaline!'),
          tags: ['risk'],
          effects: { patient: P('minorInsult'), rel: { murat: -3 } },
          next: 'vfAdren',
        },
      ],
    },
    vfOk: {
      id: 'vfOk',
      lines: [
        { speaker: null, text: L('İkinci şokta sinüs ritmi. Monitörde düzenli QRS\'ler.', 'Sinus rhythm after the second shock. Regular QRS complexes on the monitor.'), selfExpr: 'relieved' },
        { speaker: 'murat', text: L('Döndü. OAB {map}.', 'He is back. MAP {map}.'), expr: 'relieved' },
      ],
      next: 'closePlan',
    },
    vfPump: {
      id: 'vfPump',
      redirect: [{ cond: flag('pumpPrimed', true), to: 'vfPumpReady' }],
      onEnter: { minutes: 9, patient: P('majorInsult') },
      lines: [
        { speaker: 'serkan', text: L('Pompa prime değil! Dokuz dakika lazım!', 'The pump is not primed! I need nine minutes!'), expr: 'alarmed' },
        { speaker: null, text: L('Dokuz dakika iç masaj. Sonunda şokla ritim döndü, ama bedeli ağır.', 'Nine minutes of internal massage. Rhythm returns with a shock at last, but at a cost.'), selfExpr: 'sad' },
      ],
      next: 'closePlan',
    },
    vfPumpReady: {
      id: 'vfPumpReady',
      onEnter: { minutes: 4, rel: { serkan: 5 } },
      lines: [
        { speaker: 'serkan', text: L('Pompa hazır, akım tam!', 'Pump ready, full flow!'), expr: 'focused' },
        { speaker: null, text: L('Kısa bir pompa desteği ve şokla ritim döndü. Hazırlık kendini ödedi.', 'Brief bypass support and a shock restore rhythm. The preparation paid for itself.') },
      ],
      next: 'closePlan',
    },
    vfAdren: {
      id: 'vfAdren',
      onEnter: { minutes: 3 },
      lines: [
        { speaker: 'murat', text: L('Kemal, önce şok! Kaşıklar burada!', 'Kemal, shock first! The paddles are right here!'), expr: 'angry' },
        { speaker: null, text: L('İç şokla ritim döndü; ardından adrenalinin etkisiyle tansiyon 190\'a fırladı ve dikiş hatları zorlandı.', 'An internal shock restores rhythm; then the adrenaline sends pressure to 190 and strains the suture lines.') },
      ],
      next: 'closePlan',
    },
    closePlan: {
      id: 'closePlan',
      lines: [{ speaker: 'ece', text: L('Hocam, kapatmayı ben yapabilir miyim?', 'Doctor, may I close?'), expr: 'focused' }],
      choices: [
        {
          id: 'teach',
          text: L('Sen kapat, ben başındayım.', 'You close; I will stay at your side.'),
          tags: ['team'],
          effects: { minutes: 15, rel: { ece: 8 }, stats: { teamTrust: 3, fatigue: 3 }, memory: [{ char: 'ece', key: 'letClose' }] },
          next: 'note',
        },
        {
          id: 'self',
          text: L('Ben kapatırım.', 'I will close.'),
          tags: ['care'],
          effects: { minutes: 12, stats: { fatigue: 4 } },
          next: 'note',
        },
        {
          id: 'leave',
          text: L('Sen kapat; ben aileye çıkıyorum.', 'You close; I am going to the family.'),
          tags: ['family', 'risk'],
          effects: { rel: { ece: 4, hulya: -2 }, flags: { leftBeforeClose: true } },
          next: 'note',
        },
      ],
    },
    note: {
      id: 'note',
      lines: [{ speaker: null, text: L('Ameliyat notu. Zaman çizelgesi: çağrı, talimatlar, karar, bulgu, olay.', 'Operative note. Timeline: the call, the orders, the decision, the finding, the event.') }],
      card: { title: L('Kayıt', 'Documentation') },
      choices: [
        {
          id: 'now',
          text: L('Şimdi yaz: zaman damgalı, bulgular ve VF dahil.', 'Write it now: time-stamped, findings and the VF included.'),
          detail: L('10 dakika · yorgunluk ↑', '10 minutes · fatigue ↑'),
          tags: ['record'],
          effects: { minutes: 10, flags: { opNoteWritten: true }, goodPractice: 'opNote', stats: { documentation: 14, fatigue: 3 }, history: hist('record', 'Ameliyat notunu zaman çizelgesiyle hemen yazdın.', 'You wrote the operative note with a full timeline straight away.') },
          next: 'handoff',
        },
        {
          id: 'later',
          text: L('Sonra yazarım.', 'I will write it later.'),
          tags: ['time'],
          effects: { flags: { opNotePending: true } },
          next: 'handoff',
        },
      ],
    },
    handoff: {
      id: 'handoff',
      lines: [{ speaker: 'zeynep', text: L('Hocam, yoğun bakıma devrediyoruz. Plan?', 'Doctor, we are handing over to the ICU. The plan?') }],
      choices: [
        {
          id: 'sbar',
          text: L('Yapılandırılmış devir: ne bulduk, ne yaptık, hedefler, ne zaman ararsınız.', 'Structured handover: what we found, what we did, targets, when to call me.'),
          tags: ['team', 'record'],
          effects: { minutes: 3, goodPractice: 'handoff', stats: { teamTrust: 5, documentation: 5 }, rel: { zeynep: 6 }, history: hist('team', 'Yoğun bakıma yapılandırılmış devir verdin.', 'You gave the ICU a structured handover.') },
          action: 'scene:family',
          next: null,
        },
        {
          id: 'brief',
          text: L('Bildiğiniz gibi. Bir şey olursa arayın.', 'The usual. Call me if anything happens.'),
          tags: ['time'],
          effects: { stats: { teamTrust: -1 } },
          action: 'scene:family',
          next: null,
        },
        {
          id: 'none',
          text: L('(Konuşmadan çık; aile bekliyor.)', '(Leave without a word; the family is waiting.)'),
          tags: ['family', 'risk'],
          effects: { deviation: 'noHandoff', stats: { teamTrust: -6 }, rel: { zeynep: -6, ece: -3 } },
          action: 'scene:family',
          next: null,
        },
      ],
    },
  },
};

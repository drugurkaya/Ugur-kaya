import type { Dialogue } from '../types';
import { L, P, flag, hist, isTruth, mapAtLeast, mapBelow, notFlag } from './helpers';

/** Simplified commute, played inside the moving car. */
export const commute: Dialogue = {
  id: 'commute',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { objective: 'reachHospital' },
      lines: [
        {
          speaker: null,
          text: L('Bursa henüz uyanmadı. Uludağ\'ın silueti morarıyor, sokak lambaları ıslak asfaltta titriyor.', 'Bursa is not awake yet. Uludağ\'s silhouette turns violet; streetlights tremble on the wet asphalt.'),
          shot: 'carWide',
        },
      ],
      choices: [
        {
          id: 'fast',
          text: L('Gaza bas. Her dakika önemli.', 'Step on it. Every minute counts.'),
          detail: L('~13 dk · stres ↑ · risk', '~13 min · stress ↑ · risk'),
          tags: ['time', 'risk'],
          effects: { flags: { droveFast: true }, stats: { stress: 6 } },
          next: 'fast',
        },
        {
          id: 'normal',
          text: L('Hızlı ama güvenli sür.', 'Drive fast but safely.'),
          detail: L('~18 dk', '~18 min'),
          tags: ['time'],
          effects: { minutes: 9 },
          next: 'mid',
        },
      ],
    },
    fast: {
      id: 'fast',
      onEnter: { minutes: 6 },
      lines: [
        { speaker: null, text: L('Mudanya yolu bomboş. Sarı ışık… kırmızı. Sağdan bir ekmek kamyoneti çıkıyor!', 'The Mudanya road is empty. Amber… red. A bread van pulls out from the right!'), shot: 'carClose', sfx: 'horn', selfExpr: 'alarmed' },
      ],
      card: { title: L('Kavşak!', 'Junction!') },
      timer: 5,
      timeoutChoice: 'brake',
      choices: [
        { id: 'brake', text: L('Frene asıl!', 'Slam the brakes!'), tags: ['risk'], effects: { stats: { stress: 8 }, minutes: 1, flags: { nearMiss: true } }, next: 'mid' },
        { id: 'swerve', text: L('Direksiyonu kır!', 'Swerve!'), tags: ['risk'], effects: { stats: { stress: 12, finance: -6 }, flags: { nearMiss: true, scratchedCar: true }, history: hist('self', 'Kavşakta kıl payı bir kazadan döndün; tampon çizildi.', 'A near-crash at a junction; the bumper got scraped.') }, next: 'mid' },
      ],
    },
    mid: {
      id: 'mid',
      lines: [{ speaker: null, text: L('Hastaneye birkaç kilometre var. Telefon araç ekranında.', 'A few kilometres to go. The phone is on the car display.') }],
      choices: [
        {
          id: 'icu',
          text: L('Hands-free: yoğun bakımı ara.', 'Hands-free: call the ICU.'),
          tags: ['care'],
          showIf: notFlag('carCalledIcu'),
          effects: { flags: { carCalledIcu: true } },
          next: 'icu',
        },
        {
          id: 'ayla',
          text: L('Ayla\'yı ara.', 'Call Ayla.'),
          tags: ['family'],
          showIf: notFlag('carCalledAyla'),
          effects: { flags: { carCalledAyla: true }, rel: { ayla: 4 }, stats: { family: 2, stress: -2 } },
          next: 'ayla',
        },
        { id: 'drive', text: L('Sadece sür.', 'Just drive.'), effects: { minutes: 7 }, next: 'arrive' },
      ],
    },
    icu: {
      id: 'icu',
      onEnter: { minutes: 2 },
      lines: [{ speaker: 'zeynep', text: L('Hocam, OAB {map}, nabız {hr}, CVP {cvp}, dren {drain} ml/sa.', 'Doctor, MAP {map}, HR {hr}, CVP {cvp}, drain {drain} ml/h.') }],
      choices: [
        {
          id: 'or',
          text: L('Ameliyathaneyi hazırlayın, 10 dakikaya oradayım.', 'Get the OR ready, I am ten minutes away.'),
          showIf: notFlag('orMobilised'),
          effects: { flags: { orMobilised: true }, patient: P('orTeamMobilised'), rel: { zeynep: 3 } },
          next: 'mid',
        },
        {
          id: 'protocol',
          text: L('Kanama protokolünü başlatın.', 'Start the bleeding protocol.'),
          showIf: notFlag('productsOrdered'),
          effects: { flags: { productsOrdered: true }, patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs') },
          next: 'mid',
        },
        { id: 'ok', text: L('Tamam, geliyorum.', 'Okay, almost there.'), next: 'mid' },
      ],
    },
    ayla: {
      id: 'ayla',
      onEnter: { minutes: 2 },
      lines: [
        { speaker: 'ayla', text: L('Dikkatli sür. …Akşamı unutma.', 'Drive carefully. …Don\'t forget tonight.'), expr: 'smile' },
      ],
      next: 'mid',
    },
    arrive: {
      id: 'arrive',
      lines: [{ speaker: null, text: L('Yeşilvadi Eğitim ve Araştırma Hastanesi. Acil girişinin floresan ışığı.', 'Yeşilvadi Training and Research Hospital. The fluorescent glow of the emergency entrance.'), shot: 'carArrive' }],
      action: 'scene:hospital',
      next: null,
    },
  },
};

export const guard: Dialogue = {
  id: 'guard',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: 'guard', text: L('Hocam hayırdır, bu saatte? Asansör bakımda, yoğun bakıma koridordan buyurun.', 'Morning, Doctor, at this hour? The lift is under maintenance; the ICU is down the corridor.'), expr: 'smile' }],
      choices: [
        { id: 'thanks', text: L('Sağ ol Hikmet Bey.', 'Thank you, Hikmet.'), effects: { rel: { guard: 3 } }, next: null },
        { id: 'nod', text: L('(Başınla selam ver, yürü.)', '(Nod and keep walking.)'), next: null },
      ],
    },
  },
};

export const handHygiene: Dialogue = {
  id: 'handHygiene',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { flags: { handHygiene: true }, goodPractice: 'handHygiene' },
      lines: [{ speaker: null, text: L('El antiseptiği. Otuz saniye, alışkanlık.', 'Hand rub. Thirty seconds, habit.') }],
      next: null,
    },
  },
};

/** Chapter 3: the bedside. The first major decision of the day. */
export const icu: Dialogue = {
  id: 'icu',
  start: 'arrive',
  nodes: {
    arrive: {
      id: 'arrive',
      onEnter: { flags: { arrivedHospital: true }, objective: 'assessPatient' },
      redirect: [{ cond: { patient: 'ahmet', metric: 'map', max: 31 }, to: 'arrest' }],
      lines: [
        { speaker: 'zeynep', cond: { memory: 'zeynep', key: 'dismissed' }, text: L('Geldiniz. (Göz teması kurmuyor.) Ece Hanım baştan beri burada.', 'You came. (She avoids eye contact.) Dr. Ece has been here all along.'), expr: 'angry' },
        { speaker: 'zeynep', cond: { memory: 'zeynep', key: 'ignored' }, text: L('Hocam, size ulaşamadık. Ece Hanım\'la idare ettik.', 'We could not reach you. Dr. Ece and I managed.'), expr: 'angry' },
        { speaker: 'zeynep', cond: { not: { any: [{ memory: 'zeynep', key: 'dismissed' }, { memory: 'zeynep', key: 'ignored' }] } }, text: L('Hocam hoş geldiniz. Her şey hazır, sizi bekliyorduk.', 'Welcome, Doctor. Everything is ready; we were waiting for you.'), expr: 'relieved' },
        { speaker: 'ece', text: L('OAB {map}, nabız {hr}, CVP {cvp}. Dren son saat {drain} ml, toplam {drainTotal}. Laktat {lactate}.', 'MAP {map}, HR {hr}, CVP {cvp}. Drain {drain} ml in the last hour, {drainTotal} total. Lactate {lactate}.'), expr: 'focused', shot: 'monitor' },
        { speaker: 'ece', cond: flag('productsOrdered'), text: L('Ürünlerin çoğu gitti. Son laboratuvar: {labs}.', 'Most of the products are in. Latest labs: {labs}.') },
      ],
      next: 'assess',
    },
    assess: {
      id: 'assess',
      card: {
        title: L('Ahmet Demirtaş · yatak başı', 'Ahmet Demirtaş · bedside'),
        context: L('OAB {map} · Nabız {hr} · CVP {cvp} · Dren {drain} ml/sa · Hb {hb} · Laktat {lactate}', 'MAP {map} · HR {hr} · CVP {cvp} · Drain {drain} ml/h · Hb {hb} · Lactate {lactate}'),
      },
      choices: [
        {
          id: 'echo',
          text: L('Yatak başı ekoyu kendin yap.', 'Do the bedside echo yourself.'),
          detail: L('3 dakika', '3 minutes'),
          tags: ['care', 'time'],
          showIf: notFlag('icuEcho'),
          effects: { minutes: 3, flags: { icuEcho: true }, patient: P('bedsideEcho') },
          next: 'assess',
        },
        {
          id: 'drains',
          text: L('Drenleri kontrol et ve sağ.', 'Check and strip the drains.'),
          detail: L('1 dakika', '1 minute'),
          tags: ['care'],
          showIf: notFlag('icuStrip'),
          effects: { minutes: 1, flags: { icuStrip: true }, patient: P('stripDrains') },
          next: 'assess',
        },
        {
          id: 'labs',
          text: L('Koagülasyon ve kan gazına bak.', 'Review coagulation and blood gas.'),
          detail: L('Gönderilmediyse 8 dakika beklersin.', 'If not yet sent, you wait 8 minutes.'),
          tags: ['care', 'time'],
          showIf: notFlag('icuLabs'),
          effects: { flags: { icuLabs: true } },
          next: 'labs',
        },
        {
          id: 'ask',
          text: L('Ece, sen ne düşünüyorsun?', 'Ece, what do you think?'),
          tags: ['team'],
          showIf: notFlag('icuAskedEce'),
          effects: { minutes: 1, flags: { icuAskedEce: true }, rel: { ece: 4 }, stats: { teamTrust: 2 } },
          next: 'eceView',
        },
        {
          id: 'decide',
          text: L('Karar ver.', 'Make the call.'),
          tags: ['risk'],
          next: 'decision',
        },
      ],
    },
    labs: {
      id: 'labs',
      redirect: [{ cond: notFlag('productsOrdered'), to: 'labsWait' }],
      lines: [{ speaker: 'ece', text: L('{labs}', '{labs}') }],
      next: 'assess',
    },
    labsWait: {
      id: 'labsWait',
      onEnter: { minutes: 8, patient: P('sendLabs') },
      lines: [
        { speaker: null, text: L('Sekiz uzun dakika. Monitörün her bip sesi bir soru.', 'Eight long minutes. Every beep of the monitor is a question.') },
        { speaker: 'ece', text: L('{labs}', '{labs}') },
      ],
      next: 'assess',
    },
    eceView: {
      id: 'eceView',
      lines: [
        { speaker: 'ece', cond: isTruth('tamponade'), text: L('Hocam, dren azaldı ama CVP artıyor ve nabız basıncı daraldı. Tamponattan korkuyorum.', 'Drainage has dropped but CVP is rising and pulse pressure has narrowed. I am worried about tamponade.'), expr: 'worried' },
        { speaker: 'ece', cond: isTruth('surgical'), text: L('Koagülasyon fena değil ama dren hızlanıyor. Bence cerrahi bir kanama var.', 'Coagulation is not bad, but the drainage keeps accelerating. I think it is surgical.'), expr: 'focused' },
        { speaker: 'ece', cond: isTruth('coagulopathy'), text: L('INR ve trombosit kötüydü; ısı da düşük. Ürünlerle toparlayabilir miyiz diye düşünüyorum.', 'INR and platelets were poor, and he is cold. I wonder whether products could turn this around.'), expr: 'focused' },
      ],
      next: 'assess',
    },
    decision: {
      id: 'decision',
      card: {
        title: L('İlk büyük karar', 'The first major decision'),
        context: L('OAB {map} · CVP {cvp} · Dren {drain} ml/sa · Çağrıdan bu yana {sinceCall} dk', 'MAP {map} · CVP {cvp} · Drain {drain} ml/h · {sinceCall} min since the call'),
      },
      choices: [
        {
          id: 'or',
          text: L('Re-eksplorasyon: ameliyathaneye al.', 'Re-exploration: take him back to theatre.'),
          detail: L('Kesin çözüm olabilir; her açılışın kendi riski var.', 'May be definitive; every reopening has its own risks.'),
          tags: ['risk', 'care'],
          effects: { flags: { decidedOR: true }, history: hist('clinical', 'Ahmet Bey\'i re-eksplorasyona almaya karar verdin.', 'You decided to take Ahmet back for re-exploration.') },
          next: 'consent',
        },
        {
          id: 'medical',
          text: L('Medikal tedaviye devam: ürünleri tamamla, 40 dakika sonra yeniden değerlendir.', 'Continue medical management: complete products, reassess in 40 minutes.'),
          detail: L('Gereksiz bir açılışı önleyebilir — ya da kıymetli zamanı tüketebilir.', 'May avoid an unnecessary reopening — or use up precious time.'),
          tags: ['care', 'time'],
          showIf: mapAtLeast(45),
          effects: {
            flags: { triedMedical: true, productsOrdered: true },
            patient: P('givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'transfuseRBC', 'fluidBolus'),
            history: hist('clinical', 'Önce medikal tedaviyle devam etmeye karar verdin.', 'You chose to continue medical management first.'),
          },
          next: 'reassess',
        },
        {
          id: 'bedside',
          text: L('Burada, yoğun bakımda aç. Şimdi.', 'Open him here in the ICU. Now.'),
          detail: L('Arrest ya da arrest öncesi için. Steril koşullar sınırlı.', 'For arrest or peri-arrest. Limited sterile conditions.'),
          tags: ['risk'],
          showIf: mapBelow(45),
          effects: { flags: { bedsideOpen: true, emergencyNoConsent: true }, patient: P('reExplore'), history: hist('clinical', 'Yoğun bakımda acil resternotomi yaptın.', 'You performed an emergency resternotomy in the ICU.') },
          action: 'scene:or',
          next: null,
        },
      ],
    },
    reassess: {
      id: 'reassess',
      onEnter: { minutes: 40 },
      redirect: [{ cond: { all: [{ patient: 'ahmet', metric: 'drainRate', max: 110 }, mapAtLeast(64)] }, to: 'stable' }],
      lines: [
        { speaker: null, text: L('Kırk dakika sonra.', 'Forty minutes later.'), shot: 'monitor' },
        { speaker: 'ece', text: L('Hocam, düzelmedi. OAB {map}, CVP {cvp}, dren {drain} ml/sa.', 'Doctor, he has not improved. MAP {map}, CVP {cvp}, drain {drain} ml/h.'), expr: 'worried' },
      ],
      choices: [
        { id: 'or', text: L('Tamam. Ameliyathaneye.', 'Right. To theatre.'), tags: ['risk'], effects: { flags: { decidedOR: true } }, next: 'consent' },
      ],
    },
    stable: {
      id: 'stable',
      onEnter: { patient: P('correctCoagulopathy'), flags: { avoidedSurgery: true } },
      lines: [
        { speaker: null, text: L('Kırk dakika sonra.', 'Forty minutes later.'), shot: 'monitor' },
        { speaker: 'ece', text: L('Dren {drain} ml/sa\'ya indi, OAB {map}. Laktat geriliyor.', 'Drainage is down to {drain} ml/h, MAP {map}. Lactate is falling.'), expr: 'relieved' },
        { speaker: 'self', text: L('Koagülopatiymiş. İyi ki açmamışız.', 'It was coagulopathy. Good thing we did not open him.'), selfExpr: 'relieved' },
      ],
      choices: [
        {
          id: 'plan',
          text: L('Hedefleri yaz: OAB > 65, dren < 100 ml/sa, 1 saat sonra kontrol koagülasyon. Bir şey olursa beni ara.', 'Write the targets: MAP > 65, drain < 100 ml/h, repeat coags in an hour. Call me for anything.'),
          tags: ['record', 'team'],
          effects: { goodPractice: 'handoff', stats: { documentation: 8, teamTrust: 4, reputation: 2 }, rel: { zeynep: 4, ece: 4 }, history: hist('clinical', 'Koagülopatiyi ameliyatsız düzelttin ve net hedefler bıraktın.', 'You corrected the coagulopathy without surgery and left clear targets.') },
          action: 'scene:family',
          next: null,
        },
        {
          id: 'leave',
          text: L('Tamam, takip edin.', 'Okay, keep an eye on him.'),
          effects: { stats: { teamTrust: -1 } },
          action: 'scene:family',
          next: null,
        },
      ],
    },
    consent: {
      id: 'consent',
      redirect: [{ cond: mapBelow(48), to: 'emergency' }],
      lines: [{ speaker: 'ece', text: L('Hocam, eşi Sevim Hanım\'ın numarası dosyada. Gece aranmadı.', 'His wife Sevim\'s number is in the chart. Nobody called her overnight.') }],
      choices: [
        {
          id: 'call',
          text: L('Sevim Hanım\'ı ara, durumu açıkla, onam al.', 'Call Sevim, explain the situation, obtain consent.'),
          detail: L('4 dakika', '4 minutes'),
          tags: ['family', 'record'],
          effects: {
            minutes: 4,
            flags: { consentObtained: true, familyUpdatedEarly: true },
            rel: { sevim: 12, burak: 6 },
            stats: { documentation: 4 },
            goodPractice: 'consent',
            memory: [{ char: 'sevim', key: 'calledEarly' }],
            history: hist('family', 'Ameliyattan önce Sevim Hanım\'ı arayıp bilgilendirdin ve onam aldın.', 'You called Sevim before surgery, explained, and obtained consent.'),
          },
          next: 'toOR',
        },
        {
          id: 'skip',
          text: L('Önce ameliyat. Aileye sonra haber veririz.', 'Surgery first. We tell the family afterwards.'),
          tags: ['time', 'risk'],
          effects: { deviation: 'noConsent', rel: { sevim: -8 }, memory: [{ char: 'sevim', key: 'notInformed' }] },
          next: 'toOR',
        },
      ],
    },
    emergency: {
      id: 'emergency',
      onEnter: { flags: { emergencyNoConsent: true } },
      lines: [
        { speaker: 'self', text: L('Bekleyecek vaktimiz yok. Ece, ameliyathaneye girerken aileyi sen ara ve bilgi ver.', 'We have no time to wait. Ece, call the family as we go and inform them.'), selfExpr: 'focused' },
      ],
      next: 'toOR',
    },
    toOR: {
      id: 'toOR',
      lines: [{ speaker: 'zeynep', text: L('Transport monitörü bağlandı. Gidiyoruz.', 'Transport monitor connected. Let\'s go.') }],
      action: 'scene:or',
      next: null,
    },
    arrest: {
      id: 'arrest',
      onEnter: { stats: { stress: 15 } },
      lines: [
        { speaker: 'zeynep', text: L('HOCAM! Nabız yok! Kardiyak masaja başladık!', 'DOCTOR! No pulse! We have started compressions!'), expr: 'alarmed', sfx: 'alarm', selfExpr: 'alarmed', shot: 'monitor' },
      ],
      card: { title: L('Arrest', 'Cardiac arrest') },
      timer: 10,
      timeoutChoice: 'cpr',
      choices: [
        {
          id: 'open',
          text: L('Resternotomi seti! Burada açıyoruz.', 'Resternotomy set! We open here.'),
          detail: L('Kanama veya tamponata bağlı arrestte dış masaj etkisizdir.', 'External massage is ineffective in arrest from bleeding or tamponade.'),
          tags: ['risk', 'care'],
          effects: { flags: { bedsideOpen: true, emergencyNoConsent: true, decidedOR: true }, patient: P('reExplore'), goodPractice: 'stsArrest', history: hist('clinical', 'Arrestte yoğun bakımda acil resternotomi yaptın.', 'You performed an emergency resternotomy for arrest in the ICU.') },
          action: 'scene:or',
          next: null,
        },
        {
          id: 'cpr',
          text: L('Masaja devam, adrenalin 1 mg.', 'Continue compressions, adrenaline 1 mg.'),
          tags: ['risk'],
          effects: { minutes: 6, patient: P('majorInsult'), flags: { decidedOR: true } },
          next: 'arrest2',
        },
      ],
    },
    arrest2: {
      id: 'arrest2',
      lines: [{ speaker: 'murat', text: L('Kemal, dönmüyor! Açmamız lazım!', 'Kemal, he is not coming back! We have to open!'), expr: 'alarmed' }],
      choices: [
        {
          id: 'open',
          text: L('Açıyoruz.', 'We open.'),
          effects: { flags: { bedsideOpen: true, emergencyNoConsent: true }, patient: P('reExplore'), history: hist('clinical', 'Gecikmeli olarak yoğun bakımda acil resternotomi yaptın.', 'You performed a delayed emergency resternotomy in the ICU.') },
          action: 'scene:or',
          next: null,
        },
      ],
    },
  },
};

/** A short call home (available away from the house). */
export const phoneAyla: Dialogue = {
  id: 'phoneAyla',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 2 },
      lines: [
        { speaker: 'ayla', cond: flag('missedConcert'), text: L('…Efendim Kemal.', '…Yes, Kemal.'), expr: 'sad' },
        { speaker: 'ayla', cond: notFlag('missedConcert'), text: L('Kemal? Nasıl gidiyor? Hastan nasıl?', 'Kemal? How is it going? How is your patient?'), expr: 'worried' },
      ],
      choices: [
        { id: 'warm', text: L('Zor bir sabahtı. Sesini duymak iyi geldi.', 'It was a hard morning. It is good to hear your voice.'), tags: ['family'], effects: { stats: { family: 3, stress: -4 }, rel: { ayla: 4 } }, next: null },
        { id: 'brief', text: L('İyiyim, sonra ararım.', 'I am fine, I will call later.'), tags: ['time'], next: null },
      ],
    },
  },
};

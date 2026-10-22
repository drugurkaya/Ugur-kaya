import type { Dialogue } from '../types';
import { L, P, flag, hist, notFlag } from './helpers';

/** Chapter 1–2: the 05:12 call and the first decision. */
export const call: Dialogue = {
  id: 'call',
  start: 'open',
  nodes: {
    open: {
      id: 'open',
      onEnter: { flags: { callAnswered: true }, objective: 'decideCall' },
      lines: [
        { speaker: 'self', cond: notFlag('callingBack'), text: L('…Alo? Kemal Arslan.', '…Hello? Kemal Arslan.'), expr: 'drowsy', shot: 'faceClose' },
        { speaker: 'self', cond: flag('callingBack'), text: L('Zeynep, Kemal Arslan. Aramışsınız.', 'Zeynep, it is Kemal Arslan. You called.'), expr: 'worried' },
        {
          speaker: 'zeynep',
          cond: flag('missedCall'),
          text: L('Hocam, kusura bakmayın, size iki kez ulaşmaya çalıştım.', "Sorry, Doctor, I've tried you twice already."),
        },
        {
          speaker: 'zeynep',
          text: L(
            'Günaydın hocam, rahatsız ettim. Yoğun bakımdan Zeynep. Dün öğleden sonra üçlü bypass yaptığınız Ahmet Demirtaş, 67 yaşında.',
            "Good morning, Doctor, sorry to wake you. It's Zeynep from the ICU. Ahmet Demirtaş, 67, your triple bypass from yesterday afternoon.",
          ),
          selfExpr: 'worried',
        },
        {
          speaker: 'zeynep',
          text: L(
            'Son bir saatte tansiyonu düştü; ortalama arter basıncı şu an {map}, nabız {hr}. Dren son saatte {drain} ml geldi, giderek artıyor. Toplam {drainTotal} ml.',
            'His pressure has been falling for the last hour; mean arterial pressure is {map} now, heart rate {hr}. The drain gave {drain} ml in the last hour and it keeps rising. {drainTotal} ml in total.',
          ),
          selfExpr: 'alarmed',
          shot: 'faceTense',
          sfx: 'tension',
        },
      ],
      next: 'decide',
    },
    decide: {
      id: 'decide',
      card: {
        title: L('İlk karar', 'The first decision'),
        context: L(
          'OAB {map} · Nabız {hr} · Dren {drain} ml/sa. Cerrahi kanama mı, koagülopati mi, başka bir şey mi? Henüz bilmiyorsun.',
          'MAP {map} · HR {hr} · Drain {drain} ml/h. Surgical bleeding, coagulopathy, something else? You do not know yet.',
        ),
      },
      timer: 45,
      timeoutChoice: 'resident',
      choices: [
        {
          id: 'ask',
          text: L('Önce sor: trend, CVP, Hb, ısı, drenler açık mı?', 'Ask first: trend, CVP, Hb, temperature, are the drains patent?'),
          detail: L('1 dakika. Daha iyi bilgi, biraz zaman.', '1 minute. Better information, a little time.'),
          tags: ['time', 'care'],
          showIf: notFlag('askedDetails'),
          effects: { minutes: 1, flags: { askedDetails: true }, rel: { zeynep: 3 } },
          next: 'details',
        },
        {
          id: 'mobilise',
          text: L('Ekibi topla: ameliyathane hazırlansın, anestezi ve perfüzyon aransın. Geliyorum.', 'Assemble the team: prepare the OR, call anaesthesia and perfusion. I am coming in.'),
          detail: L('Kan gazı, koagülasyon, 2 ünite eritrosit. Belki gereksiz bir alarm; belki bir hayat.', 'Gas, coagulation panel, 2 units of red cells. Maybe a false alarm; maybe a life.'),
          tags: ['risk', 'team'],
          effects: {
            patient: P('orTeamMobilised', 'transfuseRBC', 'sendLabs', 'fluidBolus'),
            flags: { orMobilised: true, ordersGiven: 'mobilise' },
            stats: { stress: 8, teamTrust: 3 },
            rel: { zeynep: 6, murat: -2 },
            memory: [{ char: 'murat', key: 'wokenAt5' }],
            goodPractice: 'clearPlan',
            history: hist('clinical', 'Ameliyathane ekibini gece harekete geçirdin.', 'You mobilised the OR team in the night.'),
          },
          next: 'readback',
        },
        {
          id: 'products',
          text: L('Kanama protokolünü başlat; Ece yatak başı eko yapsın. 20 dakika sonra arayın.', 'Start the bleeding protocol; Ece does a bedside echo. Call me back in 20 minutes.'),
          detail: L('Sıvı, eritrosit, TDP, trombosit, protamin, traneksamik asit, ısıtma, laboratuvar. Ameliyathane henüz yok.', 'Fluids, red cells, plasma, platelets, protamine, tranexamic acid, warming, labs. No OR yet.'),
          tags: ['care', 'time'],
          effects: {
            patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs', 'bedsideEcho'),
            flags: { productsOrdered: true, ordersGiven: 'products' },
            stats: { stress: 5 },
            rel: { zeynep: 4, ece: 3 },
            goodPractice: 'clearPlan',
            history: hist('clinical', 'Telefonla kanama protokolünü ve yatak başı ekoyu başlattın.', 'You started the bleeding protocol and a bedside echo by phone.'),
            schedule: [
              {
                id: 'icuCallback20',
                inMinutes: 20,
                cond: notFlag('arrivedHospital'),
                effects: { message: { id: 'icuCb', from: 'zeynep', text: L('Hocam, ürünler gidiyor. OAB {map}, dren {drain} ml/sa. Eko sonucu için arayabilirsiniz.', 'Products running. MAP {map}, drain {drain} ml/h. Call for the echo result.') } },
                source: 'call',
              },
            ],
          },
          next: 'readback',
        },
        {
          id: 'both',
          text: L('İkisi birden: protokolü başlat ve ameliyathaneyi hazır beklet.', 'Both: start the protocol and keep the OR on standby.'),
          detail: L('En kapsamlı yol. Herkes uyanır; gerekmezse bunu hatırlarlar.', 'The most thorough path. Everyone gets woken; if it was not needed, they will remember.'),
          tags: ['care', 'team', 'risk'],
          cond: { stat: 'fatigue', max: 85 },
          lockedReason: L('Çok yorgunsun; aynı anda iki planı kuramıyorsun.', 'Too exhausted to hold two plans at once.'),
          effects: {
            patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs', 'orTeamMobilised'),
            flags: { productsOrdered: true, orMobilised: true, ordersGiven: 'both' },
            stats: { stress: 9, teamTrust: 2 },
            rel: { zeynep: 6, murat: -3, serkan: -1 },
            memory: [{ char: 'murat', key: 'wokenAt5' }],
            goodPractice: 'clearPlan',
            history: hist('clinical', 'Hem kanama protokolünü başlattın hem ameliyathaneyi beklemeye aldın.', 'You started the bleeding protocol and put the OR on standby.'),
          },
          next: 'readback',
        },
        {
          id: 'resident',
          text: L('Ece\'yi uyandırın; hastayı görsün, beni arasın.', 'Wake Ece; have her see him and call me.'),
          detail: L('Asistanına güven gösterirsin. Ama her telefon zaman demek.', 'You show trust in your resident. But every call costs time.'),
          tags: ['team', 'time'],
          effects: {
            flags: { ordersGiven: 'resident' },
            rel: { ece: 5, zeynep: -2 },
            stats: { stress: 3 },
            history: hist('team', 'Değerlendirmeyi asistanın Ece\'ye bıraktın.', 'You delegated the assessment to your resident, Ece.'),
            schedule: [
              {
                id: 'eceCallsBack',
                inMinutes: 14,
                cond: notFlag('arrivedHospital'),
                effects: { flags: { eceWantsCall: true }, message: { id: 'eceCb', from: 'ece', text: L('Hocam hastayı gördüm, OAB {map}, dren {drain}. Lütfen arayın, karar vermemiz lazım.', 'Saw him. MAP {map}, drain {drain}. Please call, we need a decision.') } },
                source: 'call',
              },
            ],
          },
          next: 'readback',
        },
        {
          id: 'dismiss',
          text: L('Sıvı verin, takip edin. Sabah vizitte bakarım.', 'Give fluids and watch him. I will see him on the morning round.'),
          detail: L('Belki gerçekten geçer. Belki de geçmez.', 'Maybe it really will settle. Maybe it will not.'),
          tags: ['risk', 'self'],
          effects: {
            patient: P('fluidBolus'),
            flags: { ordersGiven: 'dismiss' },
            deviation: 'dismissedNurse',
            rel: { zeynep: -15 },
            memory: [{ char: 'zeynep', key: 'dismissed' }],
            stats: { stress: -3, teamTrust: -4 },
            history: hist('clinical', 'Hemşirenin endişesini sabaha bıraktın.', "You left the nurse's concern until morning."),
            schedule: [
              {
                id: 'zeynepEscalates',
                inMinutes: 22,
                cond: notFlag('arrivedHospital'),
                effects: {
                  flags: { eceWantsCall: true },
                  message: {
                    id: 'escalation',
                    from: 'ece',
                    text: L('Hocam, Zeynep Hanım beni çağırdı. OAB {map}. Bence bekleyemeyiz, lütfen arayın.', 'Zeynep called me in. MAP {map}. I do not think we can wait. Please call.'),
                  },
                },
                source: 'call',
              },
            ],
          },
          next: 'close',
        },
      ],
    },
    details: {
      id: 'details',
      lines: [
        {
          speaker: 'zeynep',
          text: L(
            'Son üç saat dren: 150, 180, şimdi {drain}. CVP {cvp}. Son Hb {hb}. Isısı {temp} derece. Drenler açık görünüyor, pıhtı görmedim.',
            'Drain over the last three hours: 150, 180, now {drain}. CVP {cvp}. Last Hb {hb}. Temperature {temp}. The drains look patent, no clots seen.',
          ),
          selfExpr: 'focused',
        },
        { speaker: 'zeynep', text: L('Akşam ACT normale dönmüştü. Koagülasyon paneli gece gönderilmedi.', 'ACT was back to normal last evening. No coagulation panel was sent overnight.') },
      ],
      next: 'decide',
    },
    readback: {
      id: 'readback',
      lines: [{ speaker: 'zeynep', text: L('Anladım hocam, tekrar ediyorum…', 'Understood, Doctor. Reading it back…') }],
      choices: [
        {
          id: 'confirm',
          text: L('Dinliyorum. Doğru — saati de dosyaya yaz.', 'I am listening. Correct — write the time in the chart too.'),
          tags: ['record', 'team'],
          effects: { minutes: 1, goodPractice: 'readBack', stats: { documentation: 6 }, rel: { zeynep: 4 }, history: hist('team', 'Telefon talimatlarını geri okuttun ve kaydettirdin.', 'You had the phone orders read back and recorded.') },
          next: 'close',
        },
        {
          id: 'rush',
          text: L('Tamam, tamam. Yaz işte, yoldayım.', 'Fine, fine. Just write it down, I am on my way.'),
          tags: ['time'],
          effects: { deviation: 'noReadBack', rel: { zeynep: -3 }, stats: { documentation: -4 } },
          next: 'close',
        },
      ],
    },
    close: {
      id: 'close',
      lines: [
        { speaker: 'zeynep', cond: flag('ordersGiven', 'dismiss'), text: L('…Peki hocam. Takip ediyorum.', '…All right, Doctor. I will keep watching.'), expr: 'worried' },
        { speaker: 'zeynep', cond: { not: flag('ordersGiven', 'dismiss') }, text: L('Tamamdır hocam. Sizi bekliyoruz.', 'Got it, Doctor. We will be waiting for you.') },
        { speaker: null, text: L('Telefon kapanır. Odanın sessizliği birden ağırlaşır.', 'The line goes quiet. The silence of the bedroom suddenly feels heavy.'), selfExpr: 'worried', shot: 'bedWide' },
      ],
      onEnter: { minutes: 1, objective: 'getUp' },
      action: 'callEnded',
      next: null,
    },
  },
};

/** The player let the phone ring out twice. */
export const missed: Dialogue = {
  id: 'missed',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: {
        flags: { missedTwice: true },
        stats: { stress: 4 },
        message: { id: 'missedSms', from: 'zeynep', text: L('Hocam, Ahmet Demirtaş: OAB {map}, dren {drain} ml/sa. Ece Hanım\'ı çağırdım. Lütfen geri arayın.', 'Ahmet Demirtaş: MAP {map}, drain {drain} ml/h. I have called Dr. Ece. Please call back.') },
        history: hist('clinical', 'Yoğun bakımın iki aramasını kaçırdın. Hemşire asistanı çağırdı.', 'You missed two ICU calls. The nurse called the resident.'),
        objective: 'callBack',
      },
      lines: [{ speaker: null, text: L('Ekranda iki cevapsız arama ve bir mesaj.', 'Two missed calls and a message on the screen.'), selfExpr: 'worried' }],
      next: null,
    },
  },
};

/** The player declined the call. */
export const declined: Dialogue = {
  id: 'declined',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: {
        flags: { declinedCall: true },
        rel: { zeynep: -6 },
        message: { id: 'declinedSms', from: 'zeynep', text: L('Hocam, Ahmet Demirtaş\'ın tansiyonu düşüyor, OAB {map}, dren {drain} ml/sa. Lütfen arayın.', "Ahmet Demirtaş's pressure is falling, MAP {map}, drain {drain} ml/h. Please call."), },
        history: hist('clinical', 'Yoğun bakım çağrısını reddettin.', 'You declined the ICU call.'),
        objective: 'callBack',
        schedule: [
          {
            id: 'declinedNoCover',
            inMinutes: 25,
            cond: { all: [notFlag('calledBack'), notFlag('arrivedHospital')] },
            effects: { deviation: 'declinedCallNoCover', memory: [{ char: 'zeynep', key: 'ignored' }], rel: { zeynep: -10 } },
            source: 'declined',
          },
        ],
      },
      lines: [{ speaker: null, text: L('Telefon sustu. Birkaç saniye sonra ekranda bir mesaj belirdi.', 'The phone stops. A few seconds later a message lights up the screen.'), selfExpr: 'tired' }],
      next: null,
    },
  },
};

/** Calling the ICU back / asking for an update (available from the phone at any time). */
export const phoneIcu: Dialogue = {
  id: 'phoneIcu',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 1, flags: { calledBack: true } },
      lines: [
        { speaker: 'zeynep', cond: { memory: 'zeynep', key: 'dismissed' }, text: L('Yoğun bakım, Zeynep. (Sesi mesafeli.)', 'ICU, Zeynep speaking. (Her voice is cool.)'), expr: 'neutral' },
        { speaker: 'zeynep', text: L('Hocam, şu an OAB {map}, nabız {hr}, CVP {cvp}. Dren son saat {drain} ml.', 'Doctor, MAP is {map}, heart rate {hr}, CVP {cvp}. Drain {drain} ml in the last hour.') },
        { speaker: 'zeynep', cond: flag('productsOrdered'), text: L('Ürünler takılı. Laboratuvar: {labs}.', 'Products are running. Labs: {labs}.') },
      ],
      choices: [
        {
          id: 'echo',
          text: L('Ece yatak başı eko yapsın, sonucu söyleyin.', 'Have Ece do a bedside echo and tell me.'),
          showIf: { not: { flag: 'echoAsked' } },
          effects: { minutes: 4, flags: { echoAsked: true }, patient: P('bedsideEcho') },
          next: 'a2',
        },
        {
          id: 'strip',
          text: L('Drenleri sağın, pıhtı var mı bakın.', 'Strip the drains, check for clots.'),
          showIf: { not: { flag: 'stripAsked' } },
          effects: { minutes: 2, flags: { stripAsked: true }, patient: P('stripDrains') },
          next: 'a2',
        },
        {
          id: 'protocol',
          text: L('Kanama protokolünü başlatın: ürünler, protamin, TXA, ısıtma.', 'Start the bleeding protocol: products, protamine, TXA, warming.'),
          showIf: { not: { flag: 'productsOrdered' } },
          effects: {
            flags: { productsOrdered: true },
            patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs'),
            goodPractice: 'clearPlan',
            history: hist('clinical', 'Telefonla kanama protokolünü başlattın.', 'You started the bleeding protocol by phone.'),
          },
          next: 'a2',
        },
        {
          id: 'or',
          text: L('Ameliyathaneyi hazırlayın, Murat Bey\'i ve perfüzyonu arayın.', 'Prepare the OR, call Dr. Murat and perfusion.'),
          showIf: { not: { flag: 'orMobilised' } },
          effects: {
            flags: { orMobilised: true },
            patient: P('orTeamMobilised'),
            rel: { murat: -2, zeynep: 3 },
            memory: [{ char: 'murat', key: 'wokenAt5' }],
            history: hist('clinical', 'Ameliyathane ekibini harekete geçirdin.', 'You mobilised the OR team.'),
          },
          next: 'a2',
        },
        { id: 'bye', text: L('Tamam, geliyorum.', 'Okay, I am coming.'), next: null },
      ],
    },
    a2: {
      id: 'a2',
      lines: [{ speaker: 'zeynep', text: L('Tamam hocam. Başka bir şey?', 'Okay, Doctor. Anything else?') }],
      choices: [
        { id: 'more', text: L('Bir şey daha…', 'One more thing…'), next: 'a' },
        { id: 'bye', text: L('Hepsi bu. Geliyorum.', 'That is all. I am coming.'), next: null },
      ],
    },
  },
};

/** Calling the resident back after she messaged. */
export const phoneEce: Dialogue = {
  id: 'phoneEce',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 1, flags: { calledBack: true, eceWantsCall: false } },
      lines: [
        { speaker: 'ece', cond: { memory: 'ece', key: 'snapped' }, text: L('…Efendim hocam.', '…Yes, Doctor.'), expr: 'worried' },
        { speaker: 'ece', text: L('Hocam, hasta soluk, periferi soğuk. OAB {map}, nabız {hr}, CVP {cvp}. Dren {drain} ml/sa.', 'He is pale and cold peripherally. MAP {map}, HR {hr}, CVP {cvp}. Drain {drain} ml/h.') },
        { speaker: 'ece', cond: { truth: 'ahmet', is: 'tamponade' }, text: L('Garip olan şu: son yarım saatte dren azaldı ama CVP yükseliyor.', 'The odd thing: drainage dropped in the last half hour but CVP is climbing.') },
      ],
      choices: [
        {
          id: 'teach',
          text: L('Ne düşünüyorsun Ece? Ayırıcı tanını söyle.', 'What do you think, Ece? Give me your differential.'),
          tags: ['team'],
          effects: { minutes: 2, rel: { ece: 6 }, memory: [{ char: 'ece', key: 'taught' }], stats: { teamTrust: 2 } },
          next: 'ddx',
        },
        {
          id: 'orders',
          text: L('Protokolü başlat, eko yap, ameliyathaneyi hazırlat. Geliyorum.', 'Start the protocol, do an echo, get the OR ready. I am on my way.'),
          effects: {
            flags: { productsOrdered: true, orMobilised: true },
            patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs', 'bedsideEcho', 'orTeamMobilised'),
            goodPractice: 'clearPlan',
            history: hist('clinical', 'Ece\'ye net bir plan verdin ve ameliyathaneyi hazırlattın.', 'You gave Ece a clear plan and had the OR prepared.'),
          },
          next: null,
        },
        {
          id: 'snap',
          text: L('Bunu sen halledemiyor musun? Sıvı ver!', 'Can you not handle this yourself? Give fluids!'),
          tags: ['risk'],
          effects: { patient: P('fluidBolus'), rel: { ece: -12 }, memory: [{ char: 'ece', key: 'snapped' }], stats: { teamTrust: -5 }, deviation: 'dismissedNurse' },
          next: null,
        },
      ],
    },
    ddx: {
      id: 'ddx',
      lines: [
        {
          speaker: 'ece',
          text: L(
            'Cerrahi kanama, koagülopati veya tamponat. Koagülasyon paneli ve eko ayırt eder. Dren azalıp CVP artarsa tamponat düşünürüm.',
            'Surgical bleeding, coagulopathy or tamponade. A coag panel and echo will separate them. If drainage falls while CVP rises, I would think tamponade.',
          ),
          expr: 'focused',
        },
      ],
      choices: [
        {
          id: 'orders',
          text: L('Aferin. O zaman: protokol, eko, ameliyathane hazır. Geliyorum.', 'Well reasoned. So: protocol, echo, OR on standby. I am coming.'),
          effects: {
            flags: { productsOrdered: true, orMobilised: true },
            patient: P('fluidBolus', 'transfuseRBC', 'givePlasma', 'givePlatelets', 'giveProtamine', 'giveTranexamic', 'warmPatient', 'sendLabs', 'bedsideEcho', 'orTeamMobilised'),
            rel: { ece: 4 },
            goodPractice: 'clearPlan',
          },
          next: null,
        },
      ],
    },
  },
};

/** Ayla wakes up after the call. */
export const aylaWake: Dialogue = {
  id: 'aylaWake',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: 'ayla', text: L('Hastane mi? …Kötü bir şey mi?', 'The hospital? …Is it bad?'), expr: 'worried', shot: 'ayla' }],
      choices: [
        {
          id: 'honest',
          text: L('Dünkü hastam kanıyor olabilir. Gitmem gerek. Sen uyu.', 'Yesterday\'s patient may be bleeding. I have to go. Go back to sleep.'),
          tags: ['family'],
          effects: { rel: { ayla: 3 }, stats: { family: 1 } },
          next: 'concert',
        },
        {
          id: 'silent',
          text: L('(Cevap vermeden kalk.)', '(Get up without answering.)'),
          tags: ['time'],
          effects: { rel: { ayla: -4 }, stats: { family: -2 }, memory: [{ char: 'ayla', key: 'ignoredMorning' }] },
          next: null,
        },
      ],
    },
    concert: {
      id: 'concert',
      lines: [{ speaker: 'ayla', text: L('Akşam Deniz\'in konseri var, 18:30. Unutma olur mu? Çok heyecanlı.', 'Deniz\'s concert is tonight at 18:30. Please don\'t forget. She is so excited.'), expr: 'sad' }],
      choices: [
        {
          id: 'promise',
          text: L('Söz veriyorum, orada olacağım.', 'I promise. I will be there.'),
          tags: ['family'],
          effects: { flags: { promisedConcert: true }, rel: { ayla: 6 }, stats: { family: 3 }, history: hist('family', 'Ayla\'ya akşamki konser için söz verdin.', 'You promised Ayla you would be at the concert tonight.') },
          next: null,
        },
        {
          id: 'try',
          text: L('Elimden geleni yapacağım. Söz veremem.', 'I will do my best. I cannot promise.'),
          tags: ['family'],
          effects: { flags: { triedConcert: true }, rel: { ayla: 1 } },
          next: null,
        },
      ],
    },
  },
};

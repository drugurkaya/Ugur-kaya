import type { Condition } from '../../state/types';
import type { Dialogue } from '../types';
import { L, flag, hist, notFlag } from './helpers';

const burden = (min?: number, max?: number): Condition => ({ patient: 'ahmet', metric: 'shockBurden', min, max });

/** Chapter 5: the patient's family in the waiting room. */
export const family: Dialogue = {
  id: 'family',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { objective: 'talkFamily' },
      lines: [
        { speaker: 'sevim', cond: { memory: 'sevim', key: 'calledEarly' }, text: L('Hocam! Telefonda anlattığınızdan beri dua ediyoruz. Nasıl?', 'Doctor! We have been praying since your call. How is he?'), expr: 'worried', shot: 'family' },
        { speaker: 'burak', cond: { memory: 'sevim', key: 'notInformed' }, text: L('Babamı gece ameliyata almışsınız ve kimse bize haber vermemiş. Nasıl olur bu?', 'You took my father back to surgery in the night and nobody told us. How is that possible?'), expr: 'angry', shot: 'family' },
        { speaker: 'sevim', cond: { not: { any: [{ memory: 'sevim', key: 'calledEarly' }, { memory: 'sevim', key: 'notInformed' }] } }, text: L('Hocam, sabah aradılar, koşarak geldik. Ne oldu?', 'Doctor, they called this morning and we rushed here. What happened?'), expr: 'worried', shot: 'family' },
      ],
      next: 'explain',
    },
    explain: {
      id: 'explain',
      card: { title: L('Aile görüşmesi', 'The family meeting'), context: L('Ne söyleyeceğin kadar nasıl söyleyeceğin de önemli.', 'How you say it matters as much as what you say.') },
      choices: [
        {
          id: 'honest',
          text: L('Oturalım. Açıkça anlatacağım: ne oldu, ne yaptık, bundan sonra ne bekliyoruz.', 'Let us sit. I will be clear: what happened, what we did, what we expect next.'),
          detail: L('Sade dil, gerçekler, belirsizlikler dahil.', 'Plain language, facts, uncertainties included.'),
          tags: ['family', 'care'],
          effects: { minutes: 8, flags: { honestDisclosure: true }, rel: { sevim: 15, burak: 10 }, stats: { stress: 3, reputation: 2 }, goodPractice: 'disclosure', history: hist('family', 'Aileye komplikasyonu açık ve anlaşılır biçimde anlattın.', 'You explained the complication to the family openly and clearly.') },
          next: 'status',
        },
        {
          id: 'technical',
          text: L('Kısa ve teknik: "Postoperatif hemoraji nedeniyle re-eksplorasyon yapıldı."', 'Short and technical: "Re-exploration was performed for postoperative haemorrhage."'),
          tags: ['time'],
          effects: { minutes: 2, rel: { sevim: -5, burak: -8 } },
          next: 'status',
        },
        {
          id: 'blame',
          text: L('"Gece ekibi bana geç haber verdi."', '"The night team told me too late."'),
          tags: ['risk'],
          showIf: { any: [flag('declinedCall'), flag('missedCall'), flag('ordersGiven', 'dismiss')] },
          effects: { minutes: 2, deviation: 'misleadingFamily', flags: { blamedTeam: true }, rel: { zeynep: -20, ece: -10, sevim: -2, burak: -4 }, stats: { teamTrust: -10 }, memory: [{ char: 'zeynep', key: 'blamed' }], history: hist('team', 'Aileye gecikmenin suçunu gece ekibine attın.', 'You blamed the night team for the delay in front of the family.') },
          next: 'status',
        },
        {
          id: 'minimise',
          text: L('"Önemli bir şey yok, küçük bir rötuş yaptık."', '"Nothing serious, just a small touch-up."'),
          tags: ['risk'],
          effects: { minutes: 1, deviation: 'misleadingFamily', flags: { minimised: true }, rel: { sevim: 4 }, history: hist('family', 'Komplikasyonu aileye olduğundan küçük gösterdin.', 'You played the complication down to the family.') },
          next: 'status',
        },
      ],
    },
    status: {
      id: 'status',
      lines: [
        { speaker: 'self', cond: flag('avoidedSurgery'), text: L('Kanamanın nedeni pıhtılaşma sistemiydi; ilaç ve kan ürünleriyle durdu. Yeniden ameliyat gerekmedi.', 'The bleeding came from his clotting system; medicines and blood products stopped it. No second operation was needed.') },
        { speaker: 'self', cond: { all: [notFlag('avoidedSurgery'), burden(undefined, 70)] }, text: L('Ameliyattan çıktı, durumu şu an stabil. Önümüzdeki 24 saat önemli.', 'He is out of surgery and stable for now. The next 24 hours matter.') },
        { speaker: 'self', cond: { all: [notFlag('avoidedSurgery'), burden(70, 150)] }, text: L('Kanamayı durdurduk ama bir süre düşük tansiyonda kaldı. Böbrekleri ve akciğerleri yakından izliyoruz.', 'We stopped the bleeding, but his pressure was low for a while. We are watching his kidneys and lungs closely.') },
        { speaker: 'self', cond: burden(150), text: L('Durumu kritik. Uzun süre düşük tansiyonda kaldı; organları etkilenmiş olabilir. Elimizden geleni yapıyoruz.', 'His condition is critical. He was in shock for a long time; his organs may be affected. We are doing everything we can.'), selfExpr: 'sad' },
        { speaker: 'sevim', text: L('Allah razı olsun… Görebilir miyiz?', 'God bless you… Can we see him?'), expr: 'sad', cond: { rel: 'sevim', min: 0 } },
        { speaker: 'burak', cond: { rel: 'burak', max: -1 }, text: L('Bütün kayıtların bir kopyasını istiyorum. Bir avukat arkadaşımla konuşacağım.', 'I want a copy of all the records. I am going to talk to a lawyer friend.'), expr: 'angry' },
      ],
      choices: [
        {
          id: 'apology',
          text: L('"Yaşadığınız endişe için çok üzgünüm. Sorularınız için her zaman buradayım."', '"I am truly sorry for what you have been through. I am here for any question."'),
          detail: L('Empati ve sorumluluk; suç itirafı değil.', 'Empathy and responsibility; not an admission of fault.'),
          tags: ['family'],
          effects: { flags: { apologised: true }, rel: { sevim: 6, burak: 6 } },
          next: 'records',
        },
        { id: 'go', text: L('"Yoğun bakıma geçmem gerek."', '"I need to get back to the ICU."'), tags: ['time'], effects: { rel: { sevim: -2 } }, next: 'records' },
      ],
    },
    records: {
      id: 'records',
      redirect: [{ cond: { rel: 'burak', min: 0 }, to: 'end' }],
      lines: [{ speaker: 'burak', text: L('Kayıtları istiyorum.', 'I want the records.'), expr: 'angry' }],
      choices: [
        {
          id: 'transparent',
          text: L('"Hasta hakları birimi bugün size kopyaları versin. Ben de soruları yanıtlarım."', '"The patient-rights office will give you copies today. And I will answer your questions."'),
          tags: ['family', 'record'],
          effects: { flags: { offeredRecords: true }, rel: { burak: 10 }, goodPractice: 'transparency' },
          next: 'end',
        },
        {
          id: 'defensive',
          text: L('"Buna gerek yok, her şey usulüne uygun yapıldı."', '"There is no need for that; everything was done properly."'),
          tags: ['risk'],
          effects: { rel: { burak: -10 }, memory: [{ char: 'burak', key: 'stonewalled' }] },
          next: 'end',
        },
      ],
    },
    end: {
      id: 'end',
      lines: [{ speaker: null, text: L('Bekleme salonundan çıkarken saat {time}. Gün daha yeni başlıyor.', 'Leaving the waiting room it is {time}. The day has only just begun.'), shot: 'corridor' }],
      action: 'scene:evening',
      next: null,
    },
  },
};

/** Chapter 6 (compact): the evening and the night call. */
export const evening: Dialogue = {
  id: 'evening',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { objective: 'evening' },
      lines: [
        { speaker: null, text: L('17:40. Uzun bir günün sonunda yoğun bakım koridoru.', '17:40. The ICU corridor at the end of a long day.'), shot: 'corridor' },
        { speaker: 'murat', cond: { all: [{ memory: 'murat', key: 'wokenAt5' }, flag('avoidedSurgery')] }, text: L('Sabah beşte kaldırdın, ameliyat olmadı. Bir dahaki sefere önce eko, sonra telefon, olur mu?', 'You got me up at five and there was no surgery. Next time echo first, then the phone, deal?'), expr: 'tired' },
        { speaker: 'zeynep', cond: { memory: 'zeynep', key: 'blamed' }, text: L('Aileye bizim geç haber verdiğimizi söylemişsiniz. Kayıtlarda saat 05:12 yazıyor hocam.', 'You told the family we informed you late. The chart says 05:12, Doctor.'), expr: 'angry' },
        { speaker: 'ece', cond: burden(undefined, 70), text: L('Ahmet Bey ekstübe oldu, konuşuyor. Dren 40 ml/sa.', 'Ahmet is extubated and talking. Drain 40 ml/h.'), expr: 'smile' },
        { speaker: 'ece', cond: burden(70, 150), text: L('Ahmet Bey entübe ama stabil. İdrar az; nefroloji konsülte edildi.', 'Ahmet is still intubated but stable. Urine output is low; nephrology has been consulted.'), expr: 'worried' },
        { speaker: 'ece', cond: burden(150), text: L('Ahmet Bey çok ağır. Yüksek doz destek alıyor.', 'Ahmet is very sick. He is on high-dose support.'), expr: 'sad' },
        { speaker: 'ayla', text: L('(Mesaj) Konser 18:30\'da. Deniz kapıya bakıp duruyor.', '(Message) The concert is at 18:30. Deniz keeps looking at the door.') },
      ],
      redirect: [{ cond: flag('opNotePending'), to: 'note' }],
      next: 'concert',
    },
    note: {
      id: 'note',
      lines: [{ speaker: 'ece', text: L('Hocam, sabahki ameliyat notu hâlâ boş. Kalite birimi sordu.', 'Doctor, this morning\'s operative note is still blank. Quality asked about it.') }],
      choices: [
        {
          id: 'write',
          text: L('Şimdi yazıyorum.', 'I am writing it now.'),
          detail: L('15 dakika · hatırladıkların biraz bulanık', '15 minutes · your memory is a little blurred'),
          tags: ['record', 'time'],
          effects: { minutes: 15, flags: { opNoteWritten: true, opNotePending: false }, stats: { documentation: 8, fatigue: 4 }, goodPractice: 'opNote' },
          next: 'concert',
        },
        { id: 'tomorrow', text: L('Yarın yazarım.', 'Tomorrow.'), tags: ['time'], effects: { deviation: 'noOpNote', stats: { documentation: -8 } }, next: 'concert' },
      ],
    },
    concert: {
      id: 'concert',
      card: { title: L('Akşam', 'The evening'), context: L('Hasta yoğun bakımda. Kızın sahnede.', 'Your patient is in the ICU. Your daughter is on stage.') },
      choices: [
        {
          id: 'go',
          text: L('Ece\'ye planı devret ve konsere git.', 'Hand the plan to Ece and go to the concert.'),
          tags: ['family'],
          cond: { any: [{ stat: 'teamTrust', min: 45 }, { rel: 'ece', min: 15 }] },
          lockedReason: L('Ekibe yeterince güvenmiyorsun — ya da onlar sana. (Ekip güveni < 45)', 'You do not trust the team enough — or they you. (Team trust < 45)'),
          effects: { minutes: 50, flags: { attendedConcert: true }, rel: { deniz: 20, ayla: 10, ece: 4 }, stats: { family: 14, stress: -8 }, memory: [{ char: 'deniz', key: 'cameToConcert' }], history: hist('family', 'Deniz\'in konserine gittin.', 'You went to Deniz\'s concert.') },
          next: 'concertScene',
        },
        {
          id: 'late',
          text: L('Bir saat daha kal, sonra son yarıya yetiş.', 'Stay one more hour, then catch the second half.'),
          tags: ['family', 'care'],
          effects: { minutes: 75, flags: { lateConcert: true }, rel: { deniz: 4, ayla: 2 }, stats: { family: 3, teamTrust: 2, fatigue: 4 } },
          next: 'concertScene',
        },
        {
          id: 'stay',
          text: L('Kal. Hastanın başından ayrılamazsın.', 'Stay. You cannot leave the patient.'),
          tags: ['care', 'team'],
          effects: {
            minutes: 120,
            flags: { missedConcert: true },
            rel: { deniz: -18, ayla: -10, zeynep: 3 },
            stats: { family: -14, teamTrust: 3, fatigue: 8 },
            memory: [{ char: 'deniz', key: 'missedConcert' }],
            history: hist('family', 'Konseri kaçırdın.', 'You missed the concert.'),
          },
          next: 'missed',
        },
      ],
    },
    concertScene: {
      id: 'concertScene',
      lines: [
        { speaker: null, cond: flag('attendedConcert'), text: L('Salonun ışıkları kararıyor. Deniz yayını kaldırmadan önce ön sıraya bakıyor — ve seni görüyor.', 'The hall lights dim. Before raising her bow, Deniz glances at the front row — and sees you.') },
        { speaker: null, cond: flag('lateConcert'), text: L('Son eserde arka kapıdan giriyorsun. Deniz seni görmüyor ama Ayla görüyor.', 'You slip in through the back door for the final piece. Deniz does not see you, but Ayla does.') },
        { speaker: 'deniz', cond: flag('attendedConcert'), text: L('Babaa! Geldin!', 'Dad! You came!'), expr: 'smile' },
      ],
      next: 'night',
    },
    missed: {
      id: 'missed',
      lines: [{ speaker: 'deniz', text: L('(Mesaj) Tamam baba. Alıştım zaten.', '(Message) It\'s fine, Dad. I\'m used to it.'), expr: 'sad' }],
      next: 'night',
    },
    night: {
      id: 'night',
      onEnter: { minutes: 60 * 7 },
      lines: [{ speaker: null, text: L('02:10. Telefon yine titriyor. Bu sefer arayan Ece.', '02:10. The phone vibrates again. This time it is Ece.'), shot: 'bedWide', sfx: 'vibrate' }],
      choices: [
        {
          id: 'calm',
          text: L('"Söyle Ece." Sakin dinle, birlikte plan yap.', '"Go ahead, Ece." Listen calmly and plan together.'),
          tags: ['team'],
          effects: { rel: { ece: 6 }, stats: { fatigue: 4, teamTrust: 2 }, memory: [{ char: 'ece', key: 'calmAtNight' }] },
          next: 'nightEnd',
        },
        {
          id: 'curt',
          text: L('"Ece, saat ikide bunu mu soruyorsun?"', '"Ece, you are asking me this at two in the morning?"'),
          tags: ['self'],
          effects: { rel: { ece: -10 }, stats: { fatigue: 2, teamTrust: -3 }, memory: [{ char: 'ece', key: 'snapped' }] },
          next: 'nightEnd',
        },
      ],
    },
    nightEnd: {
      id: 'nightEnd',
      lines: [{ speaker: 'ece', text: L('Potasyum 3,2; replase ediyorum, dren 30 ml. Teşekkürler hocam. İyi geceler.', 'Potassium 3.2; I am replacing it. Drain 30 ml. Thanks, Doctor. Good night.') }],
      action: 'scene:office',
      next: null,
    },
  },
};

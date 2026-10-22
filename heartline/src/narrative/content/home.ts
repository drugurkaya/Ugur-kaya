import type { Dialogue } from '../types';
import { L, hist, notFlag } from './helpers';

/** Getting ready at home: every action costs minutes while the patient's clock keeps running. */

export const getUp: Dialogue = {
  id: 'getUp',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 1, flags: { outOfBed: true }, objective: 'getReady' },
      lines: [{ speaker: null, text: L('Dizlerin ses veriyor. Elli yaş, gece beşte ayağa kalkarken kendini hatırlatıyor.', 'Your knees creak. At five in the morning, fifty makes itself felt.'), selfExpr: 'tired' }],
      action: 'standUp',
      next: null,
    },
  },
};

export const sleepAgain: Dialogue = {
  id: 'sleepAgain',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: null, text: L('Yatağa geri dönmek… Telefon sessiz. Belki gerçekten bir şey yoktur.', 'Back to bed… The phone is silent. Maybe it really is nothing.'), selfExpr: 'tired' }],
      choices: [
        {
          id: 'sleep',
          text: L('Alarm çalana kadar uyu (06:45).', 'Sleep until the alarm (06:45).'),
          tags: ['self', 'risk'],
          effects: {
            stats: { fatigue: -15, stress: -5 },
            flags: { sleptIn: true },
            history: hist('self', 'Yoğun bakım çağrısından sonra uyumaya devam ettin.', 'You went back to sleep after the ICU call.'),
          },
          action: 'sleepUntilAlarm',
          next: null,
        },
        { id: 'no', text: L('Hayır. Kalk.', 'No. Get up.'), next: null },
      ],
    },
  },
};

export const washFace: Dialogue = {
  id: 'washFace',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 2, stats: { fatigue: -6, stress: -2 }, flags: { washed: true } },
      lines: [
        { speaker: null, text: L('Soğuk su. Aynadaki adamın gözaltları her yıl biraz daha koyu.', 'Cold water. The shadows under the eyes of the man in the mirror grow darker every year.'), shot: 'mirror', selfExpr: 'tired' },
        { speaker: 'self', text: L('Ahmet Bey. Üç greft. Kapatırken kuruydu… değil miydi?', 'Ahmet Demirtaş. Three grafts. It was dry when we closed… wasn\'t it?'), selfExpr: 'worried' },
      ],
      choices: [
        {
          id: 'breathe',
          text: L('Otuz saniye nefes al. Sakin bir cerrah daha iyi karar verir.', 'Breathe for thirty seconds. A calm surgeon decides better.'),
          tags: ['self'],
          effects: { minutes: 1, stats: { stress: -7 }, history: hist('self', 'Aynanın karşısında nefesini düzenledin.', 'You steadied your breathing at the mirror.') },
          next: null,
        },
        { id: 'go', text: L('Vakit yok.', 'No time.'), tags: ['time'], next: null },
      ],
    },
  },
};

export const dress: Dialogue = {
  id: 'dress',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: null, text: L('Dolap. Ütülü gömlek, dünkü kazak.', 'The wardrobe. An ironed shirt, yesterday\'s sweater.') }],
      choices: [
        {
          id: 'shirt',
          text: L('Gömlek ve ceket. Bugün aileyle de konuşacaksın.', 'Shirt and jacket. You will be talking to the family today.'),
          detail: L('3 dakika', '3 minutes'),
          tags: ['time', 'career'],
          effects: { minutes: 3, flags: { dressed: true, outfit: 'shirt' }, stats: { reputation: 1 } },
          action: 'outfit:shirt',
          next: 'b',
        },
        {
          id: 'quick',
          text: L('Kazak ve kot, hızlıca.', 'Sweater and jeans, quickly.'),
          detail: L('1 dakika', '1 minute'),
          tags: ['time'],
          effects: { minutes: 1, flags: { dressed: true, outfit: 'casual' } },
          action: 'outfit:casual',
          next: 'b',
        },
      ],
    },
    b: {
      id: 'b',
      onEnter: { objective: 'leaveHome' },
      lines: [{ speaker: null, text: L('Saat {time}. Telefonun cebinde.', 'It is {time}. Phone in your pocket.') }],
      next: null,
    },
  },
};

export const coffee: Dialogue = {
  id: 'coffee',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: null, text: L('Kahve makinesi. Bu evde sabahın ilk sesi hep bu olur.', 'The coffee machine. In this house it is always the first sound of the morning.') }],
      choices: [
        {
          id: 'brew',
          text: L('Bir fincan demle ve iç.', 'Brew a cup and drink it.'),
          detail: L('4 dakika · yorgunluk azalır', '4 minutes · less fatigue'),
          tags: ['time', 'self'],
          effects: { minutes: 4, stats: { fatigue: -11, stress: -2 }, flags: { hadCoffee: true } },
          action: 'anim:drink',
          next: null,
        },
        {
          id: 'thermos',
          text: L('Termosa koy, yolda içersin.', 'Pour it into a thermos for the road.'),
          detail: L('2 dakika', '2 minutes'),
          tags: ['time'],
          effects: { minutes: 2, stats: { fatigue: -6 }, flags: { hadCoffee: true } },
          next: null,
        },
        { id: 'skip', text: L('Kahve beklesin.', 'Coffee can wait.'), next: null },
      ],
    },
  },
};

export const breakfast: Dialogue = {
  id: 'breakfast',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: null, text: L('Tezgâhta dünden kalan simit, buzdolabında beyaz peynir.', 'Yesterday\'s simit on the counter, white cheese in the fridge.') }],
      choices: [
        {
          id: 'quick',
          text: L('Ayakta iki lokma.', 'Two bites, standing.'),
          detail: L('3 dakika', '3 minutes'),
          tags: ['self', 'time'],
          effects: { minutes: 3, stats: { fatigue: -4, stress: -2 }, flags: { ate: true } },
          next: null,
        },
        {
          id: 'skip',
          text: L('Aç git.', 'Go hungry.'),
          tags: ['time'],
          effects: { stats: { fatigue: 3 } },
          next: null,
        },
      ],
    },
  },
};

/** Ayla, now in the kitchen making tea. Talking takes time but matters. */
export const aylaKitchen: Dialogue = {
  id: 'aylaKitchen',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { minutes: 1 },
      lines: [
        { speaker: 'ayla', cond: { memory: 'ayla', key: 'ignoredMorning' }, text: L('Sabah bir "günaydın" bile yoktu.', 'Not even a "good morning" earlier.'), expr: 'sad' },
        { speaker: 'ayla', text: L('Çay koydum. Bir dakika otur, sonra git.', 'I put the kettle on. Sit for a minute, then go.'), expr: 'neutral' },
      ],
      choices: [
        {
          id: 'sit',
          text: L('Otur, iki dakika konuş.', 'Sit down and talk for two minutes.'),
          detail: L('5 dakika · aile, stres', '5 minutes · family, stress'),
          tags: ['family', 'time'],
          effects: { minutes: 5, stats: { family: 6, stress: -6, fatigue: -3 }, rel: { ayla: 8 }, flags: { satWithAyla: true }, memory: [{ char: 'ayla', key: 'satMorning' }] },
          next: 'talk',
        },
        {
          id: 'kiss',
          text: L('Alnından öp: "Akşam konuşuruz."', 'Kiss her forehead: "We will talk tonight."'),
          tags: ['family'],
          effects: { stats: { family: 2 }, rel: { ayla: 2 } },
          next: null,
        },
        {
          id: 'busy',
          text: L('"Şimdi değil Ayla."', '"Not now, Ayla."'),
          tags: ['time'],
          effects: { stats: { family: -4 }, rel: { ayla: -6 }, memory: [{ char: 'ayla', key: 'notNow' }] },
          next: null,
        },
      ],
    },
    talk: {
      id: 'talk',
      lines: [
        {
          speaker: 'ayla',
          text: L(
            'Özel hastaneden yine aramışlar, değil mi? Daha az nöbet, daha çok para. Deniz\'in keman kursu, evin taksiti… Ben sadece seni biraz daha görmek istiyorum.',
            'The private hospital called again, didn\'t they? Fewer nights, more money. Deniz\'s violin lessons, the mortgage… I just want to see you a little more.',
          ),
          expr: 'sad',
        },
      ],
      choices: [
        {
          id: 'consider',
          text: L('Teklifi ciddi düşüneceğim. Söz.', 'I will think about the offer seriously. I promise.'),
          tags: ['career', 'money', 'family'],
          effects: { flags: { consideringOffer: true }, stats: { family: 3 }, rel: { ayla: 4 } },
          next: null,
        },
        {
          id: 'mission',
          text: L('Buradaki ekip bana güveniyor. Bırakamam.', 'The team here relies on me. I cannot leave them.'),
          tags: ['career', 'team'],
          effects: { flags: { loyalToHospital: true }, stats: { career: 2, family: -2 }, rel: { ayla: -2 } },
          next: null,
        },
        {
          id: 'later',
          text: L('Bunu akşam konuşalım, olur mu?', 'Can we talk about this tonight?'),
          tags: ['family'],
          effects: { rel: { ayla: 1 } },
          next: null,
        },
      ],
    },
  },
};

export const leaveHome: Dialogue = {
  id: 'leaveHome',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      redirect: [{ cond: notFlag('dressed'), to: 'pajamas' }],
      lines: [
        { speaker: null, text: L('Anahtarlar, cüzdan, telefon. Saat {time}.', 'Keys, wallet, phone. It is {time}.') },
        { speaker: 'self', cond: { all: [notFlag('hadCoffee'), notFlag('ate')] }, text: L('Ne kahve ne lokma… Uzun bir gün olacak.', 'No coffee, no food… It is going to be a long day.'), selfExpr: 'tired' },
      ],
      choices: [
        { id: 'go', text: L('Kapıyı çek ve arabaya in.', 'Close the door and head down to the car.'), effects: { history: hist('self', 'Evden çıktın.', 'You left home.') }, action: 'scene:car', next: null },
        { id: 'stay', text: L('Bir şey unuttum…', 'I forgot something…'), next: null },
      ],
    },
    pajamas: {
      id: 'pajamas',
      lines: [{ speaker: null, text: L('Pijamayla mı? Önce giyinmelisin; dolap yatak odasında.', 'In pyjamas? You need to get dressed first; the wardrobe is in the bedroom.') }],
      next: null,
    },
  },
};

// --- Phone message replies -------------------------------------------------

export const msgDeniz: Dialogue = {
  id: 'msgDeniz',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: 'deniz', text: L('Babacığım yarın konserime geliyorsun di mi? Solo kısmım var 🎻', 'Dad, you are coming to my concert tomorrow, right? I have a solo part 🎻') }],
      choices: [
        {
          id: 'yes',
          text: L('"En ön sırada olacağım ❤️"', '"I will be in the front row ❤️"'),
          tags: ['family'],
          effects: { minutes: 1, flags: { repliedDeniz: 'promise', promisedConcert: true }, rel: { deniz: 8 }, stats: { family: 3 } },
          next: null,
        },
        {
          id: 'try',
          text: L('"Ameliyatım var ama deneyeceğim kuzum."', '"I have a case, but I will try, sweetheart."'),
          tags: ['family'],
          effects: { minutes: 1, flags: { repliedDeniz: 'try' }, rel: { deniz: 2 } },
          next: null,
        },
      ],
    },
  },
};

export const msgBank: Dialogue = {
  id: 'msgBank',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: null, text: L('Banka: Kredi kartı son ödeme tarihi bugün. Asgari tutar 9.850 TL.', 'Bank: Credit-card payment due today. Minimum 9,850 TL.') }],
      choices: [
        {
          id: 'pay',
          text: L('Şimdi öde (1 dakika).', 'Pay it now (1 minute).'),
          tags: ['money'],
          effects: { minutes: 1, flags: { paidCard: true }, stats: { finance: -2, stress: -2 } },
          next: null,
        },
        {
          id: 'later',
          text: L('Sonra öderim.', 'I will pay later.'),
          tags: ['money'],
          effects: {
            schedule: [
              {
                id: 'lateFee',
                inMinutes: 60 * 24 * 2,
                cond: notFlag('paidCard'),
                effects: { stats: { finance: -7, stress: 3 }, message: { id: 'lateFeeSms', from: 'bank', text: L('Gecikme faizi ve ücret yansıtıldı.', 'Late interest and a fee have been charged.') }, history: hist('money', 'Kart ödemesi gecikti; faiz işledi.', 'The card payment was late; interest was charged.') },
                source: 'bank',
              },
            ],
          },
          next: null,
        },
      ],
    },
  },
};

export const msgOffer: Dialogue = {
  id: 'msgOffer',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [
        {
          speaker: null,
          text: L(
            'Özel hastane, insan kaynakları: "Kemal Hocam, teklifimiz hâlâ geçerli. %60 daha yüksek ücret, haftada bir icap. Cuma\'ya kadar dönüş rica ederiz."',
            'Private hospital HR: "Dr. Arslan, our offer still stands. 60% higher pay, one on-call night a week. We would appreciate an answer by Friday."',
          ),
        },
      ],
      choices: [
        {
          id: 'meet',
          text: L('"Görüşmeye açığım."', '"I am open to a meeting."'),
          tags: ['career', 'money'],
          effects: { minutes: 1, flags: { offerMeeting: true }, stats: { finance: 2 } },
          next: null,
        },
        { id: 'ignore', text: L('Şimdi değil.', 'Not now.'), next: null },
      ],
    },
  },
};

export const msgErgin: Dialogue = {
  id: 'msgErgin',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      lines: [{ speaker: 'ergin', text: L('Kemal, 08:30 kalite toplantısını unutma. Müdürlük re-eksplorasyon oranlarımızı soruyor.', 'Kemal, don\'t forget the 08:30 quality meeting. Management is asking about our re-exploration rates.') }],
      choices: [
        {
          id: 'reply',
          text: L('"Hocam, acil bir hastam var; gecikebilirim."', '"I have an emergency, I may be late."'),
          tags: ['career', 'team'],
          effects: { minutes: 1, flags: { toldErgin: true }, rel: { ergin: 3 } },
          next: null,
        },
        { id: 'ignore', text: L('Cevap verme.', 'Do not reply.'), effects: { flags: { ignoredErgin: true } }, next: null },
      ],
    },
  },
};

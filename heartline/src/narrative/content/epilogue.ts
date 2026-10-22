import type { LText } from '../../state/types';
import type { Dialogue } from '../types';
import { L, flag } from './helpers';

/**
 * Chapters 7–8 (compact): "The Complaint" and "The Consequences". Before this dialogue starts,
 * the director evaluates legal/LegalSystem.ts and writes the result into `legal.*` flags.
 */
export const epilogue: Dialogue = {
  id: 'epilogue',
  start: 'a',
  nodes: {
    a: {
      id: 'a',
      onEnter: { objective: 'epilogue' },
      lines: [
        { speaker: null, text: L('Üç hafta sonra.', 'Three weeks later.'), shot: 'office' },
        { speaker: null, cond: flag('outcome', 'recovered'), text: L('Ahmet Demirtaş altıncı gün taburcu oldu. Kontrol randevusunda torununun fotoğrafını gösterdi.', 'Ahmet Demirtaş went home on day six. At his follow-up he showed you a photo of his grandson.') },
        { speaker: null, cond: flag('outcome', 'complicated'), text: L('Ahmet Demirtaş akut böbrek hasarı ve uzamış ventilasyon sonrası on dokuzuncu gün taburcu oldu. Yavaş ama iyileşiyor.', 'Ahmet Demirtaş went home on day nineteen after acute kidney injury and prolonged ventilation. Slowly, he is recovering.') },
        { speaker: null, cond: flag('outcome', 'critical'), text: L('Ahmet Demirtaş hâlâ yoğun bakımda: diyaliz ve trakeostomi. Ailesi her gün kapıda.', 'Ahmet Demirtaş is still in the ICU: dialysis and a tracheostomy. His family is at the door every day.') },
        { speaker: null, cond: flag('outcome', 'died'), text: L('Ahmet Demirtaş on birinci gün çoklu organ yetmezliğinden hayatını kaybetti.', 'Ahmet Demirtaş died on day eleven of multi-organ failure.'), selfExpr: 'sad' },
        { speaker: null, cond: flag('legal.unavoidable'), text: L('Dosyayı inceleyen herkes aynı notu düştü: bazı komplikasyonlar, her şey doğru yapılsa da olur.', 'Everyone who reviewed the file wrote the same note: some complications happen even when everything is done right.') },
      ],
      redirect: [{ cond: flag('legal.complaint'), to: 'complaint' }],
      next: 'quiet',
    },
    quiet: {
      id: 'quiet',
      lines: [
        { speaker: 'ergin', text: L('Kemal, olguyu M&M toplantısında sunar mısın? Gece verdiğin kararları ekiple konuşmak istiyorum.', 'Kemal, will you present the case at M&M? I want the team to discuss the decisions you made that night.'), expr: 'neutral' },
        { speaker: 'ergin', cond: { stat: 'teamTrust', min: 60 }, text: L('Hemşireler seninle çalışmaktan memnun. Bu, bir cerrah için en iyi referans.', 'The nurses are glad to work with you. For a surgeon, there is no better reference.'), expr: 'smile' },
      ],
      choices: [
        {
          id: 'present',
          text: L('Sunarım — hatalar ve öğrendiklerimiz dahil.', 'I will present it — mistakes and lessons included.'),
          tags: ['team', 'career'],
          effects: { stats: { reputation: 4, career: 4, teamTrust: 3 }, flags: { presentedMM: true } },
          next: 'career',
        },
        {
          id: 'decline',
          text: L('Gerek yok hocam, olağan bir komplikasyondu.', 'No need, it was a routine complication.'),
          tags: ['career'],
          effects: { stats: { career: -2 } },
          next: 'career',
        },
      ],
    },
    complaint: {
      id: 'complaint',
      lines: [
        { speaker: 'selin', text: L('Kemal Bey, Demirtaş ailesi Hasta Hakları Birimine başvurdu. Hastane iç incelemesi başladı.', 'Dr. Arslan, the Demirtaş family has applied to the Patient Rights Office. The hospital has opened an internal review.'), expr: 'neutral', shot: 'office' },
        { speaker: 'selin', text: L('Önce şunu söyleyeyim: kötü bir sonuç tek başına kusur demek değildir. İnceleme, ne yapıldığına ve bunun kayıtlarda nasıl göründüğüne bakar.', 'Let me say this first: a bad outcome alone does not mean fault. The review looks at what was done, and how it appears in the records.') },
        { speaker: 'selin', cond: flag('legal.clarity', 'clear'), text: L('Kayıtlarınız çok net: saatli talimatlar, ameliyat notu, devir. Bu, süreci kısaltacak.', 'Your records are very clear: timed orders, an operative note, a handover. That will shorten the process.') },
        { speaker: 'selin', cond: flag('legal.clarity', 'partial'), text: L('Kayıtlarda boşluklar var. Bazı saatleri tanık beyanlarıyla doldurmamız gerekecek.', 'There are gaps in the records. We will need witness statements to fill in some of the times.') },
        { speaker: 'selin', cond: flag('legal.clarity', 'unclear'), text: L('Açıkçası kayıtlar zayıf. Ne olduğunu yeniden kurmak aylar sürebilir.', 'Frankly, the records are weak. Reconstructing what happened may take months.') },
      ],
      choices: [
        {
          id: 'cooperate',
          text: L('Tüm kayıtlarımı ve zaman çizelgesini eksiksiz sunacağım.', 'I will provide all my records and the full timeline.'),
          tags: ['record'],
          effects: { stats: { stress: 4, reputation: 1 }, flags: { cooperated: true } },
          next: 'review',
        },
        {
          id: 'blameTeam',
          text: L('Gecikme hemşirelik ekibinden kaynaklandı.', 'The delay came from the nursing team.'),
          tags: ['risk', 'team'],
          effects: { stats: { teamTrust: -12 }, rel: { zeynep: -15 }, flags: { blamedTeamFormally: true } },
          next: 'review',
        },
      ],
    },
    review: {
      id: 'review',
      lines: [
        { speaker: null, cond: flag('legal.fault', 'none'), text: L('İç inceleme sonucu: "Bilinen bir komplikasyon; tanı ve tedavi süreci tıbbi standartlara uygun."', 'Internal review finding: "A recognised complication; diagnosis and management consistent with accepted standards."') },
        { speaker: null, cond: flag('legal.fault', 'systemOnly'), text: L('İç inceleme sonucu: "Bireysel kusur saptanmadı. İletişim ve kayıt süreçlerinde iyileştirme önerildi."', 'Internal review finding: "No individual fault. Improvements recommended in communication and documentation."') },
        { speaker: null, cond: flag('legal.fault', 'individual'), text: L('İç inceleme sonucu: "Müdahale kararında önlenebilir gecikme ve bu gecikmenin sonuca katkısı saptandı."', 'Internal review finding: "An avoidable delay in the decision to intervene, which contributed to the outcome."'), selfExpr: 'sad' },
        { speaker: null, cond: flag('legal.fault', 'serious'), text: L('İç inceleme sonucu: "Hemşire uyarılarına yanıtsızlık ve ciddi gecikme; sonuçla illiyet bağı olası."', 'Internal review finding: "Failure to respond to nursing warnings and a serious delay; a causal link to the outcome is likely."'), selfExpr: 'sad' },
        { speaker: 'selin', cond: flag('legal.civil', 'dismissed'), text: L('Aile tazminat talebinde bulundu; bilirkişi raporu kusur görmediği için talep reddedildi.', 'The family filed a compensation claim; it was dismissed because the expert report found no fault.') },
        { speaker: 'selin', cond: flag('legal.civil', 'settled'), text: L('Tazminat talebi, iletişim eksiklikleri kabul edilerek idare tarafından uzlaşmayla sonuçlandırıldı.', 'The compensation claim was settled by the administration, acknowledging the communication failures.') },
        { speaker: 'selin', cond: flag('legal.civil', 'compensation'), text: L('Tazminat davası aile lehine sonuçlanabilir. İdare ödeme yaparsa mevzuat çerçevesinde size rücu edebilir.', 'The compensation case may be decided for the family. If the administration pays, it may seek recourse from you under the regulations.') },
        { speaker: 'selin', cond: flag('legal.criminal', 'noPermission'), text: L('Savcılığa da başvuru yapıldı. Mesleki Sorumluluk Kurulu soruşturma izni vermedi; ceza süreci ilerlemeyecek.', 'A criminal complaint was also filed. The Professional Responsibility Board did not grant investigation permission; there will be no criminal case.') },
        { speaker: 'selin', cond: flag('legal.criminal', 'proceedings'), text: L('Kurul soruşturma izni verdi. Savcılık bilirkişi raporu bekliyor. Sonuç delillere bağlı; hiçbir şey kesin değil.', 'The Board granted investigation permission. The prosecutor awaits an expert report. The outcome depends on the evidence; nothing is decided.'), selfExpr: 'sad' },
        { speaker: 'selin', text: L('(Bu, kurgusal ve sadeleştirilmiş bir süreçtir; hukuki tavsiye değildir.)', '(This is a fictional, simplified process; it is not legal advice.)') },
      ],
      next: 'career',
    },
    career: {
      id: 'career',
      lines: [
        { speaker: 'ayla', cond: { memory: 'deniz', key: 'cameToConcert' }, text: L('Deniz konserin videosunu her gün izliyor. Senin alkışını duyunca gülüyor.', 'Deniz watches the concert video every day. She laughs when she hears you clapping.'), expr: 'smile' },
        { speaker: 'ayla', cond: { memory: 'deniz', key: 'missedConcert' }, text: L('Deniz son zamanlarda pek konuşmuyor. Bir konuşsan…', 'Deniz has not been talking much lately. Maybe if you talked to her…'), expr: 'sad' },
        { speaker: null, cond: flag('offerMeeting'), text: L('Özel hastane ikinci görüşme için tarih istiyor.', 'The private hospital wants a date for a second interview.') },
      ],
      choices: [
        {
          id: 'stay',
          text: L('Hastanede kal, ekibinle devam et.', 'Stay at the hospital, carry on with your team.'),
          tags: ['career', 'team'],
          effects: { stats: { career: 3 }, flags: { finalChoice: 'stay' } },
          action: 'ending',
          next: null,
        },
        {
          id: 'private',
          text: L('Özel hastanenin teklifini kabul et.', 'Accept the private hospital offer.'),
          tags: ['money', 'family'],
          showIf: { any: [flag('offerMeeting'), flag('consideringOffer')] },
          effects: { stats: { finance: 15, family: 6, career: -2 }, flags: { finalChoice: 'private' } },
          action: 'ending',
          next: null,
        },
        {
          id: 'balance',
          text: L('Kal, ama icap sayını azalt ve akşamları eve dön.', 'Stay, but cut your on-call nights and come home in the evenings.'),
          tags: ['family', 'self'],
          effects: { stats: { family: 8, stress: -6, career: -1 }, flags: { finalChoice: 'balance' } },
          action: 'ending',
          next: null,
        },
      ],
    },
  },
};

export const ENDINGS: Record<string, { title: LText; body: LText }> = {
  serious: {
    title: L('Ağır Bedel', 'A Heavy Price'),
    body: L(
      'Ceza soruşturması sürüyor; ameliyat listen askıya alındı. Gece 05:12\'deki o telefon, kariyerini ikiye ayıran an oldu. Sonuç mahkemede, delillere göre belirlenecek.',
      'The criminal investigation continues; your operating list is suspended. The 05:12 call became the moment that split your career in two. The outcome will be decided in court, on the evidence.',
    ),
  },
  legalResolved: {
    title: L('Çözülen Anlaşmazlık', 'A Dispute Resolved'),
    body: L(
      'Aylar süren süreç kapandı. Yorgun ama ayakta, bir sonraki gece çağrısına daha dikkatli bakıyorsun.',
      'The months-long process is closed. Tired but standing, you look at the next night call more carefully.',
    ),
  },
  crisisRecovery: {
    title: L('Krizden Sonra', 'After the Crisis'),
    body: L(
      'Şikâyet inceleme ile kapandı. Kayıtların ve ekibin yanında durdu. İtibarın sarsıldı ama yeniden toparlanıyor.',
      'The complaint closed after review. Your records and your team stood by you. Your reputation was shaken, but it is recovering.',
    ),
  },
  familyStrain: {
    title: L('Evdeki Boşluk', 'The Empty Chair'),
    body: L(
      'Hastanede herkes sana güveniyor. Evde ise akşam yemeklerinde bir sandalye çoğu zaman boş kalıyor.',
      'At the hospital, everyone relies on you. At home, one chair at the dinner table is usually empty.',
    ),
  },
  success: {
    title: L('Mesleki Başarı', 'Professional Success'),
    body: L(
      'Olgu M&M\'de örnek gösterildi. Asistanlar o geceyi anlatıyor. Klinik şefliği için adın geçiyor.',
      'The case became a teaching example at M&M. The residents still talk about that night. Your name is mentioned for head of department.',
    ),
  },
  balanced: {
    title: L('Dengeli Bir Hayat', 'A Balanced Life'),
    body: L(
      'Mükemmel değil ama dengeli: hastaların, ekibin ve ailen arasında her gün yeniden kurulan bir denge.',
      'Not perfect, but balanced: a balance between your patients, your team and your family, rebuilt every day.',
    ),
  },
};

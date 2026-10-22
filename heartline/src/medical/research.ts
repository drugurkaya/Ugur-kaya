import type { LText } from '../state/types';

/**
 * Sources consulted while designing the scenarios. Shown in the in-game journal ("Sources") and
 * mirrored in docs/RESEARCH.md. Only bibliographic facts confirmed through PubMed metadata or
 * search-engine results are recorded; nothing here describes a real patient or hospital.
 */
export interface Source {
  id: string;
  title: string;
  org: string;
  date: string;
  url: string;
  lessons: LText;
  adaptation: LText;
}

export const SOURCES: Source[] = [
  {
    id: 'haneya2015',
    title: 'Re-exploration for bleeding or tamponade after cardiac surgery: impact of timing and indication on outcome',
    org: 'Thorac Cardiovasc Surg 63(1):51-57 (Haneya A. et al.)',
    date: '2014-09-29 (online)',
    url: 'https://doi.org/10.1055/s-0034-1390154',
    lessons: {
      tr: 'İlk 12 saatten sonra yapılan re-eksplorasyonlarda mortalite belirgin yüksek bulunmuş; tamponat endikasyonu kanamaya göre daha kötü sonuçla ilişkili.',
      en: 'Re-exploration after 12 hours was associated with markedly higher mortality; tamponade as the indication carried a worse outcome than bleeding.',
    },
    adaptation: {
      tr: 'Oyundaki hasta modeli, kesin müdahaleye kadar geçen süre ve şok yükü üzerinden sonucu belirler. Tamponat senaryosu ayrıca modellenmiştir.',
      en: 'The patient model ties outcome to time-to-definitive-control and accumulated shock burden. Tamponade is modelled as its own scenario.',
    },
  },
  {
    id: 'canadyova2012',
    title: 'Re-exploration for bleeding or tamponade after cardiac operation',
    org: 'Interact Cardiovasc Thorac Surg 14(6):704-707 (Čanádyová J. et al.)',
    date: '2012-03-20',
    url: 'https://doi.org/10.1093/icvts/ivs087',
    lessons: {
      tr: 'Gecikmiş resternotomi, yüksek laktat ve düşük hematokrit, re-eksplorasyon sonrası mortalite ile ilişkili. Hastaların ~%72\'sinde tanımlanabilir kanama odağı bulunmuş.',
      en: 'Delayed resternotomy, higher lactate and lower haematocrit were associated with mortality after re-exploration. An identifiable bleeding source was found in ~72%.',
    },
    adaptation: {
      tr: 'Laktat ve Hb oyunda görünür göstergelerdir; her re-eksplorasyonda cerrahi odak bulunmaz (koagülopati senaryosu).',
      en: 'Lactate and Hb are visible indicators; not every re-exploration finds a surgical source (coagulopathy scenario).',
    },
  },
  {
    id: 'mataraci2010',
    title: 'Postoperative revision surgery for bleeding in a tertiary heart center',
    org: 'Asian Cardiovasc Thorac Ann 18(3):266-271 (Mataracı İ. et al., İstanbul)',
    date: '2010-06',
    url: 'https://doi.org/10.1177/0218492310369030',
    lessons: {
      tr: '19.680 açık kalp ameliyatında, re-eksplore edilen hastaların yarısında cerrahi dışı kanama nedeni vardı; gecikmiş reoperasyon mortalite ve morbidite öngördürücüsüydü.',
      en: 'In 19,680 open-heart operations, half of re-explored patients had non-surgical bleeding; delayed reoperation predicted mortality and morbidity.',
    },
    adaptation: {
      tr: 'Cerrahi ve cerrahi dışı kanama ayrımı, oyuncunun bilgi toplama seçimleriyle (laboratuvar, eko, dren) yapılır.',
      en: 'The surgical vs non-surgical distinction is made through the player\'s information gathering (labs, echo, drains).',
    },
  },
  {
    id: 'patel2020',
    title: 'Re-exploration after off-pump coronary artery bypass grafting: incidence, risk factors, and impact of timing',
    org: 'J Card Surg 35(11):3062-3069 (Patel K. et al.)',
    date: '2020-09-16',
    url: 'https://doi.org/10.1111/jocs.14986',
    lessons: {
      tr: '14 saatten geç re-eksplorasyonda mortalite belirgin yüksekti (%30,6\'ya karşı %7,3).',
      en: 'Late re-exploration (>14 h) carried much higher mortality (30.6% vs 7.3%).',
    },
    adaptation: {
      tr: 'Evde ve yolda harcanan her dakika hastanın simülasyonunda işler.',
      en: 'Every minute spent at home and on the road runs in the patient simulation.',
    },
  },
  {
    id: 'sts2017',
    title: 'The Society of Thoracic Surgeons Expert Consensus for the Resuscitation of Patients Who Arrest After Cardiac Surgery',
    org: 'Ann Thorac Surg 103(3):1005-1020 (STS Task Force)',
    date: '2017-01-22 (online)',
    url: 'https://doi.org/10.1016/j.athoracsur.2016.10.033',
    lessons: {
      tr: 'VF\'de dış masajdan önce art arda üç defibrilasyon; tamponat/kanama arrestinde dış masaj etkisiz, 5 dakika içinde acil resternotomi; tam doz adrenalin rutin önerilmez.',
      en: 'VF: three sequential shocks before external massage; external massage is ineffective in tamponade/bleeding arrest, so emergency resternotomy within 5 minutes; full-dose epinephrine is not routine.',
    },
    adaptation: {
      tr: 'Ameliyathanedeki ani VF olayı ve yoğun bakım arrest dalı bu ilkelere göre kurgulandı.',
      en: 'The intraoperative VF event and the ICU arrest branch follow these principles.',
    },
  },
  {
    id: 'haynes2009',
    title: 'A surgical safety checklist to reduce morbidity and mortality in a global population',
    org: 'N Engl J Med 360(5):491-499 (Haynes A.B. et al.)',
    date: '2009-01-14',
    url: 'https://doi.org/10.1056/NEJMsa0810119',
    lessons: {
      tr: 'DSÖ Güvenli Cerrahi Kontrol Listesi sonrası mortalite %1,5\'ten %0,8\'e, komplikasyonlar %11\'den %7\'ye düştü (kalp dışı cerrahi).',
      en: 'After the WHO Surgical Safety Checklist, death fell from 1.5% to 0.8% and complications from 11% to 7% (non-cardiac surgery).',
    },
    adaptation: {
      tr: 'Acil re-eksplorasyonda bile time-out seçimi ekip güvenini ve inceleme kayıtlarını etkiler.',
      en: 'Even in an emergency re-exploration, the time-out choice affects team trust and the review record.',
    },
  },
  {
    id: 'psnet2024',
    title: 'Hemorrhagic Shock after Elective Spine Surgery: Failure to Rescue after Limited Response to Nursing Concerns (Spotlight Case)',
    org: 'AHRQ PSNet WebM&M (Zakaluzny S. et al.)',
    date: '2024-07-10',
    url: 'https://psnet.ahrq.gov/web-mm/hemorrhagic-shock-after-elective-spine-surgery-failure-rescue-after-limited-response-nursing',
    lessons: {
      tr: 'Hemşirelerin dile getirdiği endişelere sınırlı yanıt ve şokun geç tanınması, kurtarma başarısızlığına yol açabilir. (Kalp cerrahisi dışı olgu; ilkeler genellenebilir.)',
      en: 'Limited response to nursing concerns and late recognition of shock can lead to failure to rescue. (Not a cardiac case; the principles generalise.)',
    },
    adaptation: {
      tr: '05:12 çağrısında hemşirenin endişesini geçiştirmek kayıtlı bir sapma olur; Zeynep bunu hatırlar.',
      en: 'Dismissing the nurse at 05:12 is recorded as a deviation; Zeynep remembers it.',
    },
  },
  {
    id: 'coress2025',
    title: 'CORESS Feedback: Cases from the Confidential Reporting System for Surgery',
    org: 'Ann R Coll Surg Engl (CORESS)',
    date: '2025-05-01',
    url: 'https://doi.org/10.1308/rcsann.2025.0029',
    lessons: {
      tr: 'Gizli, suçlamasız raporlama ve ekipman/ekip iletişimi dersleri; ör. tanıdık olmayan ekipmanın ayrıntılı kontrol edilmesi gerekliliği.',
      en: 'Confidential, blame-free reporting and lessons on equipment and team communication, e.g. checking unfamiliar equipment thoroughly.',
    },
    adaptation: {
      tr: 'Ekipman hazırlığı (pompa, hücre kurtarıcı, kan ürünleri) ameliyathane kararlarına eklendi. Belirli bir CORESS olgusu birebir kullanılmadı.',
      en: 'Equipment readiness (pump, cell saver, blood products) is part of the OR decisions. No specific CORESS case is reproduced.',
    },
  },
  {
    id: 'candor2016',
    title: 'Communication and Optimal Resolution (CANDOR) Toolkit – Module 5: Response and Disclosure',
    org: 'Agency for Healthcare Research and Quality (AHRQ)',
    date: '2016-05',
    url: 'https://www.ahrq.gov/patient-safety/settings/hospital/candor/modules/guide5/notes.html',
    lessons: {
      tr: 'Olaydan sonra erken (ilk 60 dakika içinde başlayan), süreğen, empatik açıklama; özür ve sorumluluk üstlenme bileşenleri.',
      en: 'Early (starting within 60 minutes), ongoing, empathetic disclosure; apology and taking responsibility as components.',
    },
    adaptation: {
      tr: 'Bölüm 5\'teki aile görüşmesinde açık iletişim, şikâyet olasılığını azaltır; yanıltma ise kayıtlı bir sapmadır.',
      en: 'Honest communication in the Chapter 5 family meeting lowers complaint likelihood; misleading the family is a recorded deviation.',
    },
  },
  {
    id: 'shtk18',
    title: '3359 sayılı Sağlık Hizmetleri Temel Kanunu, Ek Madde 18 (7406 sayılı Kanunun 14. maddesiyle eklendi, 12.05.2022)',
    org: 'T.C. mevzuat (ikincil kaynaklardan doğrulandı / verified via secondary sources)',
    date: '2022-05-12',
    url: 'https://www.mevzuat.gov.tr/',
    lessons: {
      tr: 'Tıbbi işlem nedeniyle sağlık meslek mensupları hakkında soruşturma, Sağlık Bakanlığı bünyesindeki Mesleki Sorumluluk Kurulunun iznine bağlıdır; kararlara Ankara Bölge İdare Mahkemesinde itiraz edilebilir.',
      en: 'Investigating health professionals over medical procedures requires permission from the Professional Responsibility Board within the Ministry of Health; decisions can be appealed to the Ankara Regional Administrative Court.',
    },
    adaptation: {
      tr: 'Oyundaki ceza süreci önce izin aşamasından geçer; kötü sonuç tek başına ceza yargılamasına yol açmaz.',
      en: 'The in-game criminal path passes through the permission stage first; a bad outcome alone never leads to prosecution.',
    },
  },
  {
    id: 'tck85',
    title: 'Türk Ceza Kanunu md. 85 (taksirle öldürme) ve md. 89 (taksirle yaralama); komplikasyon–malpraktis ayrımı üzerine hukuk literatürü',
    org: 'TCK 5237 / çeşitli hukuk kaynakları',
    date: '—',
    url: 'https://tbbdergisi.barobirlik.org.tr/ViewPDF-tibbi-hatanin-hukuki-ve-cezai-sonuclari-43',
    lessons: {
      tr: 'Ceza sorumluluğu taksir ve illiyet bağı gerektirir; mevcut tıp bilgisiyle önlenemeyen komplikasyon kural olarak hekim kusuru sayılmaz. Bilirkişi raporu belirleyicidir; aydınlatılmış onamın ispatı sağlık kuruluşundadır.',
      en: 'Criminal liability requires negligence and causation; a complication not preventable with current medical knowledge is generally not physician fault. Expert reports are decisive; proving informed consent falls on the provider.',
    },
    adaptation: {
      tr: 'LegalSystem.ts kusuru sapma + illiyet + belge açıklığı üzerinden değerlendirir; sonuç tek başına kusur sayılmaz.',
      en: 'LegalSystem.ts assesses fault from deviation + causation + documentation clarity; the outcome alone is never fault.',
    },
  },
];

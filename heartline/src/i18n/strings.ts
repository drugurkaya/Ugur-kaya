import type { Lang, LText, StatKey } from '../state/types';

/** Interface strings. Narrative text lives with the dialogue data; everything else is here. */
const S = {
  title: { tr: 'HEARTLINE', en: 'HEARTLINE' },
  subtitle: { tr: 'Bir Kalp Cerrahının Hayatı', en: 'The Life of a Cardiac Surgeon' },
  continue: { tr: 'Devam et', en: 'Continue' },
  newGame: { tr: 'Yeni oyun', en: 'New game' },
  load: { tr: 'Yükle', en: 'Load' },
  save: { tr: 'Kaydet', en: 'Save' },
  settings: { tr: 'Ayarlar', en: 'Settings' },
  about: { tr: 'Hakkında', en: 'About' },
  resume: { tr: 'Devam', en: 'Resume' },
  mainMenu: { tr: 'Ana menü', en: 'Main menu' },
  back: { tr: 'Geri', en: 'Back' },
  close: { tr: 'Kapat', en: 'Close' },
  paused: { tr: 'Duraklatıldı', en: 'Paused' },
  journal: { tr: 'Defter', en: 'Journal' },
  phone: { tr: 'Telefon', en: 'Phone' },
  empty: { tr: 'Boş', en: 'Empty' },
  autosave: { tr: 'Otomatik kayıt', en: 'Autosave' },
  slot: { tr: 'Kayıt', en: 'Slot' },
  saved: { tr: 'Kaydedildi', en: 'Saved' },
  cannotSaveNow: { tr: 'Şu an kaydedilemez (diyalog ya da çağrı sürüyor).', en: 'Cannot save right now (a dialogue or call is in progress).' },
  storageUnavailable: { tr: 'Tarayıcı depolaması kullanılamıyor; kayıt yapılamaz.', en: 'Browser storage is unavailable; saving is disabled.' },
  autosaving: { tr: 'Kaydediliyor…', en: 'Saving…' },
  language: { tr: 'Dil', en: 'Language' },
  quality: { tr: 'Grafik', en: 'Graphics' },
  performance: { tr: 'Performans', en: 'Performance' },
  balanced: { tr: 'Dengeli', en: 'Balanced' },
  qualityHigh: { tr: 'Kalite', en: 'Quality' },
  master: { tr: 'Ana ses', en: 'Master volume' },
  sfx: { tr: 'Efektler', en: 'Effects' },
  ambience: { tr: 'Ortam sesi', en: 'Ambience' },
  voice: { tr: 'Sesli diyalog (cihaz sesi)', en: 'Spoken dialogue (device voice)' },
  textSize: { tr: 'Yazı boyutu', en: 'Text size' },
  textSpeed: { tr: 'Yazı hızı', en: 'Text speed' },
  lookSensitivity: { tr: 'Kamera hassasiyeti', en: 'Camera sensitivity' },
  invertY: { tr: 'Dikey ekseni ters çevir', en: 'Invert vertical look' },
  reduceMotion: { tr: 'Hareketi azalt', en: 'Reduce motion' },
  on: { tr: 'Açık', en: 'On' },
  off: { tr: 'Kapalı', en: 'Off' },
  answer: { tr: 'Cevapla', en: 'Answer' },
  decline: { tr: 'Reddet', en: 'Decline' },
  incoming: { tr: 'gelen arama…', en: 'incoming call…' },
  icuCaller: { tr: 'Yoğun Bakım — Kalp Damar', en: 'ICU — Cardiac Surgery' },
  messages: { tr: 'Mesajlar', en: 'Messages' },
  contacts: { tr: 'Rehber', en: 'Contacts' },
  call: { tr: 'Ara', en: 'Call' },
  noMessages: { tr: 'Mesaj yok', en: 'No messages' },
  reply: { tr: 'Yanıtla', en: 'Reply' },
  objectives: { tr: 'Hedefler', en: 'Objectives' },
  patient: { tr: 'Hasta', en: 'Patient' },
  career: { tr: 'Kariyer', en: 'Career' },
  relationships: { tr: 'İlişkiler', en: 'Relationships' },
  history: { tr: 'Geçmiş', en: 'History' },
  sources: { tr: 'Kaynaklar', en: 'Sources' },
  chapters: { tr: 'Bölümler', en: 'Chapters' },
  lastReport: { tr: 'Son bilgi', en: 'Last report' },
  noReport: { tr: 'Henüz bilgi yok.', en: 'No report yet.' },
  pending: { tr: 'Bekleyen sonuçlar', en: 'Pending consequences' },
  pendingHint: {
    tr: 'Bazı kararların etkisi daha sonra ortaya çıkar.',
    en: 'Some decisions only show their effect later.',
  },
  remembers: { tr: 'Hatırlıyor', en: 'Remembers' },
  interact: { tr: 'Etkileşim', en: 'Interact' },
  timeLeft: { tr: 'Süre', en: 'Time' },
  locked: { tr: 'Kilitli', en: 'Locked' },
  tapToContinue: { tr: 'Devam için dokun / Boşluk', en: 'Tap / Space to continue' },
  ending: { tr: 'Son', en: 'Ending' },
  playAgain: { tr: 'Yeniden oyna', en: 'Play again' },
  legalPath: { tr: 'Hukuki süreç', en: 'Legal path' },
  outcome: { tr: 'Hastanın sonucu', en: 'Patient outcome' },
  deviationsTitle: { tr: 'İncelemede görülen sapmalar', en: 'Deviations seen in review' },
  goodTitle: { tr: 'İyi uygulamalar', en: 'Good practice recorded' },
  none: { tr: 'Yok', en: 'None' },
  controlsDesktop: {
    tr: 'WASD/oklar: yürü · Shift: hızlı · Fare sürükle: kamera · E: etkileşim · Boşluk/Enter: devam · P: telefon · J: defter · Esc: menü',
    en: 'WASD/arrows: walk · Shift: hurry · Drag mouse: camera · E: interact · Space/Enter: continue · P: phone · J: journal · Esc: menu',
  },
  controlsTouch: {
    tr: 'Sol: yürü · Sağda sürükle: kamera · ✋: etkileşim',
    en: 'Left: walk · Drag right side: camera · ✋: interact',
  },
  disclaimer: {
    tr: 'Kurgusal bir oyundur. Kişiler, hastane ve olaylar hayal ürünüdür. Tıbbi içerik eğitim amaçlı sadeleştirilmiştir ve klinisyenlerce doğrulanmamıştır; tıbbi ya da hukuki tavsiye değildir.',
    en: 'A work of fiction. People, the hospital and events are invented. Medical content is simplified for gameplay and has not been validated by clinicians; it is neither medical nor legal advice.',
  },
  aboutText: {
    tr: 'Three.js + TypeScript ile yazıldı. Tüm 3B modeller, dokular ve sesler oyun içinde prosedürel üretilir; dış varlık kullanılmamıştır. Kaynaklar için Defter → Kaynaklar.',
    en: 'Built with Three.js + TypeScript. All 3D models, textures and sounds are generated procedurally at runtime; no external assets are used. See Journal → Sources.',
  },
  loading: { tr: 'Yükleniyor…', en: 'Loading…' },
  introPlace: { tr: 'Bursa · Nilüfer', en: 'Bursa · Nilüfer' },
  introDay: { tr: 'Perşembe', en: 'Thursday' },
  missedCall: { tr: 'Cevapsız arama', en: 'Missed call' },
  newMessage: { tr: 'Yeni mesaj', en: 'New message' },
  consequence: { tr: 'Bir kararın sonucu', en: 'A decision has consequences' },
  threeWeeks: { tr: 'Üç hafta sonra', en: 'Three weeks later' },
};

export type StringKey = keyof typeof S;

export function t(key: StringKey, lang: Lang): string {
  return S[key][lang];
}

export const STAT_LABEL: Record<StatKey, LText> = {
  stress: { tr: 'Stres', en: 'Stress' },
  fatigue: { tr: 'Yorgunluk', en: 'Fatigue' },
  reputation: { tr: 'Mesleki itibar', en: 'Reputation' },
  teamTrust: { tr: 'Ekip güveni', en: 'Team trust' },
  family: { tr: 'Aile ilişkileri', en: 'Family' },
  finance: { tr: 'Mali durum', en: 'Finances' },
  documentation: { tr: 'Kayıt kalitesi', en: 'Documentation' },
  career: { tr: 'Kariyer', en: 'Career' },
};

/** What each stat does mechanically (shown in the career panel so numbers are never decorative). */
export const STAT_EFFECT: Record<StatKey, LText> = {
  stress: { tr: 'Karar sürelerini kısaltır, kalp atışı ve kamera titremesi.', en: 'Shortens decision timers; heartbeat and camera shake.' },
  fatigue: { tr: 'Yüksekse bazı dikkat isteyen seçenekler kilitlenir.', en: 'When high, demanding choices become locked.' },
  reputation: { tr: 'Sonlar ve kariyer fırsatları.', en: 'Endings and career opportunities.' },
  teamTrust: { tr: 'Devretme ve akşam seçeneklerini açar; ekip tepkileri.', en: 'Unlocks hand-off and evening options; team reactions.' },
  family: { tr: 'Aile sahneleri ve sonlar.', en: 'Family scenes and endings.' },
  finance: { tr: 'Kariyer kararları ve stres.', en: 'Career decisions and stress.' },
  documentation: { tr: 'İncelemede olayların ne kadar net görüleceği.', en: 'How clearly a review can see what happened.' },
  career: { tr: 'Sonlar ve teklifler.', en: 'Endings and offers.' },
};

export const OBJECTIVES: Record<string, LText> = {
  answerPhone: { tr: 'Telefon titriyor. Cevapla, bekle ya da reddet.', en: 'The phone is vibrating. Answer, wait, or decline.' },
  decideCall: { tr: 'Hemşireye bir talimat ver.', en: 'Give the nurse your orders.' },
  getUp: { tr: 'Yataktan kalk.', en: 'Get out of bed.' },
  callBack: { tr: 'Yoğun bakımı geri ara (telefon).', en: 'Call the ICU back (phone).' },
  getReady: { tr: 'Hazırlan: giyin; istersen yüzünü yıka, kahve iç, Ayla ile konuş.', en: 'Get ready: get dressed; wash, have coffee or talk to Ayla if you choose.' },
  leaveHome: { tr: 'Evden çık (ön kapı).', en: 'Leave home (front door).' },
  reachHospital: { tr: 'Hastaneye git.', en: 'Drive to the hospital.' },
  goToIcu: { tr: 'Yoğun bakıma git (koridorun sonu).', en: 'Go to the ICU (end of the corridor).' },
  assessPatient: { tr: 'Hastayı değerlendir ve karar ver.', en: 'Assess the patient and decide.' },
  operate: { tr: 'Ameliyathanede ekibi yönet.', en: 'Lead the team in theatre.' },
  talkFamily: { tr: 'Aileyle konuş.', en: 'Talk to the family.' },
  evening: { tr: 'Günü tamamla.', en: 'Finish the day.' },
  epilogue: { tr: 'Sonuçlarla yüzleş.', en: 'Face the consequences.' },
};

export const OUTCOME_LABEL: Record<string, LText> = {
  recovered: { tr: 'İyileşti, taburcu oldu', en: 'Recovered and discharged' },
  complicated: { tr: 'Komplikasyonlu iyileşme', en: 'Recovered with complications' },
  critical: { tr: 'Kritik, uzun yoğun bakım', en: 'Critical, prolonged ICU stay' },
  died: { tr: 'Hayatını kaybetti', en: 'Died' },
};

export const STAGE_LABEL: Record<string, LText> = {
  patientRights: { tr: 'Hasta Hakları Birimi başvurusu', en: 'Patient Rights Office application' },
  internalReview: { tr: 'Hastane iç incelemesi', en: 'Internal hospital review' },
  compensationClaim: { tr: 'Tazminat talebi', en: 'Compensation claim' },
  criminalComplaint: { tr: 'Savcılığa şikâyet', en: 'Criminal complaint' },
  permissionDenied: { tr: 'Soruşturma izni verilmedi', en: 'Investigation permission refused' },
  permissionGranted: { tr: 'Soruşturma izni verildi', en: 'Investigation permission granted' },
};

export const GOOD_LABEL: Record<string, LText> = {
  readBack: { tr: 'Telefon talimatı geri okuma', en: 'Phone order read-back' },
  clearPlan: { tr: 'Net klinik plan', en: 'Clear clinical plan' },
  timeOut: { tr: 'Tam time-out', en: 'Full time-out' },
  opNote: { tr: 'Zamanında ameliyat notu', en: 'Timely operative note' },
  handoff: { tr: 'Yapılandırılmış devir', en: 'Structured handover' },
  consent: { tr: 'Aydınlatılmış onam', en: 'Informed consent' },
  disclosure: { tr: 'Açık bilgilendirme', en: 'Open disclosure' },
  transparency: { tr: 'Kayıtlara şeffaf erişim', en: 'Transparent access to records' },
  stsArrest: { tr: 'Kılavuza uygun arrest yönetimi', en: 'Guideline-concordant arrest management' },
  handHygiene: { tr: 'El hijyeni', en: 'Hand hygiene' },
};

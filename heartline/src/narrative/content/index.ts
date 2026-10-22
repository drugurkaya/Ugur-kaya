import type { Dialogue } from '../types';
import { aylaWake, call, declined, missed, phoneEce, phoneIcu } from './chapter1';
import { epilogue } from './epilogue';
import { evening, family } from './family';
import { aylaKitchen, breakfast, coffee, dress, getUp, leaveHome, msgBank, msgDeniz, msgErgin, msgOffer, sleepAgain, washFace } from './home';
import { commute, guard, handHygiene, icu, phoneAyla } from './hospital';
import { or } from './operating';

export const LIBRARY: Record<string, Dialogue> = Object.fromEntries(
  [
    call,
    missed,
    declined,
    phoneIcu,
    phoneEce,
    aylaWake,
    getUp,
    sleepAgain,
    washFace,
    dress,
    coffee,
    breakfast,
    aylaKitchen,
    leaveHome,
    msgDeniz,
    msgBank,
    msgOffer,
    msgErgin,
    commute,
    guard,
    handHygiene,
    phoneAyla,
    icu,
    or,
    family,
    evening,
    epilogue,
  ].map((d) => [d.id, d]),
);

export { ENDINGS } from './epilogue';

/** Chapter metadata for the menu and HUD. */
export const CHAPTERS = [
  { id: 'ch1', n: 1, title: { tr: '05:12 — Acil Çağrı', en: '05:12 — The Emergency Call' } },
  { id: 'ch2', n: 2, title: { tr: 'İlk Karar', en: 'The First Decision' } },
  { id: 'ch3', n: 3, title: { tr: 'Hastaneye Varış', en: 'Arrival at the Hospital' } },
  { id: 'ch4', n: 4, title: { tr: 'Ameliyathane', en: 'The Operating Room' } },
  { id: 'ch5', n: 5, title: { tr: 'Hastanın Ailesi', en: "The Patient's Family" } },
  { id: 'ch6', n: 6, title: { tr: 'Gece Nöbeti', en: 'The Night Shift' } },
  { id: 'ch7', n: 7, title: { tr: 'Şikâyet', en: 'The Complaint' } },
  { id: 'ch8', n: 8, title: { tr: 'Sonuçlar', en: 'The Consequences' } },
];

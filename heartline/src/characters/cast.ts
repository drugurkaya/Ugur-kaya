import type { LText } from '../state/types';

/** Visual description used by the procedural character builder. */
export interface Look {
  height: number;
  build: number;
  skin: number;
  hair: number;
  hairStyle: 'short' | 'bald' | 'long' | 'bun' | 'grey' | 'cap';
  beard?: 'stubble' | 'full' | 'moustache';
  glasses?: boolean;
  female?: boolean;
  outfit: Outfit;
  age: number;
}

export type Outfit = 'pajamas' | 'shirt' | 'scrubs' | 'nurse' | 'coat' | 'casual' | 'guard' | 'gown' | 'suit' | 'nightgown';

export interface CastMember {
  id: string;
  name: LText;
  role: LText;
  look: Look;
  /** Voice parameters for optional speech synthesis. */
  voice: { pitch: number; rate: number; female: boolean };
}

const L = (tr: string, en: string): LText => ({ tr, en });

export const PROTAGONIST = 'self';

export const CAST: Record<string, CastMember> = {
  self: {
    id: 'self',
    name: L('Dr. Kemal Arslan', 'Dr. Kemal Arslan'),
    role: L('Kalp ve damar cerrahı, 50', 'Cardiac surgeon, 50'),
    look: { height: 1.78, build: 1.05, skin: 0xc29a86, hair: 0x6f6a66, hairStyle: 'grey', beard: 'stubble', glasses: false, outfit: 'pajamas', age: 50 },
    voice: { pitch: 0.85, rate: 1.0, female: false },
  },
  ayla: {
    id: 'ayla',
    name: L('Ayla Arslan', 'Ayla Arslan'),
    role: L('Eşi, lise öğretmeni', 'Spouse, high-school teacher'),
    look: { height: 1.65, build: 0.92, skin: 0xd8a98c, hair: 0x3b2618, hairStyle: 'long', female: true, outfit: 'nightgown', age: 48 },
    voice: { pitch: 1.15, rate: 1.0, female: true },
  },
  deniz: {
    id: 'deniz',
    name: L('Deniz Arslan', 'Deniz Arslan'),
    role: L('Kızı, 16, keman çalıyor', 'Daughter, 16, plays the violin'),
    look: { height: 1.62, build: 0.85, skin: 0xd8a98c, hair: 0x2a1b12, hairStyle: 'long', female: true, outfit: 'casual', age: 16 },
    voice: { pitch: 1.3, rate: 1.05, female: true },
  },
  zeynep: {
    id: 'zeynep',
    name: L('Zeynep Kılıç', 'Zeynep Kılıç'),
    role: L('Yoğun bakım hemşiresi (gece)', 'ICU nurse (night shift)'),
    look: { height: 1.63, build: 0.9, skin: 0xcf9f82, hair: 0x2b1d14, hairStyle: 'bun', female: true, outfit: 'nurse', age: 34 },
    voice: { pitch: 1.2, rate: 1.08, female: true },
  },
  ece: {
    id: 'ece',
    name: L('Dr. Ece Yalçın', 'Dr. Ece Yalçın'),
    role: L('Asistan hekim, 3. yıl', 'Surgical resident, year 3'),
    look: { height: 1.68, build: 0.88, skin: 0xe0b394, hair: 0x5a3a22, hairStyle: 'bun', female: true, glasses: true, outfit: 'scrubs', age: 29 },
    voice: { pitch: 1.1, rate: 1.1, female: true },
  },
  murat: {
    id: 'murat',
    name: L('Dr. Murat Öztürk', 'Dr. Murat Öztürk'),
    role: L('Anestezi uzmanı', 'Anaesthesiologist'),
    look: { height: 1.82, build: 1.12, skin: 0xbf8b6e, hair: 0x1d1612, hairStyle: 'short', beard: 'moustache', outfit: 'scrubs', age: 46 },
    voice: { pitch: 0.75, rate: 0.95, female: false },
  },
  serkan: {
    id: 'serkan',
    name: L('Serkan Aydın', 'Serkan Aydın'),
    role: L('Perfüzyonist', 'Perfusionist'),
    look: { height: 1.75, build: 1.0, skin: 0xcb9a7c, hair: 0x241a12, hairStyle: 'short', beard: 'full', outfit: 'scrubs', age: 38 },
    voice: { pitch: 0.95, rate: 1.0, female: false },
  },
  hulya: {
    id: 'hulya',
    name: L('Hülya Şen', 'Hülya Şen'),
    role: L('Ameliyathane hemşiresi', 'Scrub nurse'),
    look: { height: 1.6, build: 0.95, skin: 0xd4a385, hair: 0x3a2a1c, hairStyle: 'cap', female: true, outfit: 'scrubs', age: 44 },
    voice: { pitch: 1.05, rate: 1.0, female: true },
  },
  ergin: {
    id: 'ergin',
    name: L('Prof. Dr. Nihat Ergin', 'Prof. Nihat Ergin'),
    role: L('Klinik şefi', 'Head of department'),
    look: { height: 1.74, build: 1.08, skin: 0xc79478, hair: 0xb9b5b0, hairStyle: 'bald', glasses: true, outfit: 'coat', age: 63 },
    voice: { pitch: 0.7, rate: 0.92, female: false },
  },
  sevim: {
    id: 'sevim',
    name: L('Sevim Demirtaş', 'Sevim Demirtaş'),
    role: L('Hastanın eşi', "Patient's wife"),
    look: { height: 1.58, build: 1.0, skin: 0xd1a083, hair: 0x8a8580, hairStyle: 'bun', female: true, outfit: 'casual', age: 64 },
    voice: { pitch: 1.0, rate: 0.95, female: true },
  },
  burak: {
    id: 'burak',
    name: L('Burak Demirtaş', 'Burak Demirtaş'),
    role: L('Hastanın oğlu', "Patient's son"),
    look: { height: 1.8, build: 1.0, skin: 0xcc9b7e, hair: 0x1c140f, hairStyle: 'short', beard: 'stubble', outfit: 'suit', age: 36 },
    voice: { pitch: 0.9, rate: 1.05, female: false },
  },
  ahmet: {
    id: 'ahmet',
    name: L('Ahmet Demirtaş', 'Ahmet Demirtaş'),
    role: L('Hasta, 67, KABG ×3 sonrası 1. gün', 'Patient, 67, day 1 after CABG ×3'),
    look: { height: 1.72, build: 1.05, skin: 0xc4a08e, hair: 0x9d9893, hairStyle: 'short', outfit: 'gown', age: 67 },
    voice: { pitch: 0.8, rate: 0.9, female: false },
  },
  guard: {
    id: 'guard',
    name: L('Hikmet Bey', 'Hikmet'),
    role: L('Güvenlik görevlisi', 'Security guard'),
    look: { height: 1.76, build: 1.15, skin: 0xbf8e70, hair: 0x2b2b2b, hairStyle: 'short', beard: 'moustache', outfit: 'guard', age: 55 },
    voice: { pitch: 0.8, rate: 1.0, female: false },
  },
  selin: {
    id: 'selin',
    name: L('Av. Selin Tuna', 'Selin Tuna (lawyer)'),
    role: L('Hastane hukuk müşaviri', 'Hospital legal counsel'),
    look: { height: 1.7, build: 0.9, skin: 0xdcae90, hair: 0x15100c, hairStyle: 'long', female: true, outfit: 'suit', age: 41 },
    voice: { pitch: 1.1, rate: 1.0, female: true },
  },
};

export function nameOf(id: string | null, lang: 'tr' | 'en'): string {
  if (!id) return '';
  return CAST[id]?.name[lang] ?? id;
}

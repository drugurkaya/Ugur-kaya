import { CAST } from '../characters/cast';
import type { Lang } from '../state/types';

/**
 * Optional spoken dialogue through the device's speech synthesiser (Web Speech API). No voice
 * acting ships with the game; quality depends on the voices installed on the device.
 */
export class Voice {
  enabled = false;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (!('speechSynthesis' in window)) return;
    const load = () => (this.voices = speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  get available() {
    return 'speechSynthesis' in window;
  }

  speak(text: string, speaker: string | null, lang: Lang) {
    if (!this.enabled || !this.available) return;
    this.stop();
    const clean = text.replace(/\([^)]*\)/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const tag = lang === 'tr' ? 'tr' : 'en';
    const pool = this.voices.filter((v) => v.lang.toLowerCase().startsWith(tag));
    const c = speaker ? CAST[speaker] : null;
    if (pool.length) {
      const female = c?.voice.female ?? false;
      const byGender = pool.filter((v) => (female ? /female|kadın|zira|yelda|samantha|karen/i : /male|erkek|daniel|alex|cem/i).test(v.name));
      u.voice = (byGender[0] ?? pool[0]) as SpeechSynthesisVoice;
    }
    u.lang = lang === 'tr' ? 'tr-TR' : 'en-GB';
    u.pitch = c?.voice.pitch ?? 1;
    u.rate = (c?.voice.rate ?? 1) * 1.02;
    u.volume = speaker ? 1 : 0.85;
    speechSynthesis.speak(u);
  }

  stop() {
    if (this.available) speechSynthesis.cancel();
  }
}

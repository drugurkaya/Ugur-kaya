import { clockOf } from '../core/time';
import { chooseEnding, evaluateLegal, type Ending, type LegalResult } from '../legal/LegalSystem';
import { applyAction } from '../medical/Patient';
import type { GameState } from '../state/GameState';
import { PATIENT_ID } from '../state/GameState';
import { L, hist } from '../narrative/content/helpers';

export type SceneId = 'bedroom' | 'car' | 'hospital' | 'or' | 'family' | 'evening' | 'office' | 'ending';

/** Area (3D environment) used by each scene. */
export const SCENE_AREA: Record<SceneId, string> = {
  bedroom: 'home',
  car: 'car',
  hospital: 'hospital',
  or: 'or',
  family: 'hospital',
  evening: 'hospital',
  office: 'office',
  ending: 'office',
};

export interface StoryHooks {
  goScene(scene: SceneId): void;
  startDialogue(id: string): void;
  showEnding(ending: Ending, legal: LegalResult): void;
  standUp?(): void;
  outfit?(o: string): void;
  anim?(a: string): void;
}

/**
 * Translates narrative actions into chapter/scene progression and the systemic consequences that
 * do not belong in dialogue data (delay evaluation, the legal review, the ending).
 */
export class Story {
  constructor(
    private state: GameState,
    private hooks: StoryHooks,
  ) {}

  action(name: string) {
    const s = this.state;
    const [verb, arg] = name.split(':');
    switch (verb) {
      case 'callEnded':
        s.data.chapter = 'ch2';
        if (!s.done('aylaWake')) {
          s.markDone('aylaWake');
          // Ayla's question follows the call once the dialogue closes.
          queueMicrotask(() => this.hooks.startDialogue('aylaWake'));
        }
        break;
      case 'standUp':
        this.hooks.standUp?.();
        break;
      case 'outfit':
        this.hooks.outfit?.(arg);
        break;
      case 'anim':
        this.hooks.anim?.(arg);
        break;
      case 'sleepUntilAlarm':
        this.sleepUntilAlarm();
        break;
      case 'scene':
        this.toScene(arg as SceneId);
        break;
      case 'ending':
        this.finish();
        break;
    }
  }

  private sleepUntilAlarm() {
    const s = this.state;
    const p = s.patient(PATIENT_ID);
    // Without the surgeon, the nurse escalates and the resident starts what she can.
    const covered = s.flag('ordersGiven') && s.flag('ordersGiven') !== 'dismiss';
    if (!covered) {
      s.advance(25);
      for (const a of ['fluidBolus', 'transfuseRBC', 'givePlasma', 'sendLabs'] as const) applyAction(p, a, Math.floor(s.clock));
      s.apply({ flags: { productsOrdered: true }, rel: { ece: -4 }, memory: [{ char: 'ece', key: 'leftAlone' }] });
    }
    const alarm = clockOf(6, 45);
    if (s.clock < alarm) s.advance(alarm - s.clock);
    s.apply({
      stats: { stress: 10 },
      message: { id: 'alarmMsgs', from: 'ece', text: L('Hocam, 5 kez aradık. Ahmet Bey OAB {map}. Lütfen hemen gelin.', 'We called you 5 times. Ahmet MAP {map}. Please come now.') },
      history: hist('self', 'Alarmla uyandın; telefonda cevapsız aramalar vardı.', 'You woke to the alarm and a screen full of missed calls.'),
      objective: 'getReady',
    });
  }

  toScene(scene: SceneId) {
    const s = this.state;
    switch (scene) {
      case 'car':
        s.data.chapter = 'ch2';
        break;
      case 'hospital':
        s.data.chapter = 'ch3';
        s.apply({ objective: 'goToIcu' });
        break;
      case 'or': {
        s.data.chapter = 'ch4';
        this.evaluateDelay();
        // Anaesthesia resuscitates on the way in: blood and plasma go in as the chest is opened.
        s.apply({ patient: { id: PATIENT_ID, actions: ['transfuseRBC', 'transfuseRBC', 'givePlasma', 'fluidBolus'] } });
        break;
      }
      case 'family':
        s.data.chapter = 'ch5';
        s.advance(10);
        break;
      case 'evening': {
        s.data.chapter = 'ch6';
        const t = clockOf(17, 40);
        if (s.clock < t) s.advance(Math.min(t - s.clock, 600));
        if (s.clock < t) s.skipTo(t);
        break;
      }
      case 'office': {
        s.data.chapter = 'ch7';
        s.skipTo(clockOf(10, 30, 21));
        this.applyLegal();
        break;
      }
    }
    s.data.scene = scene;
    this.hooks.goScene(scene);
    const start: Partial<Record<SceneId, string>> = { car: 'commute', or: 'or', family: 'family', evening: 'evening', office: 'epilogue' };
    const d = start[scene];
    if (d) queueMicrotask(() => this.hooks.startDialogue(d));
  }

  /** Time from the 05:12 call to definitive surgical control, judged against the hidden truth. */
  evaluateDelay() {
    const s = this.state;
    const p = s.patient(PATIENT_ID);
    if (p.truth === 'coagulopathy') return;
    const mins = Math.floor(s.clock) - p.callAt;
    s.data.flags.minutesToOR = mins;
    if (mins > 150) s.apply({ deviation: 'severeDelay' });
    else if (mins > 105) s.apply({ deviation: 'delayedDecision' });
  }

  applyLegal(): LegalResult {
    const s = this.state;
    const legal = evaluateLegal(s);
    s.apply({
      flags: {
        outcome: legal.outcome,
        'legal.complaint': legal.complaint,
        'legal.fault': legal.fault,
        'legal.clarity': legal.clarity,
        'legal.civil': legal.civil,
        'legal.criminal': legal.criminal,
        'legal.unavoidable': legal.unavoidable && legal.outcome !== 'recovered',
      },
    });
    const outcomeRep = { recovered: 4, complicated: 0, critical: -3, died: -5 }[legal.outcome];
    s.apply({ stats: { reputation: outcomeRep } });
    if (legal.complaint) {
      s.apply({
        stats: { stress: 10, reputation: legal.clarity === 'clear' ? -2 : legal.clarity === 'partial' ? -5 : -9 },
        history: hist('legal', 'Aile Hasta Hakları Birimine başvurdu; iç inceleme başladı.', 'The family applied to the Patient Rights Office; an internal review began.'),
      });
    }
    if (legal.fault === 'individual') s.apply({ stats: { reputation: -10, career: -8 } });
    if (legal.fault === 'serious') s.apply({ stats: { reputation: -20, career: -25, stress: 15 } });
    if (legal.civil === 'compensation') s.apply({ stats: { finance: -12 }, history: hist('legal', 'Tazminat davası açıldı.', 'A compensation case was filed.') });
    if (legal.criminal === 'noPermission') s.apply({ history: hist('legal', 'Mesleki Sorumluluk Kurulu soruşturma izni vermedi.', 'The Professional Responsibility Board refused investigation permission.') });
    if (legal.criminal === 'proceedings') s.apply({ history: hist('legal', 'Soruşturma izni verildi; ceza soruşturması başladı.', 'Investigation permission granted; a criminal investigation began.') });
    if (!legal.complaint && legal.outcome !== 'died') s.apply({ stats: { career: 3 } });
    return legal;
  }

  finish() {
    const s = this.state;
    s.data.chapter = 'ch8';
    const legal = evaluateLegal(s);
    const ending = chooseEnding(s, legal);
    s.apply({ flags: { ending }, history: hist('career', 'Hikâye sona erdi.', 'The story reached an ending.') });
    s.data.scene = 'ending';
    s.markDone('ending:' + ending);
    this.hooks.showEnding(ending, legal);
  }
}

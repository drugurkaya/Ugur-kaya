import { evaluateOutcome, hadUnavoidableComplication, type Outcome } from '../medical/Patient';
import type { GameState } from '../state/GameState';
import { PATIENT_ID } from '../state/GameState';
import type { LText } from '../state/types';

/**
 * Fictional, simplified model of how a complaint after a complication might unfold in Türkiye.
 * See docs/RESEARCH.md for the (secondary) sources consulted. NOT legal advice.
 *
 * Core principles encoded here (and covered by tests):
 *  1. A poor outcome alone never establishes fault: a known complication managed within the
 *     standard of care leads, at most, to a review that closes without fault.
 *  2. Fault requires a recorded deviation from expected practice AND, for harm-based claims,
 *     a plausible causal link between that deviation and the harm.
 *  3. Documentation does not change what happened, but it changes how clearly a review can
 *     establish what happened (and how long the process takes).
 *  4. Criminal proceedings require an investigation permission first (Law 3359, additional
 *     article 18, added by Law 7406 in 2022) and are only reached for serious, causal
 *     deviations. The game never sentences anyone; it ends at "proceedings opened".
 */

/** Weight of each standard-of-care deviation (clinical) or duty deviation (communication). */
export const DEVIATIONS: Record<string, { weight: number; clinical: boolean; label: LText }> = {
  declinedCallNoCover: {
    weight: 3,
    clinical: true,
    label: { tr: 'Yoğun bakım çağrısı reddedildi, yerine kimse yönlendirilmedi', en: 'ICU call declined with no cover arranged' },
  },
  dismissedNurse: {
    weight: 2,
    clinical: true,
    label: { tr: 'Hemşirenin endişesi değerlendirilmeden geçiştirildi', en: "Nurse's concern dismissed without assessment" },
  },
  delayedDecision: {
    weight: 2,
    clinical: true,
    label: { tr: 'Kesin müdahale kararı gecikti', en: 'Definitive intervention was delayed' },
  },
  severeDelay: {
    weight: 4,
    clinical: true,
    label: { tr: 'Kesin müdahale ciddi biçimde gecikti', en: 'Definitive intervention was severely delayed' },
  },
  skippedTimeOut: {
    weight: 1,
    clinical: true,
    label: { tr: 'Ameliyat öncesi ekip kontrolü (time-out) atlandı', en: 'Pre-incision team time-out skipped' },
  },
  noHandoff: {
    weight: 2,
    clinical: true,
    label: { tr: 'Postoperatif plan ekibe devredilmeden ayrılındı', en: 'Left without handing over the postoperative plan' },
  },
  noReadBack: {
    weight: 1,
    clinical: true,
    label: { tr: 'Telefon talimatları geri okutulmadı', en: 'Phone orders were not read back' },
  },
  noConsent: {
    weight: 2,
    clinical: false,
    label: { tr: 'Ulaşılabilir aileye rağmen aydınlatma/onam alınmadı', en: 'No informed consent although family was reachable' },
  },
  misleadingFamily: {
    weight: 2,
    clinical: false,
    label: { tr: 'Aileye komplikasyon hakkında yanıltıcı bilgi verildi', en: 'Family was misled about the complication' },
  },
  noOpNote: {
    weight: 1,
    clinical: false,
    label: { tr: 'Ameliyat notu ve zaman çizelgesi yazılmadı', en: 'Operative note and timeline not written' },
  },
};

export type Stage =
  | 'none'
  | 'patientRights'
  | 'internalReview'
  | 'compensationClaim'
  | 'criminalComplaint'
  | 'permissionDenied'
  | 'permissionGranted';

export interface LegalResult {
  outcome: Outcome;
  unavoidable: boolean;
  complaint: boolean;
  stages: Stage[];
  /** 'none' | 'systemOnly' | 'individual' | 'serious' */
  fault: 'none' | 'systemOnly' | 'individual' | 'serious';
  causal: boolean;
  clinicalScore: number;
  dutyScore: number;
  clarity: 'clear' | 'partial' | 'unclear';
  civil: 'none' | 'dismissed' | 'settled' | 'compensation';
  criminal: 'none' | 'noPermission' | 'proceedings';
  reviewMonths: number;
  deviations: string[];
  grievance: number;
}

export function evaluateLegal(state: GameState): LegalResult {
  const d = state.data;
  const p = state.patient(PATIENT_ID);
  const outcome = evaluateOutcome(p);
  const unavoidable = hadUnavoidableComplication(p);
  const devs = [...d.deviations];

  const clinicalScore = devs.reduce((s, k) => s + (DEVIATIONS[k]?.clinical ? DEVIATIONS[k].weight : 0), 0);
  const dutyScore = devs.reduce((s, k) => s + (DEVIATIONS[k] && !DEVIATIONS[k].clinical ? DEVIATIONS[k].weight : 0), 0);

  const harmed = outcome !== 'recovered';
  // Causation: a delay-type deviation only matters if the bleeding was of a kind that needed
  // definitive surgical control and the patient accumulated significant shock burden.
  const delayDevs = ['declinedCallNoCover', 'dismissedNurse', 'delayedDecision', 'severeDelay', 'noHandoff'];
  const hasDelayDev = devs.some((k) => delayDevs.includes(k));
  const causal = harmed && hasDelayDev && p.shockBurden > 70;

  const docScore = d.stats.documentation + d.goodPractice.length * 4 - (devs.includes('noOpNote') ? 15 : 0);
  const clarity: LegalResult['clarity'] = docScore >= 62 ? 'clear' : docScore >= 42 ? 'partial' : 'unclear';

  const severity = { recovered: 0, complicated: 22, critical: 42, died: 60 }[outcome];
  const sevim = state.affinity('sevim');
  let grievance = severity + dutyScore * 9 + (sevim < 0 ? 15 : 0) - (sevim > 30 ? 15 : 0);
  if (d.flags.honestDisclosure) grievance -= 18;
  if (d.flags.apologised) grievance -= 6;
  if (d.flags.familyUpdatedEarly) grievance -= 6;
  const complaint = grievance >= 30;

  let fault: LegalResult['fault'] = 'none';
  if (clinicalScore >= 6 && causal) fault = 'serious';
  else if (clinicalScore >= 3 && causal) fault = 'individual';
  else if (clinicalScore > 0 || dutyScore > 0) fault = 'systemOnly';

  const stages: Stage[] = [];
  let civil: LegalResult['civil'] = 'none';
  let criminal: LegalResult['criminal'] = 'none';
  let reviewMonths = 0;
  if (complaint) {
    stages.push('patientRights', 'internalReview');
    reviewMonths = clarity === 'clear' ? 1 : clarity === 'partial' ? 3 : 6;
    if (outcome === 'critical' || outcome === 'died' || dutyScore >= 4) {
      stages.push('compensationClaim');
      if (fault === 'individual' || fault === 'serious') civil = 'compensation';
      else if (dutyScore >= 2) civil = 'settled';
      else civil = 'dismissed';
    }
    if ((outcome === 'died' || outcome === 'critical') && grievance >= 55) {
      stages.push('criminalComplaint');
      if (fault === 'serious') {
        stages.push('permissionGranted');
        criminal = 'proceedings';
      } else {
        stages.push('permissionDenied');
        criminal = 'noPermission';
      }
    }
  }
  return { outcome, unavoidable, complaint, stages, fault, causal, clinicalScore, dutyScore, clarity, civil, criminal, reviewMonths, deviations: devs, grievance };
}

export type Ending = 'serious' | 'legalResolved' | 'crisisRecovery' | 'familyStrain' | 'success' | 'balanced';

export function chooseEnding(state: GameState, legal: LegalResult): Ending {
  const s = state.data.stats;
  if (legal.criminal === 'proceedings' || legal.fault === 'serious') return 'serious';
  if (legal.stages.includes('compensationClaim')) return 'legalResolved';
  if (legal.complaint) return 'crisisRecovery';
  if (s.family < 40) return 'familyStrain';
  if (s.reputation >= 66 && s.teamTrust >= 60) return 'success';
  return 'balanced';
}

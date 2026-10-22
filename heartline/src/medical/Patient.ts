import { clamp, seededRoll } from '../core/rng';
import type { LText, PatientAction, PatientHidden, PatientMetric, PatientSnapshot } from '../state/types';

/**
 * A deliberately simplified physiological model of a patient bleeding after cardiac surgery.
 *
 * It is a game model, not a clinical simulator: numbers are tuned so that the *shape* of each
 * scenario is credible (falling pressure, rising heart rate, drain trends, lactate) and so that
 * timely, reasoned action matters. It has not been validated by clinicians.
 *
 * Hidden truths (the player never sees this label directly):
 *  - 'surgical'     – a surgical bleeding point; products help a little, only re-exploration fixes it.
 *  - 'coagulopathy' – diffuse non-surgical bleeding; correcting coagulation and temperature fixes it.
 *  - 'tamponade'    – a slower bleed whose drains clot; visible drainage falls while the heart is
 *                      compressed. Falling drain output looks like improvement – the classic trap.
 */
export type Truth = 'surgical' | 'coagulopathy' | 'tamponade';
export const TRUTHS: Truth[] = ['surgical', 'coagulopathy', 'tamponade'];

export function pickTruth(seed: number): Truth {
  const r = seededRoll(seed, 7);
  if (r < 0.45) return 'surgical';
  if (r < 0.75) return 'coagulopathy';
  return 'tamponade';
}

type Hidden = PatientHidden;

const BASE_MAP = 76;

export function createPatient(id: string, seed: number, callAt: number, truth?: Truth): PatientSnapshot {
  const t = truth ?? pickTruth(seed);
  const coag = t === 'coagulopathy';
  const p: PatientSnapshot = {
    id,
    truth: t,
    map: 62,
    hr: 108,
    cvp: t === 'tamponade' ? 12 : 9,
    drainRate: 220,
    drainTotal: 980,
    hb: 8.6,
    lactate: 2.6,
    temp: 35.8,
    inr: coag ? 1.9 : 1.3,
    platelets: coag ? 68 : 124,
    shockBurden: 0,
    bleedingControlled: false,
    coagCorrected: false,
    reExplored: false,
    reExploredAt: null,
    callAt,
    echoDone: false,
    labsSent: false,
    orReady: false,
    arrested: false,
    interventions: [],
    lastSim: callAt,
    outcome: null,
    seed,
    hidden: {
      deficit: 280,
      retained: t === 'tamponade' ? 70 : 0,
      hypoMinutes: 0,
      productsAt: null,
      drainEma: 220 / 60,
      clotted: false,
      stripAt: null,
      pressorOn: false,
      hbNadir: 8.6,
    },
  };
  derive(p, p.hidden);
  return p;
}

function readHidden(p: PatientSnapshot): Hidden {
  return p.hidden;
}
function writeHidden(p: PatientSnapshot, h: Hidden) {
  p.hidden = h;
}

export function visibleInterventions(p: PatientSnapshot): string[] {
  return p.interventions;
}

function count(p: PatientSnapshot, a: PatientAction): number {
  return p.interventions.filter((s) => s.startsWith(a + '@')).length;
}

/** Recompute the observable vitals from hidden state. */
function derive(p: PatientSnapshot, h: Hidden) {
  const tamp = Math.pow(Math.max(0, h.retained) / 100, 2) * 6;
  const pressor = h.pressorOn ? 7 : 0;
  const cold = p.temp < 36 ? 2 : 0;
  let map = BASE_MAP - h.deficit * 0.05 - tamp + pressor - cold;
  if (p.arrested) map = Math.min(map, 30);
  p.map = Math.round(clamp(map, 22, 96));
  p.hr = Math.round(clamp(84 + (BASE_MAP - p.map) * 1.0 + (p.temp < 36 ? -3 : 0), 60, 158));
  p.cvp = Math.round(clamp(9 - h.deficit * 0.005 + h.retained * 0.035, 2, 26));
  p.drainRate = Math.round(h.drainEma * 60);
}

/** Bleeding rate in ml/min split into surgical and coagulopathic components. */
function bleedRate(p: PatientSnapshot, h: Hidden, now: number): number {
  const since = now - p.callAt;
  let surgical = 0;
  let coag = 0;
  if (p.truth === 'surgical') {
    surgical = 4.2 + since * 0.04;
    coag = 0.8;
  } else if (p.truth === 'coagulopathy') {
    coag = 3.4;
  } else {
    surgical = 2.0;
    coag = 0.5;
  }
  if (p.bleedingControlled) surgical = 0;
  // Coagulation products take ~30 game minutes to thaw, give and act.
  let coagFactor = 1;
  if (p.coagCorrected) coagFactor = 0.12;
  else if (h.productsAt !== null) {
    const ramp = clamp((now - h.productsAt) / 30, 0, 1);
    const strength = clamp(
      (count(p, 'givePlasma') + count(p, 'givePlatelets') + count(p, 'giveProtamine') + count(p, 'giveTranexamic') + count(p, 'warmPatient')) / 4,
      0,
      1,
    );
    coagFactor = 1 - ramp * strength * 0.85;
  }
  return surgical + coag * coagFactor;
}

/** Advance the simulation to `now` (absolute game minutes), one minute at a time. */
export function simulate(p: PatientSnapshot, now: number) {
  if (p.outcome) return;
  const h = readHidden(p);
  let t = p.lastSim;
  while (t + 1 <= now) {
    t += 1;
    const bleed = bleedRate(p, h, t);
    // Drains in the tamponade scenario clot ~20 minutes after the call; stripping buys ~10 minutes.
    if (p.truth === 'tamponade' && !p.bleedingControlled) {
      const sinceStrip = h.stripAt === null ? Infinity : t - h.stripAt;
      h.clotted = t - p.callAt > 25 && sinceStrip > 10;
    } else h.clotted = false;
    const visibleFrac = h.clotted ? 0.12 : p.truth === 'tamponade' ? 0.75 : 0.97;
    const visible = bleed * visibleFrac;
    h.retained += bleed - visible;
    if (p.bleedingControlled) h.retained = 0;
    h.drainEma += (visible - h.drainEma) * 0.06;
    p.drainTotal += visible;
    h.deficit += bleed;
    // Once the cause is controlled, the ICU team transfuses and fills to targets.
    if (p.bleedingControlled || p.coagCorrected) h.deficit = Math.max(0, h.deficit - 3);
    p.hb = clamp(p.hb - bleed * 0.0011, 4.5, 16);
    h.hbNadir = Math.min(h.hbNadir, p.hb);
    // Passive cooling until warmed.
    if (count(p, 'warmPatient') > 0) p.temp = Math.min(36.8, p.temp + 0.01);
    derive(p, h);
    if (p.map < 65) {
      p.lactate = clamp(p.lactate + (65 - p.map) * 0.004, 0.6, 15);
      p.shockBurden += (65 - p.map) / 6;
    } else p.lactate = clamp(p.lactate - 0.012, 0.8, 15);
    // Sustained profound hypotension leads to cardiac arrest.
    h.hypoMinutes = p.map < 38 ? h.hypoMinutes + 1 : 0;
    if (!p.arrested && h.hypoMinutes >= 4) {
      p.arrested = true;
      p.interventions.push(`arrest@${t}`);
      p.shockBurden += 25;
    }
  }
  p.lastSim = Math.max(p.lastSim, t);
  writeHidden(p, h);
}

/** Apply a medical action at time `now`. Returns a short localised result description. */
export function applyAction(p: PatientSnapshot, a: PatientAction, now: number): LText | null {
  simulate(p, now);
  const h = readHidden(p);
  p.interventions.push(`${a}@${now}`);
  let res: LText | null = null;
  switch (a) {
    case 'fluidBolus':
      h.deficit = Math.max(0, h.deficit - 180);
      break;
    case 'transfuseRBC':
      h.deficit = Math.max(0, h.deficit - 250);
      p.hb = clamp(p.hb + 0.9, 4.5, 16);
      break;
    case 'givePlasma':
      h.deficit = Math.max(0, h.deficit - 160);
      if (h.productsAt === null) h.productsAt = now;
      p.inr = Math.max(1.15, p.inr - 0.3);
      break;
    case 'givePlatelets':
      if (h.productsAt === null) h.productsAt = now;
      p.platelets += 35;
      break;
    case 'giveProtamine':
    case 'giveTranexamic':
      if (h.productsAt === null) h.productsAt = now;
      break;
    case 'warmPatient':
      if (h.productsAt === null) h.productsAt = now;
      break;
    case 'startVasopressor':
      h.pressorOn = true;
      break;
    case 'stripDrains':
      h.stripAt = now;
      if (p.truth === 'tamponade' && h.retained > 30) {
        const evac = Math.min(h.retained, 120);
        h.retained -= evac;
        p.drainTotal += evac;
        h.drainEma += evac / 20;
        res = {
          tr: `Drenler sağıldı: ~${Math.round(evac)} ml pıhtılı kan geldi.`,
          en: `Drains stripped: ~${Math.round(evac)} ml of clotted blood came out.`,
        };
      } else res = { tr: 'Drenler açık, belirgin pıhtı yok.', en: 'Drains are patent, no significant clot.' };
      break;
    case 'bedsideEcho':
      p.echoDone = true;
      res = echoFinding(p, h);
      break;
    case 'sendLabs':
      p.labsSent = true;
      break;
    case 'orTeamMobilised':
      p.orReady = true;
      break;
    case 'reExplore':
      p.reExplored = true;
      if (p.reExploredAt === null) p.reExploredAt = now;
      h.retained = 0;
      if (p.truth !== 'coagulopathy') p.bleedingControlled = true;
      p.arrested = false;
      h.deficit = Math.max(0, h.deficit - 300);
      break;
    case 'definitiveRepair':
      p.bleedingControlled = true;
      h.retained = 0;
      break;
    case 'minorInsult':
      p.shockBurden += 15;
      break;
    case 'majorInsult':
      p.shockBurden += 35;
      break;
    case 'correctCoagulopathy':
      p.coagCorrected = true;
      p.inr = 1.2;
      p.platelets = Math.max(p.platelets, 140);
      break;
  }
  derive(p, h);
  writeHidden(p, h);
  return res;
}

function echoFinding(_p: PatientSnapshot, h: Hidden): LText {
  if (h.retained > 60)
    return {
      tr: 'Eko: Sağ atriyum ve sağ ventrikülü bası altında bırakan perikardiyal pıhtı. Tamponat ile uyumlu.',
      en: 'Echo: pericardial clot compressing the right atrium and right ventricle. Consistent with tamponade.',
    };
  return {
    tr: 'Eko: Belirgin perikardiyal koleksiyon yok. Sol ventrikül küçük ve hiperdinamik; hipovolemi ile uyumlu.',
    en: 'Echo: no significant pericardial collection. Small, hyperdynamic left ventricle; consistent with hypovolaemia.',
  };
}

/** Lab panel as the ICU would report it. */
export function labReport(p: PatientSnapshot): LText {
  const fib = p.truth === 'coagulopathy' && !p.coagCorrected ? 1.3 : 2.4;
  return {
    tr: `Hb ${p.hb.toFixed(1)} g/dL · INR ${p.inr.toFixed(1)} · Trombosit ${Math.round(p.platelets)} bin · Fibrinojen ${fib.toFixed(1)} g/L · Laktat ${p.lactate.toFixed(1)} mmol/L`,
    en: `Hb ${p.hb.toFixed(1)} g/dL · INR ${p.inr.toFixed(1)} · Platelets ${Math.round(p.platelets)}k · Fibrinogen ${fib.toFixed(1)} g/L · Lactate ${p.lactate.toFixed(1)} mmol/L`,
  };
}

export function metric(p: PatientSnapshot, m: PatientMetric, now: number): number {
  if (m === 'minutesSinceCall') return now - p.callAt;
  return p[m];
}

export type Outcome = 'recovered' | 'complicated' | 'critical' | 'died';

/**
 * Final outcome. Combines physiological burden with a seeded roll for complications that can
 * happen even with excellent care – so a bad outcome is not automatically somebody's fault.
 */
export function evaluateOutcome(p: PatientSnapshot): Outcome {
  if (p.outcome) return p.outcome as Outcome;
  const burden = p.shockBurden + (p.arrested ? 30 : 0);
  const unavoidable = seededRoll(p.seed, 31) < 0.1;
  let o: Outcome;
  if (burden > 260) o = 'died';
  else if (burden > 150) o = 'critical';
  else if (burden > 70 || unavoidable) o = 'complicated';
  else o = 'recovered';
  // An unavoidable complication can also worsen an otherwise moderate course.
  if (unavoidable && o === 'complicated' && burden > 110) o = 'critical';
  p.outcome = o;
  return o;
}

/** Was the complicated outcome unavoidable (seeded), independent of the team's actions? */
export function hadUnavoidableComplication(p: PatientSnapshot): boolean {
  return seededRoll(p.seed, 31) < 0.1;
}

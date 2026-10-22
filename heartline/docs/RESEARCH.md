# HEARTLINE — Research notes

Research date: **2026-10-22**. This file records what was consulted, what each source says (as far
as it could be verified), and how it was adapted. The same list is shown in-game under
*Journal → Sources* (`src/medical/research.ts`).

## How the research was done (and its limits)

- **PubMed** (via the PubMed connector): bibliographic metadata and abstracts were retrieved for
  the peer-reviewed articles below. Statements about them come from their abstracts.
- **Web search**: used to identify AHRQ PSNet, CORESS, AHRQ CANDOR and Turkish legal sources.
- **Direct page fetching was blocked** in this environment (`psnet.ahrq.gov`, `mevzuat.gov.tr`,
  `ncbi.nlm.nih.gov` and several law sites were refused by the network proxy). For those sources,
  only titles, dates, authors and short excerpts returned by the search engine were available;
  the full texts were **not** read. Where that matters it is marked below.
- No source was invented. No real patient, hospital or event is depicted. The hospital
  ("Yeşilvadi Eğitim ve Araştırma Hastanesi"), all characters and the case are fictional.
- **Clinical content must be reviewed by qualified clinicians** (cardiac surgery, cardiac
  anaesthesia, intensive care) before being presented as authoritative. **Legal content must be
  reviewed by a lawyer** practising Turkish medical law.

## Medical and patient-safety sources

| # | Source | Organisation / journal | Date | URL | Main safety lessons | How it is used in the game |
|---|---|---|---|---|---|---|
| 1 | Re-exploration for bleeding or tamponade after cardiac surgery: impact of timing and indication on outcome (Haneya et al.) | Thorac Cardiovasc Surg 63(1):51–57 | online 2014-09-29 | https://doi.org/10.1055/s-0034-1390154 | 209 re-explored patients: mortality 5.3% if re-explored within 12 h vs 20.3% after 12 h; 3.6% for bleeding vs 31.4% for tamponade as the indication; blood loss and transfusion were independent risk factors. | Outcome in the patient model depends on time to definitive control and accumulated shock burden; tamponade is its own, more dangerous scenario. |
| 2 | Re-exploration for bleeding or tamponade after cardiac operation (Čanádyová et al.) | Interact Cardiovasc Thorac Surg 14(6):704–707 | 2012-03-20 | https://doi.org/10.1093/icvts/ivs087 | 3.4% re-explored; an identifiable bleeding source in 72.4%; delayed resternotomy, higher lactate and lower haematocrit associated with mortality. | Lactate and Hb are visible indicators; not every re-exploration finds a surgical source. |
| 3 | Postoperative revision surgery for bleeding in a tertiary heart center (Mataracı et al., Kartal Koşuyolu, İstanbul) | Asian Cardiovasc Thorac Ann 18(3):266–271 | 2010-06 | https://doi.org/10.1177/0218492310369030 | 19,680 operations; half of re-explored patients had non-surgical bleeding; delayed reoperation predicted mortality and morbidity. | The surgical vs coagulopathic distinction is reached through information gathering (labs, echo, drains). A Turkish centre's experience grounds the setting. |
| 4 | Re-exploration after off-pump CABG: incidence, risk factors, and impact of timing (Patel et al.) | J Card Surg 35(11):3062–3069 | 2020-09-16 | https://doi.org/10.1111/jocs.14986 | Re-exploration >14 h: mortality 30.6% vs 7.3%. | Every minute at home and on the road runs in the simulation. |
| 5 | The Society of Thoracic Surgeons Expert Consensus for the Resuscitation of Patients Who Arrest After Cardiac Surgery | Ann Thorac Surg 103(3):1005–1020 | online 2017-01-22 | https://doi.org/10.1016/j.athoracsur.2016.10.033 | VF: three sequential defibrillation attempts before external massage; external massage ineffective in tamponade/hypovolaemia, so emergency resternotomy within 5 minutes; full-dose epinephrine not routine. | The intra-operative VF card (internal paddles first is the guideline-concordant choice; adrenaline first causes an insult and Dr. Murat objects) and the ICU arrest branch (open at the bedside vs continued external CPR). |
| 6 | A surgical safety checklist to reduce morbidity and mortality in a global population (Haynes et al.) | N Engl J Med 360(5):491–499 | 2009-01-14 | https://doi.org/10.1056/NEJMsa0810119 | After the WHO checklist, death 1.5% → 0.8% and complications 11.0% → 7.0% (non-cardiac surgery). | The time-out card in the OR: a full time-out builds team trust and documentation; skipping it when the patient is not in extremis is a recorded deviation. |
| 7 | Hemorrhagic Shock after Elective Spine Surgery: Failure to Rescue after Limited Response to Nursing Concerns (Spotlight Case; Zakaluzny et al.) | AHRQ PSNet WebM&M | 2024-07-10 | https://psnet.ahrq.gov/web-mm/hemorrhagic-shock-after-elective-spine-surgery-failure-rescue-after-limited-response-nursing | From the search excerpt: failure to rescue linked to a limited response to nurses' concerns and delayed recognition of shock. **Full text not read** (fetch blocked). Not a cardiac case; the escalation principle generalises. | Dismissing the nurse at 05:12 is a recorded deviation; Zeynep remembers it and escalates through the resident on her own. |
| 8 | CORESS Feedback: Cases from the Confidential Reporting System for Surgery | Ann R Coll Surg Engl (CORESS) | 2025-05-01 | https://doi.org/10.1308/rcsann.2025.0029 | From search excerpts: confidential, specialty-specific learning from incidents; equipment- and communication-related lessons (e.g. checking unfamiliar equipment). **Full text not read.** No cardiac-specific CORESS case could be verified. | Equipment readiness (pump priming, cell saver) as decisions in the OR. No CORESS case is reproduced. |
| 9 | Communication and Optimal Resolution (CANDOR) Toolkit — Module 5: Response and Disclosure | AHRQ | 2016-05 | https://www.ahrq.gov/patient-safety/settings/hospital/candor/modules/guide5/notes.html | From search excerpts: response and disclosure should begin early (within 60 minutes of identifying an event) and continue; apology and empathy are components. | Chapter 5 family meeting: honest disclosure and apology lower the family's grievance; misleading the family is a recorded deviation. |

Other literature seen during the search but not used: delayed sternal closure protocols
(doi:10.23736/S0021-9509.24.13024-8), RVAD case series (doi:10.1111/aor.14853), Impella bridge to
surgery (doi:10.1093/icvts/ivac088), delayed extubation after type A dissection
(doi:10.21037/jtd-20-742).

### Clinical simplifications (to be reviewed)

- Bleeding rates, the MAP response to deficit and products, the 30-minute product ramp, clotting
  of drains after ~25 minutes, the arrest threshold (MAP < 38 for 4 min) and outcome thresholds
  are **game tuning**, not physiology from a source.
- Lab panels show INR, platelets, fibrinogen, Hb and lactate; ROTEM/TEG is named but not
  simulated.
- The 105/150-minute "delay" thresholds used for the review are a gameplay device informed by the
  timing literature above, not a standard of care.

## Turkish legal framework (fictional adaptation)

| Topic | Source | What could be verified | Use in the game |
|---|---|---|---|
| Investigation permission for health professionals | 3359 sayılı Sağlık Hizmetleri Temel Kanunu, **Ek Madde 18**, added by Law 7406 art. 14 (12.05.2022) | Secondary sources (law-news site, Lexpera, a July 2026 news item) describe: investigations of health professionals for medical procedures are subject to Law 4483 procedures; permission is granted by the **Mesleki Sorumluluk Kurulu** within the Ministry of Health; Article 7 time limits apply doubled; appeals go to the **Ankara Bölge İdare Mahkemesi**. **The official text on mevzuat.gov.tr could not be fetched.** | A criminal complaint first reaches the permission stage; permission is refused unless the review found serious, causal fault. |
| Regulation on investigation and recourse of compensation | "Sağlık Meslek Mensuplarının Tıbbi İşlem ve Uygulamaları Nedeniyle Soruşturulmasına ve İdarece Ödenen Tazminatların Rücu Edilmesine…" Yönetmelik (title from Lexpera) | Only the title and its basis in Law 3359 were visible. | If the administration pays compensation it "may seek recourse" — stated as a possibility, not an outcome. |
| Criminal liability | TCK 5237 art. 85 (negligent homicide) and art. 89 (negligent injury); legal literature, e.g. TBB Dergisi "Tıbbi hatanın hukuki ve cezai sonuçları" | Secondary sources: liability requires negligence (*taksir*) and causation (*illiyet bağı*); a complication not preventable with current medical knowledge is generally not physician fault; expert (*bilirkişi*) reports are decisive. | `LegalSystem` requires deviation + causation for fault; the game never sentences anyone. |
| Informed consent burden | Secondary source citing Yargıtay 13. HD, 11.4.2013, E. 2013/2273, K. 2013/9491 | The citation could **not** be verified against the court's own records. | Not consenting a reachable family before a non-emergency re-operation is a duty deviation; emergencies (MAP < 48) are exempt. |
| Compulsory malpractice insurance | Kadir Has University thesis (2020) on *Tıbbi Kötü Uygulamaya İlişkin Zorunlu Mali Sorumluluk Sigortası* (1219 sayılı Kanun ek md. 12) | Only the abstract was visible. | Mentioned as background only; insurance mechanics are not modelled. |

### Legal simplifications

- The public/private hospital distinction (administrative vs civil courts), mediation, limitation
  periods, professional-association discipline, insurance and actual compensation amounts are not
  modelled.
- The stage list (patient-rights office → internal review → compensation claim → criminal
  complaint → permission) is a narrative compression, not a procedural guide.
- **Nothing in the game is legal advice.**

# HEARTLINE — Architecture

## Principles

1. **Data-driven story.** All narrative content lives in `src/narrative/content/*.ts` as typed data
   (dialogues → nodes → lines/choices with conditions and effects). The engine never contains
   story text.
2. **One mutable state, one door.** `GameState.data` is plain JSON (it *is* the save file). Systems
   change it only through `GameState.apply(effect)`, so every change can schedule consequences,
   write history and be saved.
3. **Simulation separate from presentation.** The patient model, consequences, legal review,
   narrative engine and story director run without a browser and are unit-tested in Node.
4. **Presentation is replaceable.** Areas, characters, UI and audio read state; none of them own
   rules.

## Module map

```
            ┌──────────── content/*.ts (dialogue data, TR+EN) ────────────┐
            ▼                                                              │
   NarrativeEngine ──apply(effect)──► GameState ◄──── Story (director) ────┘
        │   ▲                           │  ▲  │            │
        │   │ check(cond)               │  │  └─ pending consequences fire on advance()/skipTo()
        │   └───────────────────────────┘  │
        │                                  ├── medical/Patient.ts  (simulate per game minute)
        │                                  └── legal/LegalSystem.ts (evaluate at the epilogue)
        ▼
   Game (main loop) ── Areas (Home, Car, Hospital, OR, Office) ── Character (rig + face)
        │            └─ Renderer / CameraRig / Screens
        ├── UI (menu, HUD, dialogue & decision cards, phone, journal, settings, slots, ending)
        ├── Audio (procedural) / Voice (optional TTS)
        └── SaveSystem (localStorage: auto + 3 slots; settings stored separately)
```

## Narrative data model (`src/narrative/types.ts`)

- `Dialogue { id, start, nodes }`
- `Node { lines?, choices?, next?, onEnter?, card?, timer?, timeoutChoice?, action?, redirect? }`
  - `card` renders the choices as **decision cards** with a title and live context
    (`{map}`, `{drain}`, `{labs}`… are interpolated from the patient model).
  - `timer` gives a decision timer; `NarrativeEngine.timerFor()` shortens it with stress. On
    timeout the node's `timeoutChoice` is taken and the hesitation is logged.
  - `redirect` routes on entry (e.g. to the arrest branch if the patient has arrested).
  - `action` is a director hook (`scene:or`, `callEnded`, `standUp`, `ending`…). It fires after the
    node's lines, or on entry for nodes with choices.
- `Line { speaker, text, expr, selfExpr, shot, cond, sfx }` — expressions drive the face rig,
  `shot` names a camera shot.
- `Choice { text, detail, tags, showIf, cond, lockedReason, effects, next, action }` — `cond`
  shows a choice **locked** with a reason (fatigue, team trust), `showIf` hides it.

### Conditions and effects (`src/state/types.ts`)

Conditions: `all/any/not`, `flag`, `stat` range, `rel` (affinity) range, `memory`, `patient`
metric range, hidden `truth`, clock before/after.

Effects: stat deltas, relationship deltas, flags/counters, minutes consumed, patient actions,
memories, history entries, phone messages, **scheduled consequences** (`schedule: [{ inMinutes,
cond, effects }]`, re-checked when due), objective, recorded `deviation` / `goodPractice`
(evidence for the legal review).

## Time

The game clock is in minutes since 00:00 on day 0. It advances by effects (`minutes`), while
exploring (0.12 game minutes per real second), and by scene jumps. `GameState.advance()` runs the
patient simulation minute by minute and fires due consequences; `skipTo()` (for "three weeks
later") fires consequences without simulating the patient.

## Patient model (`src/medical/Patient.ts`)

Hidden state: blood-volume deficit, retained pericardial blood, drain output EMA, product
timing, vasopressor, hypotension minutes. Observable vitals (MAP, HR, CVP, drain rate, Hb,
lactate, temperature, INR, platelets) are derived each minute. Shock burden accumulates while
MAP < 65; sustained MAP < 38 causes arrest. Actions (fluids, products, protamine, TXA, warming,
echo, drain stripping, labs, OR mobilisation, re-exploration, repair, coagulopathy correction)
change the hidden state. The outcome combines burden with a **seeded unavoidable complication**
roll, so a poor outcome can happen without anyone being at fault. `tests/balance.test.ts` pins
the intended behaviour (timely care → survivable; long delay in surgical bleeding → critical/died).

## Legal review (`src/legal/LegalSystem.ts`)

Inputs: recorded deviations (clinical vs duty), causation (delay-type deviation **and** harm
**and** shock burden), documentation clarity, family grievance (outcome severity, duty
deviations, honesty, apology, early contact, affinity). Output: complaint yes/no, stages
(patient-rights office → internal review → compensation claim → criminal complaint →
permission refused/granted), fault level, civil and criminal results, review duration. Tests
enforce: outcome alone ≠ fault; deviation without causation ≠ individual fault; prosecution only
via the permission stage; documentation changes clarity, not facts.

## Characters

`Character` builds a hierarchical rig (hips → spine → chest → neck → head, shoulders → forearms
→ hands, thighs → shins → feet) from primitives with outfit materials. Poses are target joint
rotations blended with exponential damping. The face rig has eyelids (blink + expression),
brows (raise + inner raise), mouth (corners, lips, jaw, talking), cheeks, forehead lines and gaze.
Expressions: neutral, sleep, drowsy, worried, alarmed, focused, sad, smile, angry, tired, relieved.

## Rendering

`Renderer` applies a preset (`src/core/Settings.ts → PRESETS`): pixel-ratio cap, shadows and map
size, post-processing (bloom on Quality, a grading pass on Balanced/Quality: vignette tightening
with stress, a red pulse at high stress, split-toning, grain), reflections (a real mirror on
Quality). `MATERIAL_LEVEL` switches materials globally: Lambert on Performance (≈4× faster in
software rendering), Standard on Balanced, Physical (clearcoat, sheen, transmission) on Quality.
Each area sets its own tone-mapping exposure.

`CameraRig` is a third-person orbit with wall avoidance (rises instead of entering the character)
plus named cinematic shots that are re-solved every few frames so they follow moving characters.

## Saving (`src/state/Save.ts`)

`localStorage` keys `heartline-save-v1-{auto,slot1,slot2,slot3}`; versioned and validated on
load (corrupt or old saves are ignored). Autosaves: after the first decision, at every scene
change, at the ending. Manual saves are blocked during dialogue, ringing or transitions so a save
never lands in the middle of a node. Loading restarts the current scene's opening dialogue from
the saved state (scene effects were applied before the autosave, so nothing is applied twice).

## Adding content

1. Write a `Dialogue` in `src/narrative/content/` (both languages for every string).
2. Register it in `content/index.ts`.
3. Trigger it from an `Interactable` (`dialogue: 'id'`), a scene start (`Story.toScene`), a phone
   reply, or another dialogue's `action`.
4. `npm test` checks that every node reference resolves, every string is bilingual and every
   `scene:` action names a real scene.

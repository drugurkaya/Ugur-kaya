import type { Condition, Effect, LText } from '../state/types';

/** Facial expressions supported by the character face rig. */
export type Expression =
  | 'neutral'
  | 'sleep'
  | 'drowsy'
  | 'worried'
  | 'alarmed'
  | 'focused'
  | 'sad'
  | 'smile'
  | 'angry'
  | 'tired'
  | 'relieved';

export interface Line {
  /** Character id, 'self' (protagonist), or null for narration. */
  speaker: string | null;
  text: LText;
  /** Expression for the speaker while this line is shown. */
  expr?: Expression;
  /** Expression for the protagonist while this line is shown (e.g. reacting to news). */
  selfExpr?: Expression;
  /** Named camera shot the director should cut to. */
  shot?: string;
  /** Skip the line unless this holds. */
  cond?: Condition;
  /** Sound cue id played when the line appears. */
  sfx?: string;
}

export type ChoiceTag = 'time' | 'risk' | 'team' | 'family' | 'care' | 'self' | 'record' | 'money' | 'career';

export interface Choice {
  id: string;
  text: LText;
  /** Second line on a decision card: what this choice means in practice. */
  detail?: LText;
  tags?: ChoiceTag[];
  /** Choice hidden unless this holds. */
  showIf?: Condition;
  /** Choice shown but locked unless this holds (e.g. exhaustion removes options). */
  cond?: Condition;
  lockedReason?: LText;
  effects?: Effect;
  next: string | null;
  /** Director hook fired after effects, e.g. 'scene:hospital'. */
  action?: string;
}

export interface Node {
  id: string;
  lines?: Line[];
  choices?: Choice[];
  /** Next node after the lines when there are no choices; null ends the dialogue. */
  next?: string | null;
  onEnter?: Effect;
  /** Render choices as decision cards with a title. */
  card?: { title: LText; context?: LText };
  /** Decision timer in seconds; the protagonist's stress shortens it. */
  timer?: number;
  timeoutChoice?: string;
  /** Director hook: fired after the node's lines (or on entry if the node has choices). */
  action?: string;
  /** Route to another node immediately if this condition holds (evaluated on enter). */
  redirect?: { cond: Condition; to: string }[];
}

export interface Dialogue {
  id: string;
  start: string;
  nodes: Record<string, Node>;
}

import type { Action, Settings } from './Settings';

const GAMEPAD_BUTTONS: Partial<Record<Action, number[]>> = {
  lp: [2],
  hp: [3],
  lk: [0],
  hk: [1],
  block: [5, 6],
  dodge: [4],
  special: [7],
  pause: [9],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
};

export interface ActionFrame {
  /** Screen-relative movement: x = right, y = up (into the screen). */
  moveX: number;
  moveY: number;
  held: Set<Action>;
  pressed: Set<Action>;
}

/**
 * Keyboard + gamepad input. Presses are edge-triggered and queued until the
 * next simulation step consumes them, so OS key-repeat never retriggers an
 * attack and no press is lost between fixed steps.
 */
export class Input {
  private held = new Set<string>();
  private queued = new Set<Action>();
  private padPrev: boolean[] = [];
  private capture: ((code: string) => void) | null = null;
  private settings: Settings;
  /** Last device used, for UI prompts. */
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  /** UI-level listeners (menus) receive raw action presses. */
  onAction: ((a: Action) => void) | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Capture the next key for rebinding. */
  captureNextKey(cb: (code: string) => void): void {
    this.capture = cb;
  }

  private actionFor(code: string): Action | null {
    const b = this.settings.data.bindings;
    for (const k in b) if (b[k as Action] === code) return k as Action;
    return null;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.capture) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    const a = this.actionFor(e.code);
    if (a) {
      // Keep the browser from scrolling with Space etc. while playing.
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    }
    if (e.repeat) return;
    this.lastDevice = 'keyboard';
    this.held.add(e.code);
    if (a) {
      this.queued.add(a);
      this.onAction?.(a);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private isHeld(a: Action, pad: Gamepad | null): boolean {
    if (this.held.has(this.settings.data.bindings[a])) return true;
    if (pad) {
      const ids = GAMEPAD_BUTTONS[a];
      if (ids) for (const i of ids) if (pad.buttons[i]?.pressed) return true;
    }
    return false;
  }

  private getPad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  /** Poll gamepad edges; call once per rendered frame. */
  pollGamepad(): void {
    const pad = this.getPad();
    if (!pad) return;
    const now = pad.buttons.map((b) => b.pressed);
    for (const [a, ids] of Object.entries(GAMEPAD_BUTTONS) as [Action, number[]][]) {
      for (const i of ids) {
        if (now[i] && !this.padPrev[i]) {
          this.queued.add(a);
          this.lastDevice = 'gamepad';
          this.onAction?.(a);
        }
      }
    }
    // Stick flicks count as menu navigation presses.
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const prevX = this.padPrev[100] ? 1 : this.padPrev[101] ? -1 : 0;
    const prevY = this.padPrev[102] ? 1 : this.padPrev[103] ? -1 : 0;
    const sx = ax > 0.6 ? 1 : ax < -0.6 ? -1 : 0;
    const sy = ay > 0.6 ? 1 : ay < -0.6 ? -1 : 0;
    if (sx !== prevX && sx !== 0) this.onAction?.(sx > 0 ? 'right' : 'left');
    if (sy !== prevY && sy !== 0) this.onAction?.(sy > 0 ? 'down' : 'up');
    now[100] = sx > 0;
    now[101] = sx < 0;
    now[102] = sy > 0;
    now[103] = sy < 0;
    this.padPrev = now;
  }

  /** Consume input for one simulation step. */
  consume(): ActionFrame {
    const pad = this.getPad();
    const held = new Set<Action>();
    for (const a of Object.keys(this.settings.data.bindings) as Action[]) if (this.isHeld(a, pad)) held.add(a);
    let moveX = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    let moveY = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.3) {
        moveX = ax;
        moveY = -ay;
        this.lastDevice = 'gamepad';
      }
    }
    const pressed = this.queued;
    this.queued = new Set();
    return { moveX, moveY, held, pressed };
  }

  /** Drop queued presses (e.g. when leaving a menu). */
  flush(): void {
    this.queued.clear();
  }
}

export const keyLabel = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    Enter: 'Enter',
    Semicolon: ';',
    Comma: ',',
    Period: '.',
    Slash: '/',
  };
  return map[code] ?? code;
};

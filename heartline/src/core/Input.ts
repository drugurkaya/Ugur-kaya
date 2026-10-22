/**
 * Keyboard + mouse + touch input. Movement is exposed as an analogue vector so the on-screen
 * joystick and the keyboard drive the protagonist identically.
 */
export type Command = 'interact' | 'phone' | 'journal' | 'pause' | 'advance' | 'run';

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<Command>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  lookDX = 0;
  lookDY = 0;
  zoom = 0;
  /** Virtual joystick vector (-1..1), set by the touch UI. */
  stick = { x: 0, y: 0 };
  /** True while any text field has focus (keys go to the field). */
  typing = false;
  enabled = true;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.typing) return;
      this.keys.add(e.code);
      const cmd = this.commandFor(e.code);
      if (cmd && !e.repeat) this.pressed.add(cmd);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // touch look is handled by the touch layer
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.lookDX += e.clientX - this.lastX;
      this.lookDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    el.addEventListener('wheel', (e) => (this.zoom += Math.sign(e.deltaY)), { passive: true });
  }

  private commandFor(code: string): Command | null {
    switch (code) {
      case 'KeyE':
      case 'KeyF':
        return 'interact';
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        return 'advance';
      case 'KeyP':
      case 'Tab':
        return 'phone';
      case 'KeyJ':
        return 'journal';
      case 'Escape':
        return 'pause';
      default:
        return null;
    }
  }

  /** Commands pressed since the last frame. */
  consume(cmd: Command): boolean {
    const had = this.pressed.has(cmd);
    this.pressed.delete(cmd);
    return had;
  }

  press(cmd: Command) {
    this.pressed.add(cmd);
  }

  addLook(dx: number, dy: number) {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  /** Movement intent in camera space: x = strafe right, y = forward. */
  move(): { x: number; y: number; run: boolean } {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    let x = this.stick.x;
    let y = this.stick.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, run: k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.stick.x, this.stick.y) > 0.92 };
  }

  endFrame() {
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoom = 0;
    this.pressed.clear();
  }

  get element() {
    return this.el;
  }
}

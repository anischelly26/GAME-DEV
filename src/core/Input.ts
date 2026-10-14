/**
 * Keyboard, mouse and gamepad input mapped to game actions.
 *
 * Button presses are queued and consumed by the fixed-step simulation, so a press is never lost
 * or counted twice regardless of how render frames and physics steps line up.
 * Movement keys use `KeyboardEvent.code` (physical position), so WASD works on AZERTY as ZQSD.
 */

export interface InputFrame {
  /** Stick-style movement, x = right, y = forward, magnitude <= 1. */
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
}

/** Scripted input used by the dev autopilot and automated tests. Goes through the same code path. */
export interface VirtualInput {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
}

type Action = 'jump' | 'interact';

const MOVE_CODES = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const ACTION_CODES: Record<Action, string[]> = {
  jump: ['Space'],
  interact: ['KeyE', 'KeyF', 'Enter'],
};

const STICK_DEADZONE = 0.18;

export class Input {
  mouseSensitivity = 0.0022;
  stickLookSpeed = 2.8;
  invertY = false;
  /** True when the most recent input came from a gamepad; used for prompt glyphs. */
  usingGamepad = false;
  pointerLocked = false;
  /** When false (menus, cutscenes) gameplay input reads as neutral. */
  enabled = true;

  virtual: VirtualInput | null = null;
  private virtualPresses: Action[] = [];

  private keys = new Set<string>();
  private pending: Record<Action, number> = { jump: 0, interact: 0 };
  private lookDX = 0;
  private lookDY = 0;
  private dragging = false;
  private padButtonsPrev: boolean[] = [];
  private padMove = { x: 0, y: 0 };
  private padJumpHeld = false;

  /** Called for Escape / gamepad Start. */
  onPauseRequest: (() => void) | null = null;
  /** Called for C, middle mouse or a stick click: swing the camera behind the player. */
  onRecenter: (() => void) | null = null;
  /** Called for dev hotkeys (only wired in dev builds). */
  onDevKey: ((code: string) => void) | null = null;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clear);
    element.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  requestPointerLock(): void {
    if (document.pointerLockElement === this.element) return;
    // Some environments (headless tests, embedded previews) refuse pointer lock; drag-to-look still works.
    try {
      const result = this.element.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* ignored */
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Called once per rendered frame. Polls gamepads and accumulates stick look. */
  pollFrame(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected && p.mapping === 'standard') ?? null;
    if (!pad) {
      this.padMove.x = this.padMove.y = 0;
      this.padJumpHeld = false;
      return;
    }
    const [lx, ly] = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const [rx, ry] = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    this.padMove.x = lx;
    this.padMove.y = -ly;
    if (this.enabled && (rx !== 0 || ry !== 0)) {
      // Convert stick deflection to the same units as mouse pixels.
      const scale = (this.stickLookSpeed * dt) / this.mouseSensitivity;
      this.lookDX += rx * Math.abs(rx) * scale;
      this.lookDY += ry * Math.abs(ry) * scale;
    }
    const buttons = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => buttons[i] && !this.padButtonsPrev[i];
    if (buttons.some(Boolean) || lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0) this.usingGamepad = true;
    if (edge(0)) this.queue('jump');
    if (edge(2) || edge(1)) this.queue('interact');
    if (edge(9)) this.onPauseRequest?.();
    if (edge(10) || edge(11)) this.onRecenter?.();
    this.padJumpHeld = !!buttons[0];
    this.padButtonsPrev = buttons;
  }

  /** Mouse/stick look delta accumulated since the last call, in mouse-pixel units. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY * (this.invertY ? -1 : 1) };
    this.lookDX = this.lookDY = 0;
    if (!this.enabled) out.dx = out.dy = 0;
    return out;
  }

  /** Sampled once per fixed simulation step. Consumes queued presses. */
  sampleFixed(): InputFrame {
    const frame: InputFrame = { moveX: 0, moveY: 0, jumpHeld: false, jumpPressed: false, interactPressed: false };
    if (this.virtual) {
      frame.moveX = this.virtual.moveX;
      frame.moveY = this.virtual.moveY;
      frame.jumpHeld = this.virtual.jumpHeld;
    } else {
      const k = (codes: string[]) => codes.some((c) => this.keys.has(c));
      let x = (k(MOVE_CODES.right) ? 1 : 0) - (k(MOVE_CODES.left) ? 1 : 0);
      let y = (k(MOVE_CODES.forward) ? 1 : 0) - (k(MOVE_CODES.back) ? 1 : 0);
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      if (Math.hypot(this.padMove.x, this.padMove.y) > Math.hypot(x, y)) {
        x = this.padMove.x;
        y = this.padMove.y;
      }
      frame.moveX = x;
      frame.moveY = y;
      frame.jumpHeld = k(ACTION_CODES.jump) || this.padJumpHeld;
    }
    for (const a of this.virtualPresses) this.pending[a]++;
    this.virtualPresses.length = 0;
    frame.jumpPressed = this.pending.jump > 0;
    frame.interactPressed = this.pending.interact > 0;
    this.pending.jump = this.pending.interact = 0;
    if (!this.enabled) {
      frame.moveX = frame.moveY = 0;
      frame.jumpHeld = frame.jumpPressed = frame.interactPressed = false;
    }
    return frame;
  }

  /** Inject a button press (autopilot / tests). */
  press(action: Action): void {
    this.virtualPresses.push(action);
  }

  clear = (): void => {
    this.keys.clear();
    this.pending.jump = this.pending.interact = 0;
    this.dragging = false;
  };

  private queue(action: Action): void {
    if (this.enabled) this.pending[action]++;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) this.onPauseRequest?.();
      return;
    }
    if (/^(F\d+|Digit\d|KeyR|KeyT|Backquote)$/.test(e.code) && this.onDevKey) {
      if (!e.repeat) this.onDevKey(e.code);
      if (e.code.startsWith('F')) e.preventDefault();
    }
    if (e.code === 'KeyC' && !e.repeat && this.enabled) this.onRecenter?.();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    this.usingGamepad = false;
    if (e.repeat) return;
    this.keys.add(e.code);
    for (const action of Object.keys(ACTION_CODES) as Action[]) {
      if (ACTION_CODES[action].includes(e.code)) this.queue(action);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.usingGamepad = false;
    if (e.button === 1) {
      e.preventDefault();
      if (this.enabled) this.onRecenter?.();
      return;
    }
    if (!this.pointerLocked) this.dragging = e.button === 0 || e.button === 2;
  };

  private handleMouseUp = (): void => {
    this.dragging = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked || this.dragging) {
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    }
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.element;
  };
}

function radialDeadzone(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) return [0, 0];
  const scaled = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return [(x / m) * scaled, (y / m) * scaled];
}

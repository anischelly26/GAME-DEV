/**
 * Keyboard, mouse and gamepad input mapped to game actions.
 *
 * - Button presses are queued and consumed by the fixed-step simulation, so a press is never lost
 *   or counted twice regardless of how render frames and physics steps line up.
 * - Look input is converted to radians once, at the source: mouse pixels × `mouseRadiansPerPixel`,
 *   stick deflection × `stickRadiansPerSecond` × dt. The camera consumes radians and applies no
 *   further scaling.
 * - Two independent gates: `gameplayActive` (menus, title and completion screens own input when it
 *   is false) and `enabled` (a cinematic holds control when it is false). Crossing the menu boundary
 *   discards everything queued, so a press made in a menu can never fire in gameplay. While a
 *   cinematic holds control, Jump/Interact become skip requests instead of actions.
 * - Movement keys use `KeyboardEvent.code` (physical position), so WASD works on AZERTY as ZQSD.
 */

export interface InputFrame {
  /** Stick-style movement, x = right, y = forward, magnitude <= 1. */
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  /** Jump/Interact pressed while a cinematic holds control. */
  skipPressed: boolean;
}

/** Look delta in radians since the last read. Positive yaw = turn right, positive pitch = look down. */
export interface LookDelta {
  yaw: number;
  pitch: number;
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

/** Base mouse look rate: radians of camera rotation per pixel at the default sensitivity (25). */
export const BASE_RADIANS_PER_PIXEL = 0.0022;
/** The sensitivity sliders run 1-100; 25 is the base rate, 50 twice it, 100 four times. */
export const DEFAULT_LOOK_SENSITIVITY = 25;
const STICK_DEADZONE = 0.18;

export class Input {
  /** Radians per mouse pixel at a horizontal/vertical scale of 1. */
  mouseRadiansPerPixel = BASE_RADIANS_PER_PIXEL;
  /** Look speed at full stick deflection, radians per second (response is squared for precision). */
  stickRadiansPerSecond = 2.8;
  /** Horizontal and vertical look scales from the sensitivity settings (setting / 25). */
  lookScaleX = 1;
  lookScaleY = 1;
  invertX = false;
  invertY = false;
  /** True when the most recent input came from a gamepad; used for prompt glyphs. */
  usingGamepad = false;
  pointerLocked = false;
  /** False while a cinematic holds control. Owned by `Game.setControl`; menus never change it. */
  enabled = true;

  virtual: VirtualInput | null = null;
  private virtualPresses: Action[] = [];

  private gameplay = false;
  private keys = new Set<string>();
  private pending: Record<Action, number> = { jump: 0, interact: 0 };
  private skipPending = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private dragging = false;
  private padButtonsPrev: boolean[] = [];
  private padMove = { x: 0, y: 0 };
  private padJumpHeld = false;

  /** Called for Escape / P / gamepad Start. */
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

  /** Whether gameplay (rather than a menu or screen) currently owns input. */
  get gameplayActive(): boolean {
    return this.gameplay;
  }

  /**
   * Move the menu boundary. Crossing it in either direction discards queued presses, skip
   * requests and look motion: nothing pressed in a menu leaks into play, or vice versa.
   */
  setGameplayActive(active: boolean): void {
    if (active === this.gameplay) return;
    this.gameplay = active;
    this.discardQueued();
  }

  /** Drop queued presses and look motion, keeping which keys are physically held. */
  discardQueued(): void {
    this.pending.jump = this.pending.interact = 0;
    this.skipPending = 0;
    this.virtualPresses.length = 0;
    this.lookYaw = this.lookPitch = 0;
    this.dragging = false;
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
    if (this.lookAllowed && (rx !== 0 || ry !== 0)) {
      const k = this.stickRadiansPerSecond * dt;
      this.lookYaw += rx * Math.abs(rx) * k * this.lookScaleX;
      this.lookPitch += ry * Math.abs(ry) * k * this.lookScaleY;
    }
    const buttons = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => buttons[i] && !this.padButtonsPrev[i];
    if (buttons.some(Boolean) || lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0) this.usingGamepad = true;
    if (edge(0)) this.queue('jump');
    if (edge(2) || edge(1)) this.queue('interact');
    if (edge(9)) this.onPauseRequest?.();
    if ((edge(10) || edge(11)) && this.lookAllowed) this.onRecenter?.();
    this.padJumpHeld = !!buttons[0];
    this.padButtonsPrev = buttons;
  }

  /** Look motion since the last call, in radians (sensitivity and invert already applied). */
  consumeLook(): LookDelta {
    const out = { yaw: this.lookYaw * (this.invertX ? -1 : 1), pitch: this.lookPitch * (this.invertY ? -1 : 1) };
    this.lookYaw = this.lookPitch = 0;
    if (!this.lookAllowed) out.yaw = out.pitch = 0;
    return out;
  }

  /** Sampled once per fixed simulation step. Consumes queued presses. */
  sampleFixed(): InputFrame {
    const frame: InputFrame = { moveX: 0, moveY: 0, jumpHeld: false, jumpPressed: false, interactPressed: false, skipPressed: false };
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
    for (const a of this.virtualPresses) this.queue(a);
    this.virtualPresses.length = 0;
    frame.jumpPressed = this.pending.jump > 0;
    frame.interactPressed = this.pending.interact > 0;
    frame.skipPressed = this.skipPending > 0;
    this.pending.jump = this.pending.interact = 0;
    this.skipPending = 0;
    if (!this.enabled || !this.gameplay) {
      frame.moveX = frame.moveY = 0;
      frame.jumpHeld = frame.jumpPressed = frame.interactPressed = false;
    }
    if (!this.gameplay) frame.skipPressed = false;
    return frame;
  }

  /** Inject a button press (autopilot / tests). Subject to the same gates as real input. */
  press(action: Action): void {
    this.virtualPresses.push(action);
  }

  /** Forget held keys too (window lost focus: key-up events would be missed). */
  clear = (): void => {
    this.keys.clear();
    this.discardQueued();
  };

  private get lookAllowed(): boolean {
    return this.gameplay && this.enabled;
  }

  private queue(action: Action): void {
    if (!this.gameplay) return; // menu-owned: never becomes a gameplay action
    if (this.enabled) this.pending[action]++;
    else this.skipPending++;
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
    // Let menus handle Space/arrows natively; only gameplay swallows them.
    if (this.gameplay && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    this.usingGamepad = false;
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'KeyC' && this.lookAllowed) this.onRecenter?.();
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
      if (this.lookAllowed) this.onRecenter?.();
      return;
    }
    if (!this.pointerLocked) this.dragging = this.gameplay && (e.button === 0 || e.button === 2);
  };

  private handleMouseUp = (): void => {
    this.dragging = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.lookAllowed || !(this.pointerLocked || this.dragging)) return;
    this.lookYaw += e.movementX * this.mouseRadiansPerPixel * this.lookScaleX;
    this.lookPitch += e.movementY * this.mouseRadiansPerPixel * this.lookScaleY;
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

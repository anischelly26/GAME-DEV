import * as THREE from 'three';
import type { RouteStep } from '../levels/Level';
import type { Input } from '../core/Input';
import type { PlayerController } from '../player/PlayerController';
import type { InteractionSystem } from '../gameplay/Interaction';
import type { Progression } from '../gameplay/Progression';

export interface AutopilotHost {
  input: Input;
  player: PlayerController;
  interactions: InteractionSystem;
  progression: Progression;
  conditions: Record<string, () => boolean>;
  cameraYaw(): number;
}

export type AutopilotStatus = { state: 'running' | 'done' | 'failed'; step: number; total: number; message: string; log: string[] };

const v = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Plays the level's critical path through the real input pipeline (camera-relative stick values
 * and button presses), so a passing run proves the route is completable with actual physics.
 * Development and testing only.
 */
export class Autopilot {
  private i = 0;
  private stepT = 0;
  private phase = 0;
  private jumpHold = 0;
  private startFalls = 0;
  readonly status: AutopilotStatus;

  constructor(
    private readonly host: AutopilotHost,
    private readonly route: RouteStep[],
  ) {
    this.status = { state: 'running', step: 0, total: route.length, message: '', log: [] };
    this.startFalls = host.progression.falls;
  }

  stop(): void {
    this.host.input.virtual = null;
  }

  private next(note: string): void {
    this.status.log.push(`[${this.i}] ${note} @${this.stepT.toFixed(2)}s`);
    this.i++;
    this.stepT = 0;
    this.phase = 0;
    this.status.step = this.i;
    if (this.i >= this.route.length) {
      this.status.state = 'done';
      this.status.message = 'route complete';
      this.host.input.virtual = { moveX: 0, moveY: 0, jumpHeld: false };
    }
  }

  private fail(message: string): void {
    this.status.state = 'failed';
    this.status.message = `step ${this.i}: ${message}`;
    this.status.log.push(`FAILED ${this.status.message}`);
    this.host.input.virtual = { moveX: 0, moveY: 0, jumpHeld: false };
  }

  /** Convert a world-space direction into the stick input the player would give. */
  private steer(dir: THREE.Vector3, magnitude: number, jumpHeld = false): void {
    const yaw = this.host.cameraYaw();
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const len = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / len;
    const dz = dir.z / len;
    this.host.input.virtual = { moveX: (dx * rx + dz * rz) * magnitude, moveY: (dx * fx + dz * fz) * magnitude, jumpHeld };
  }

  private idle(): void {
    this.host.input.virtual = { moveX: 0, moveY: 0, jumpHeld: false };
  }

  /** Runs before input sampling each fixed step. */
  fixedUpdate(dt: number): void {
    if (this.status.state !== 'running') return;
    if (this.host.progression.falls > this.startFalls) {
      this.fail('player fell');
      return;
    }
    const step = this.route[this.i];
    this.stepT += dt;
    const feet = this.host.player.feet;
    const flat = (p: THREE.Vector3) => new THREE.Vector3(p.x - feet.x, 0, p.z - feet.z);

    switch (step.kind) {
      case 'pause':
        this.idle();
        if (this.stepT >= step.seconds) this.next('pause');
        break;
      case 'wait':
        this.idle();
        if (this.host.conditions[step.until]?.()) this.next(`wait ${step.until}`);
        else if (this.stepT > (step.timeout ?? 10)) this.fail(`timed out waiting for ${step.until}`);
        break;
      case 'move': {
        const d = flat(v(step.to));
        const dist = d.length();
        const radius = step.radius ?? (step.precise ? 0.2 : 0.5);
        if (dist < radius) {
          this.idle();
          this.next(`move ${step.to.map((n) => n.toFixed(1)).join(',')}`);
        } else this.steer(d, Math.min(1, Math.max(0.3, dist / 0.9)));
        if (this.stepT > 15) this.fail('move timed out');
        break;
      }
      case 'jump': {
        if (this.phase === 0) {
          // Run through the take-off point toward the landing, then press jump at the mark.
          const toTakeoff = flat(v(step.from));
          const toLanding = flat(v(step.to));
          const dir = toTakeoff.length() > 0.6 ? toTakeoff : toLanding;
          this.steer(dir, 1);
          const axis = new THREE.Vector3(step.to[0] - step.from[0], 0, step.to[2] - step.from[2]).normalize();
          const along = (feet.x - step.from[0]) * axis.x + (feet.z - step.from[2]) * axis.z;
          if (toTakeoff.length() < 0.35 || (along > -0.05 && toTakeoff.length() < 1.0)) {
            this.host.input.press('jump');
            this.jumpHold = 0.3;
            this.phase = 1;
          }
          if (this.stepT > 10) this.fail('never reached take-off');
        } else {
          this.jumpHold -= dt;
          const toLanding = flat(v(step.to));
          this.steer(toLanding, toLanding.length() > 0.4 ? 1 : 0.3, this.jumpHold > 0);
          if (this.host.player.grounded && this.stepT > 0.25 && toLanding.length() < 0.9 && Math.abs(feet.y - step.to[1]) < 0.3) {
            this.idle();
            this.next('jump');
          }
          if (this.stepT > 6) this.fail('jump did not land');
        }
        break;
      }
      case 'interact': {
        const d = flat(v(step.standAt));
        if (this.phase === 0) {
          if (d.length() > 0.22) this.steer(d, Math.min(1, Math.max(0.3, d.length() / 0.9)));
          else {
            this.idle();
            this.phase = 1;
          }
          if (this.stepT > 15) this.fail(`could not reach ${step.id}`);
        } else if (this.phase === 1) {
          const focused = this.host.interactions.focused?.id;
          if (focused === step.id) {
            this.idle();
            this.host.input.press('interact');
            this.phase = 2;
          } else {
            // Turn toward the item with a tiny nudge, like a player adjusting their facing.
            const item = this.host.interactions.get(step.id);
            if (item) this.steer(flat(item.position), 0.15);
            if (this.stepT > 6) this.fail(`${step.id} never became the focused interactable (focused: ${focused ?? 'none'})`);
          }
        } else {
          this.idle();
          if (!step.expectFlag || this.host.progression.has(step.expectFlag)) this.next(`interact ${step.id}`);
          else if (this.stepT > 8) this.fail(`interacting with ${step.id} did not set ${step.expectFlag}`);
        }
        break;
      }
    }
  }
}

import { clamp, smoothstep } from '../core/math';

/**
 * Game feel for the toy hero: what her body shows in the air and how it gives on take-off and
 * landing. Visual only: nothing here touches the capsule, the physics or the controls.
 * Specification: docs/MOVEMENT_2_0.md (B1 to B3).
 */
export const FEEL = {
  /** Vertical speed (m/s) where rising or falling starts to show, and where it is complete. */
  airFrom: 0.5,
  airFull: 2.5,
  /**
   * A long fall: after falling this long (s; the avatar counts from 0.1 s after leaving the
   * ground, so about 3.5 m down) at least this fast (m/s downward), the arms windmill; fully
   * `longFallRamp` s later (about 6 m down).
   */
  longFallTime: 0.35,
  longFallRamp: 0.15,
  longFallSpeed: 9,
  /** Squash and stretch: the spring (rad/s, damping ratio) and the limits on her height. */
  spring: { omega: 22, zeta: 0.42 },
  minHeight: 0.78,
  maxHeight: 1.16,
  /** Peak stretch on take-off and on the double jump (fraction of her height). */
  takeoffStretch: 0.1,
  doubleJumpStretch: 0.06,
  /** Landing squash: none below `squashFrom` m/s; `squashMax` at `squashFull` m/s and above. */
  squashFrom: 3,
  squashFull: 16,
  squashMax: 0.2,
  /** Rising at least this fast (m/s) into a ceiling is a bump on the head. */
  bumpSpeed: 2.5,
};

export interface AirPose {
  rise: number;
  apex: number;
  fall: number;
  /** The long fall's windmilling arms, 0..1 (part of `fall`). */
  flail: number;
}

/**
 * How much of each airborne state to show, from the vertical speed and how long she has been
 * falling. `rise + apex + fall = 1`; the bands do not overlap, so nothing pops.
 */
export function airPose(verticalSpeed: number, fallingFor: number): AirPose {
  const rise = smoothstep(FEEL.airFrom, FEEL.airFull, verticalSpeed);
  const fall = smoothstep(FEEL.airFrom, FEEL.airFull, -verticalSpeed);
  const flail =
    fall *
    smoothstep(FEEL.longFallTime, FEEL.longFallTime + FEEL.longFallRamp, fallingFor) *
    smoothstep(FEEL.longFallSpeed - 2, FEEL.longFallSpeed + 2, -verticalSpeed);
  return { rise, apex: 1 - rise - fall, fall, flail };
}

export type LandingTier = 'none' | 'soft' | 'normal' | 'heavy';

/** What a landing at `impact` m/s sets off (docs/MOVEMENT_2_0.md, B3). */
export function landingTier(impact: number): LandingTier {
  if (impact < 3) return 'none';
  if (impact < 8) return 'soft';
  if (impact <= 12) return 'normal';
  return 'heavy';
}

/** Fraction of her height a landing at `impact` m/s squashes her by (0 to `squashMax`). */
export function landingSquash(impact: number): number {
  return clamp((impact - FEEL.squashFrom) / (FEEL.squashFull - FEEL.squashFrom), 0, 1) * FEEL.squashMax;
}

/**
 * Squash and stretch: an underdamped spring on her height (1 at rest). `pop` gives it a kick
 * whose first peak is the requested amount (+ stretches, - squashes); the width keeps her volume.
 */
export class SquashSpring {
  /** Height offset from rest (0 = her normal height) and its rate. */
  x = 0;
  v = 0;
  private readonly omega: number;
  private readonly zeta: number;
  /** First peak of the spring's response to a unit kick of velocity. */
  private readonly peakPerVelocity: number;

  constructor(omega = FEEL.spring.omega, zeta = FEEL.spring.zeta) {
    this.omega = omega;
    this.zeta = zeta;
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const tPeak = Math.atan2(Math.sqrt(1 - zeta * zeta), zeta) / wd;
    this.peakPerVelocity = (Math.exp(-zeta * omega * tPeak) * Math.sin(wd * tPeak)) / wd;
  }

  /** Kick the spring so that, from rest, it peaks at `amount` (fraction of her height). */
  pop(amount: number): void {
    this.v += amount / this.peakPerVelocity;
  }

  /** Back to rest at once (cinematics, teleports). */
  reset(): void {
    this.x = 0;
    this.v = 0;
  }

  update(dt: number): void {
    // Small fixed steps: the spring is stiff and frames can be long.
    let left = Math.max(0, Math.min(dt, 0.1));
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      this.v += (-this.omega * this.omega * this.x - 2 * this.zeta * this.omega * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    // Clamped; pushing into a limit stops the motion that way.
    const lo = FEEL.minHeight - 1;
    const hi = FEEL.maxHeight - 1;
    if (this.x < lo || this.x > hi) {
      this.x = clamp(this.x, lo, hi);
      this.v = 0;
    }
  }

  /** Her height scale. */
  get height(): number {
    return 1 + this.x;
  }

  /** Her width scale: the same volume (height x width^2 = 1). */
  get width(): number {
    return 1 / Math.sqrt(1 + this.x);
  }

  get atRest(): boolean {
    return Math.abs(this.x) < 1e-3 && Math.abs(this.v) < 1e-2;
  }
}

/**
 * The cell's pressure-operated service hatch, as pure state (no rendering, no physics) so the rules
 * can be unit-tested and reviewed in isolation.
 *
 * Rule taught: engine pressure follows the path of least resistance. While the bypass valve is
 * open the line vents into the floor grate and the hatch piston gets almost nothing. Closing the
 * bypass lets the gauge climb into the LIFT band; only then does the lever raise the hatch.
 *
 *  goal ............ open the service hatch
 *  clue ............ wall diagram (vent state vs. piston state), gauge, audible venting
 *  initial state ... bypass OPEN, pressure LOW, hatch CLOSED
 *  actions ......... turn bypass valve (toggle), pull hatch lever
 *  invalid action .. lever with low pressure -> harmless hiss + short hatch rattle, nothing changes
 *  solution ........ close bypass -> wait for gauge -> pull lever -> hatch lifts and latches
 *  after success ... latch holds the hatch; reopening the valve cannot close it (no softlock)
 *  reset ........... `reset()` restores the initial state (used by "Restart section")
 */

export type HatchState = 'closed' | 'lifting' | 'latched';
export type LeverResult = 'lift' | 'hiss' | 'busy' | 'already-open';

/** Gauge value (0..1) above which the piston can lift the hatch. */
export const LIFT_THRESHOLD = 0.7;
/** Seconds for the hatch to rise and latch. */
export const LIFT_TIME = 1.9;
/** Engine "breath" period: pressure pulses through the line on this cycle. */
export const PULSE_PERIOD = 4.2;

/** 0..1 pressure pulse from the tide engine at time `t`. Sharp peak, long rest. */
export function enginePulse(t: number): number {
  const s = Math.max(0, Math.sin((t / PULSE_PERIOD) * Math.PI * 2));
  return s * s * s * s;
}

export class PressureHatchLogic {
  bypassOpen = true;
  pressure = 0.1;
  hatch: HatchState = 'closed';
  liftProgress = 0;
  failedPulls = 0;
  valveTurns = 0;

  reset(): void {
    this.bypassOpen = true;
    this.pressure = 0.1;
    this.hatch = 'closed';
    this.liftProgress = 0;
    this.failedPulls = 0;
    this.valveTurns = 0;
  }

  /** Pressure the line settles toward for the current valve setting and engine pulse. */
  targetPressure(pulse: number): number {
    return this.bypassOpen ? 0.1 + 0.14 * pulse : 0.86 + 0.08 * pulse;
  }

  get inLiftBand(): boolean {
    return this.pressure >= LIFT_THRESHOLD;
  }

  toggleValve(): boolean {
    this.bypassOpen = !this.bypassOpen;
    this.valveTurns++;
    return this.bypassOpen;
  }

  pullLever(): LeverResult {
    if (this.hatch === 'latched') return 'already-open';
    if (this.hatch === 'lifting') return 'busy';
    if (!this.inLiftBand) {
      this.failedPulls++;
      return 'hiss';
    }
    this.hatch = 'lifting';
    this.liftProgress = 0;
    return 'lift';
  }

  /** Advance by `dt`. Returns 'latched' on the step the hatch locks open. */
  update(dt: number, pulse: number): 'latched' | null {
    const target = this.targetPressure(pulse);
    // Pressure builds over about a second but bleeds away quickly through an open vent.
    const rate = target > this.pressure ? 2.4 : 6;
    this.pressure += (target - this.pressure) * (1 - Math.exp(-rate * dt));
    if (this.hatch === 'lifting') {
      // Once the piston has started, the latch catches regardless of later valve changes.
      this.liftProgress = Math.min(1, this.liftProgress + dt / LIFT_TIME);
      if (this.liftProgress >= 1) {
        this.hatch = 'latched';
        return 'latched';
      }
    }
    return null;
  }
}

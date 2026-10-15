/**
 * The Breathing Engine's split feed at the breach, as pure state (no rendering, no physics) so the
 * rules can be unit-tested and reviewed in isolation. It applies the rule the cell taught (pressure
 * goes where the valves send it) to a choice with a consequence.
 *
 *  goal ............ reach the exit gantry, 2.4 m above the walkway, past a steam curtain
 *  machine ......... one steam main, one diverter at a junction before the curtain:
 *                      VENT -> the cracked line sprays across the walkway (the curtain)
 *                      RAM  -> the breach ram rises to the exit gantry and holds there
 *                    a mechanical CATCH at the junction holds the ram wherever it stands,
 *                    and a release on the ram deck frees it
 *  clue ............ two gauges (VENT, RAM) show where the pressure goes; plates name each control;
 *                    a visible rod runs from the catch to a pawl on the ram's rack
 *  initial state ... feed VENT (curtain on), catch FREE, ram DOWN
 *  natural mistake . feed RAM first: the curtain stops, but the ram rises empty and holds out of reach
 *  solution ........ with the ram down, set the CATCH, feed the RAM (the curtain stops, the ram strains
 *                    against the catch), cross, step on the deck and release: it carries Mara up
 *  recovery ........ every state is reversible from the junction alone (feed VENT drops a free ram;
 *                    freeing the catch lets it follow the feed). No step needs two places at once.
 *  reset ........... `reset()` restores the initial state (used by "Restart section")
 */

export type FeedRoute = 'vent' | 'ram';

/** Seconds for the ram to travel its full height. */
export const RAM_TRAVEL_TIME = 2.4;

export class SplitFeedLogic {
  route: FeedRoute = 'vent';
  caught = false;
  /** Ram position: 0 at walkway level, 1 at the exit gantry. */
  ram = 0;
  /** Counters for review and tests. */
  routeChanges = 0;
  catchChanges = 0;
  emptyRises = 0;
  private wasMovingUpEmpty = false;

  reset(): void {
    this.route = 'vent';
    this.caught = false;
    this.ram = 0;
    this.routeChanges = 0;
    this.catchChanges = 0;
    this.emptyRises = 0;
    this.wasMovingUpEmpty = false;
  }

  /** The cracked line sprays only while the feed vents. */
  get curtainOn(): boolean {
    return this.route === 'vent';
  }

  /** Where the feed pushes the ram. */
  get target(): number {
    return this.route === 'ram' ? 1 : 0;
  }

  get moving(): boolean {
    return !this.caught && this.ram !== this.target;
  }

  /** Pressure is held back by the catch (the RAM gauge sits in the red and the ram shudders). */
  get straining(): boolean {
    return this.caught && this.ram !== this.target;
  }

  /** Ready to ride: caught at the bottom with the feed on the ram. */
  get primed(): boolean {
    return this.caught && this.ram === 0 && this.route === 'ram';
  }

  toggleRoute(): FeedRoute {
    this.route = this.route === 'vent' ? 'ram' : 'vent';
    this.routeChanges++;
    return this.route;
  }

  toggleCatch(): boolean {
    this.caught = !this.caught;
    this.catchChanges++;
    return this.caught;
  }

  /** The deck release: frees the catch so the ram follows the feed. */
  release(): boolean {
    if (!this.caught) return false;
    this.caught = false;
    this.catchChanges++;
    return true;
  }

  /** Advance the ram. `riderOnDeck` only feeds the "rose without her" counter. */
  step(dt: number, riderOnDeck = false): void {
    if (this.caught) return;
    const target = this.target;
    const before = this.ram;
    const delta = dt / RAM_TRAVEL_TIME;
    this.ram = target > this.ram ? Math.min(target, this.ram + delta) : Math.max(target, this.ram - delta);
    const upEmpty = this.ram > before && !riderOnDeck;
    if (upEmpty && !this.wasMovingUpEmpty && before === 0) this.emptyRises++;
    this.wasMovingUpEmpty = upEmpty;
  }

  /** Eased ram position for rendering and the moving collider. */
  get height(): number {
    const t = this.ram;
    return t * t * (3 - 2 * t);
  }
}

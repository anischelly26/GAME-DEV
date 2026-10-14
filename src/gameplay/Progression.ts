import * as THREE from 'three';
import type { EventBus, GameEvents } from '../core/Events';

/**
 * Story/puzzle state as a set of flags. Flags only ever get added during a run, so dying or
 * respawning can never undo progress (a requirement: failure must not lose necessary progression).
 */
export class Progression {
  private readonly flags = new Set<string>();
  objective = '';
  falls = 0;
  elapsed = 0;
  complete = false;

  constructor(private readonly events: EventBus<GameEvents>) {}

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** Returns true if the flag was newly set. */
  set(flag: string): boolean {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    this.events.emit('flag', { flag });
    return true;
  }

  setObjective(text: string): void {
    if (text === this.objective) return;
    this.objective = text;
    this.events.emit('objective', { text });
  }

  list(): string[] {
    return [...this.flags];
  }

  /** Back to a fresh run (restart section). */
  reset(): void {
    this.flags.clear();
    this.objective = '';
    this.falls = 0;
    this.elapsed = 0;
    this.complete = false;
  }
}

export interface Checkpoint {
  id: string;
  /** Checkpoints only advance forward; walking back past an earlier lantern doesn't move the respawn. */
  order: number;
  label: string;
  feet: THREE.Vector3;
  facing: number;
  /** Flags implied by reaching this checkpoint (used by dev teleports to keep state consistent). */
  impliesFlags: string[];
  /** Camera yaw on respawn; defaults to directly behind `facing`. Used to avoid framing into a wall. */
  cameraYaw?: number;
}

export class Checkpoints {
  private readonly byId = new Map<string, Checkpoint>();
  current: Checkpoint | null = null;

  constructor(private readonly events: EventBus<GameEvents>) {}

  register(cp: Checkpoint): void {
    this.byId.set(cp.id, cp);
    if (!this.current || cp.order < this.current.order) this.current = cp;
  }

  get(id: string): Checkpoint | undefined {
    return this.byId.get(id);
  }

  all(): Checkpoint[] {
    return [...this.byId.values()].sort((a, b) => a.order - b.order);
  }

  /** Returns true when this moved the respawn point forward. */
  reach(id: string): boolean {
    const cp = this.byId.get(id);
    if (!cp) return false;
    if (this.current && cp.order <= this.current.order) return false;
    this.current = cp;
    this.events.emit('checkpoint', { id, first: true });
    return true;
  }

  /** Force the current checkpoint (dev teleports, restarts). */
  force(id: string): Checkpoint | undefined {
    const cp = this.byId.get(id);
    if (cp) this.current = cp;
    return cp;
  }
}

/** Volume checked against the player's feet every fixed step. */
export interface Trigger {
  id: string;
  contains(p: THREE.Vector3): boolean;
  /** Fire only the first time (default true). */
  once?: boolean;
  enabled?: () => boolean;
  onEnter(): void;
  onExit?(): void;
}

export class Triggers {
  private readonly items: Array<Trigger & { inside: boolean; fired: boolean }> = [];

  add(t: Trigger): void {
    this.items.push({ ...t, inside: false, fired: false });
  }

  update(p: THREE.Vector3): void {
    for (const t of this.items) {
      if (t.enabled && !t.enabled()) continue;
      const inside = t.contains(p);
      if (inside && !t.inside) {
        t.inside = true;
        if (!(t.once ?? true) || !t.fired) {
          t.fired = true;
          t.onEnter();
        }
      } else if (!inside && t.inside) {
        t.inside = false;
        t.onExit?.();
      }
    }
  }

  /** Re-arm every trigger (restart section). */
  rearm(): void {
    for (const t of this.items) {
      t.inside = false;
      t.fired = false;
    }
  }

  /** Clear the "inside" state (after teleports) without re-arming one-shot triggers. */
  resetPresence(): void {
    for (const t of this.items) t.inside = false;
  }
}

// ---------------------------------------------------------------- volume helpers

export const boxVolume =
  (min: THREE.Vector3Like, max: THREE.Vector3Like) =>
  (p: THREE.Vector3): boolean =>
    p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;

export const sphereVolume =
  (c: THREE.Vector3Like, r: number) =>
  (p: THREE.Vector3): boolean =>
    (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2 <= r * r;

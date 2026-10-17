type Handler<T> = (payload: T) => void;

/** Minimal typed event bus used to decouple gameplay systems from audio, UI and tests. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) (h as Handler<E[K]>)(payload);
  }
}

export interface GameEvents {
  flag: { flag: string };
  objective: { text: string };
  checkpoint: { id: string; first: boolean };
  respawn: { id: string };
  fall: { y: number };
  jump: { speed: number };
  /** Steam kicker moves (the avatar, audio and effects respond). */
  doubleJump: { x: number; y: number; z: number };
  /** Mara got on (`on`) or off a grind pipe. */
  grind: { on: boolean; x: number; y: number; z: number };
  /** Mara went into (`on`) or out of the water. */
  swim: { on: boolean; x: number; y: number; z: number };
  dash: { air: boolean; x: number; y: number; z: number };
  groundPound: { x: number; y: number; z: number; collider: number | null };
  land: { impact: number };
  /** Rising into a ceiling hard enough to bump her head (m/s up when it stopped her). */
  bump: { x: number; y: number; z: number; speed: number };
  footstep: { speed: number };
  interact: { id: string };
  line: { speaker: string; text: string };
  complete: { timeSeconds: number; falls: number };
  sfx: { name: string; x?: number; y?: number; z?: number; volume?: number };
  /** Change the music and/or ambience bed (undefined: leave as is; null: silence). */
  music: { music?: string | null; ambience?: string | null; drone?: boolean };
}

import type { EventBus, GameEvents } from '../core/Events';

export type Speaker = 'Mara' | 'Horn' | 'Intercom' | 'Tip';

export interface Line {
  speaker: Speaker;
  text: string;
  duration: number;
}

/**
 * Short subtitle lines, queued so they never overlap. Durations scale with text length so lines
 * stay readable without blocking play.
 */
export class Dialogue {
  private readonly queue: Line[] = [];
  private current: Line | null = null;
  private remaining = 0;
  private readonly said = new Set<string>();
  onShow: ((line: Line | null) => void) | null = null;

  constructor(private readonly events: EventBus<GameEvents>) {}

  say(speaker: Speaker, text: string, duration?: number): void {
    this.queue.push({ speaker, text, duration: duration ?? 1.6 + text.length * 0.055 });
  }

  /** Say a line only the first time `key` is used. */
  sayOnce(key: string, speaker: Speaker, text: string, duration?: number): boolean {
    if (this.said.has(key)) return false;
    this.said.add(key);
    this.say(speaker, text, duration);
    return true;
  }

  /** Forget everything (restart section). */
  reset(): void {
    this.queue.length = 0;
    this.current = null;
    this.remaining = 0;
    this.said.clear();
    this.onShow?.(null);
  }

  /** Drop queued lines (used when a more important line must play now). */
  interrupt(): void {
    this.queue.length = 0;
    this.remaining = 0;
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  update(dt: number): void {
    if (this.current) {
      this.remaining -= dt;
      if (this.remaining > 0) return;
      this.current = null;
      this.onShow?.(null);
    }
    const next = this.queue.shift();
    if (next) {
      this.current = next;
      this.remaining = next.duration;
      this.onShow?.(next);
      this.events.emit('line', { speaker: next.speaker, text: next.text });
    }
  }
}

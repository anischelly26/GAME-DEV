import type { EventBus, GameEvents } from '../core/Events';

export type Speaker = 'Mara' | 'Horn' | 'Intercom' | 'Watch' | 'Tip';

export interface Line {
  speaker: Speaker;
  text: string;
  duration: number;
}

interface Queued extends Line {
  /** Dialogue clock when the line was queued. */
  queuedAt: number;
  /** Seconds it may wait in the queue before it is stale and dropped. */
  maxWait: number;
  /** Story lines (intercom, horn, cinematics) are never dropped and cut short a running remark. */
  story: boolean;
}

export interface SayOptions {
  /** Override how long the line may wait before it is dropped (Infinity: never). */
  maxWait?: number;
  /** Treat as a story line: never dropped, and it takes over from a running remark. */
  story?: boolean;
}

/** How long a remark may wait for its turn. A reaction shown late reads as a non sequitur. */
const REMARK_MAX_WAIT = 3;
/** A remark on screen at least this long gives way to a story line. */
const REMARK_MIN_SHOWN = 0.9;

/**
 * Short subtitle lines, queued so they never overlap. Durations scale with text length so lines
 * stay readable without blocking play.
 *
 * Mara's remarks react to what just happened, so they expire if they cannot be shown within a few
 * seconds (a fast player otherwise saw reactions two rooms late). Story lines (intercom, horn, and
 * anything marked `story`) never expire and take over from a remark that has had its moment.
 */
export class Dialogue {
  private readonly queue: Queued[] = [];
  private current: Queued | null = null;
  private remaining = 0;
  private shown = 0;
  private clock = 0;
  private readonly said = new Set<string>();
  onShow: ((line: Line | null) => void) | null = null;

  constructor(private readonly events: EventBus<GameEvents>) {}

  say(speaker: Speaker, text: string, duration?: number, opts: SayOptions = {}): void {
    const story = opts.story ?? (speaker === 'Intercom' || speaker === 'Horn');
    this.queue.push({
      speaker,
      text,
      duration: duration ?? 1.6 + text.length * 0.055,
      queuedAt: this.clock,
      maxWait: opts.maxWait ?? (story ? Infinity : REMARK_MAX_WAIT),
      story,
    });
  }

  /** Say a line only the first time `key` is used. */
  sayOnce(key: string, speaker: Speaker, text: string, duration?: number, opts?: SayOptions): boolean {
    if (this.said.has(key)) return false;
    this.said.add(key);
    this.say(speaker, text, duration, opts);
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
    this.clock += dt;
    // Stale remarks are dropped before they can be shown.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.clock - this.queue[i].queuedAt > this.queue[i].maxWait) this.queue.splice(i, 1);
    }
    if (this.current) {
      this.remaining -= dt;
      this.shown += dt;
      const storyWaiting = !this.current.story && this.shown >= REMARK_MIN_SHOWN && this.queue.some((q) => q.story);
      if (this.remaining > 0 && !storyWaiting) return;
      this.current = null;
      this.onShow?.(null);
    }
    // Story lines go first; otherwise first in, first out.
    const storyIndex = this.queue.findIndex((q) => q.story);
    const next = storyIndex > 0 ? this.queue.splice(storyIndex, 1)[0] : this.queue.shift();
    if (next) {
      this.current = next;
      this.remaining = next.duration;
      this.shown = 0;
      this.onShow?.(next);
      this.events.emit('line', { speaker: next.speaker, text: next.text });
    }
  }
}

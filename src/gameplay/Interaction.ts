import * as THREE from 'three';

export interface Interactable {
  id: string;
  /** World anchor: used for range checks, the on-screen prompt and Wren's glance. */
  position: THREE.Vector3;
  radius: number;
  /** Verb shown in the prompt, or null when there is nothing to do right now. */
  prompt(): string | null;
  interact(): void;
}

const tmp = new THREE.Vector3();

/** Picks the interactable the player most plausibly means: close, and roughly in front. */
export class InteractionSystem {
  private readonly items: Interactable[] = [];
  focused: Interactable | null = null;
  focusedPrompt: string | null = null;
  /** Shown when nothing else is focused (e.g. "Put down bucket"). */
  fallback: { prompt(): string | null; interact(): void } | null = null;

  add(item: Interactable): void {
    this.items.push(item);
  }

  get(id: string): Interactable | undefined {
    return this.items.find((i) => i.id === id);
  }

  update(feet: THREE.Vector3, facing: number): void {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    let best: Interactable | null = null;
    let bestPrompt: string | null = null;
    let bestScore = Infinity;
    for (const item of this.items) {
      tmp.set(item.position.x - feet.x, item.position.y - (feet.y + 0.9), item.position.z - feet.z);
      const dist = tmp.length();
      if (dist > item.radius) continue;
      const prompt = item.prompt();
      if (!prompt) continue;
      const flat = Math.hypot(tmp.x, tmp.z) || 1;
      const dot = (tmp.x * fx + tmp.z * fz) / flat;
      if (dot < -0.25 && dist > 0.9) continue;
      const score = dist + (1 - dot) * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = item;
        bestPrompt = prompt;
      }
    }
    this.focused = best;
    this.focusedPrompt = bestPrompt;
    if (!best && this.fallback) this.focusedPrompt = this.fallback.prompt();
  }

  /** Returns the id of what was interacted with, or null. */
  interact(): string | null {
    if (this.focused) {
      const item = this.focused;
      item.interact();
      return item.id;
    }
    if (this.fallback && this.focusedPrompt) {
      this.fallback.interact();
      return 'fallback';
    }
    return null;
  }
}

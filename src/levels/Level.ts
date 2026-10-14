import type * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { EventBus, GameEvents } from '../core/Events';
import type { Input } from '../core/Input';
import type { MaterialLibrary } from '../world/materials';
import type { TextureLibrary } from '../world/textures';
import type { Progression, Checkpoints, Triggers } from '../gameplay/Progression';
import type { InteractionSystem } from '../gameplay/Interaction';
import type { Dialogue } from '../gameplay/Dialogue';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerAvatar } from '../player/PlayerAvatar';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { HUD } from '../ui/HUD';

/** Everything a level needs from the game. Levels never reach into `Game` directly. */
export interface LevelContext {
  scene: THREE.Scene;
  physics: Physics;
  materials: MaterialLibrary;
  textures: TextureLibrary;
  events: EventBus<GameEvents>;
  input: Input;
  progression: Progression;
  checkpoints: Checkpoints;
  triggers: Triggers;
  interactions: InteractionSystem;
  dialogue: Dialogue;
  player: PlayerController;
  avatar: PlayerAvatar;
  camera: ThirdPersonCamera;
  hud: HUD;
  moonDir: THREE.Vector3;
  /** Respawn at the current checkpoint (used by fall recovery). */
  respawn(reason: 'fall' | 'manual'): void;
  /** Show the completion screen. */
  complete(): void;
  /** Hold or release player control (cutscene beats). */
  setControl(enabled: boolean): void;
}

/** One step of the scripted dev/test route (see dev/Autopilot.ts). */
export type RouteStep =
  | { kind: 'move'; to: [number, number, number]; radius?: number; precise?: boolean }
  | { kind: 'jump'; from: [number, number, number]; to: [number, number, number] }
  | { kind: 'interact'; id: string; standAt: [number, number, number]; expectFlag?: string }
  | { kind: 'wait'; until: string; timeout?: number }
  | { kind: 'pause'; seconds: number };

export interface Level {
  readonly name: string;
  /** Ordered checkpoint ids, first is the section start. */
  readonly checkpointIds: string[];
  fixedUpdate(dt: number, time: number): void;
  update(dt: number, time: number, alpha: number): void;
  /** Restore the complete initial state ("Restart section"). */
  reset(): void;
  /** Put props/flags into the state implied by reaching a checkpoint (dev teleports). */
  applyCheckpointState(id: string): void;
  /** Give the next tier of hint for the current objective. */
  hint(): void;
  /** Named conditions for the autopilot / tests. */
  readonly conditions: Record<string, () => boolean>;
  /** The intended critical path, executable by the autopilot. */
  readonly route: RouteStep[];
  debugInfo(): Record<string, unknown>;
}

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
import type { TraversalSurfaces } from '../player/Traversal';

/** Everything a level needs from the game. Levels never reach into `Game` directly. */
export interface LevelContext {
  /** Play the story opening when the level starts. */
  intro: boolean;
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
  /** Register climbable ledges and vaultable obstacles here. */
  traversal: TraversalSurfaces;
  /** Respawn at the current checkpoint (used by fall recovery). */
  respawn(reason: 'fall' | 'manual'): void;
  /** Show the completion screen (`reward`: laid over the current view rather than a menu). */
  complete(card?: { title: string; body: string; reward?: boolean }): void;
  /** Hold or release player control (cutscene beats). */
  setControl(enabled: boolean): void;
}

/** One step of the scripted dev/test route (see dev/Autopilot.ts). */
export type RouteStep =
  | { kind: 'move'; to: [number, number, number]; radius?: number; precise?: boolean }
  | { kind: 'jump'; from: [number, number, number]; to: [number, number, number] }
  | { kind: 'vault'; from: [number, number, number]; to: [number, number, number] }
  | { kind: 'climb'; from: [number, number, number]; to: [number, number, number] }
  | { kind: 'interact'; id: string; standAt: [number, number, number]; expectFlag?: string }
  | { kind: 'wait'; until: string; timeout?: number }
  | { kind: 'pause'; seconds: number };

export interface Level {
  readonly name: string;
  /** Ordered checkpoint ids, first is the section start. */
  readonly checkpointIds: string[];
  fixedUpdate(dt: number, time: number): void;
  /** Jump/Interact pressed while a cinematic holds control: finish it now in a valid state. */
  skipCinematic?(): void;
  /** Runs after the player moved and before the physics step (moving platforms go here). */
  afterPlayer?(dt: number): void;
  /** Called after the player is recovered at checkpoint `id` (falls and manual respawn). */
  onRespawn?(id: string): void;
  update(dt: number, time: number, alpha: number): void;
  /** Restore the complete initial state ("Restart section"). */
  reset(): void;
  /** Put props/flags into the state implied by reaching a checkpoint (dev teleports). */
  applyCheckpointState(id: string): void;
  /** Something nearby worth a glance (Mara turns her head toward it), or null. */
  pointOfInterest?(feet: THREE.Vector3, facing: number): THREE.Vector3 | null;
  /** Give the next tier of hint for the current objective. */
  hint(): void;
  /** Named conditions for the autopilot / tests. */
  readonly conditions: Record<string, () => boolean>;
  /** The intended critical path, executable by the autopilot. */
  readonly route: RouteStep[];
  /** Named parts of the route that can be run on their own (tests, ?autoplay=part). */
  readonly routeParts?: Record<string, RouteStep[]>;
  debugInfo(): Record<string, unknown>;
}

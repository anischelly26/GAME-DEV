import * as THREE from 'three';
import { EventBus, type GameEvents } from './Events';
import { Input } from './Input';
import { Physics, RAPIER } from '../physics/Physics';
import { RenderPipeline } from '../render/RenderPipeline';
import { createTextureLibrary, type TextureLibrary } from '../world/textures';
import { createMaterials, Palette, type MaterialLibrary } from '../world/materials';
import { Sky } from '../world/Atmosphere';
import { PlayerController } from '../player/PlayerController';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { Progression, Checkpoints, Triggers } from '../gameplay/Progression';
import { InteractionSystem } from '../gameplay/Interaction';
import { Dialogue } from '../gameplay/Dialogue';
import { HUD, type Settings } from '../ui/HUD';
import { AudioSystem } from '../audio/Audio';
import type { Level, LevelContext } from '../levels/Level';
import { QuietCellLevel } from '../levels/breakwater/QuietCellLevel';
import { Autopilot } from '../dev/Autopilot';
import { TraversalSurfaces } from '../player/Traversal';
import { smoothstep } from './math';

export const FIXED_DT = 1 / 60;
const BASE_MOUSE_SENSITIVITY = 0.0022;

export interface GameOptions {
  /** Dev hotkeys, debug overlay, test API. */
  dev: boolean;
  /** Automated testing: no title screen, no pause on focus loss, simulation advanced by `step()`. */
  test: boolean;
  /** In test mode, also run the simulation in real time. */
  realtime: boolean;
  autoplay: boolean;
  start: string | null;
  quality: 'high' | 'low' | null;
}

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'complete';

/**
 * Owns the main loop and wires the systems together. Gameplay rules live in the level, the player
 * controller and the gameplay systems, not here.
 */
export class Game {
  state: GameState = 'loading';
  readonly events = new EventBus<GameEvents>();
  readonly scene = new THREE.Scene();
  readonly input: Input;
  readonly hud: HUD;
  readonly audio = new AudioSystem();
  readonly progression: Progression;
  readonly checkpoints: Checkpoints;
  readonly triggers = new Triggers();
  readonly interactions = new InteractionSystem();
  readonly dialogue: Dialogue;
  readonly traversal = new TraversalSurfaces();
  physics!: Physics;
  pipeline!: RenderPipeline;
  player!: PlayerController;
  avatar!: PlayerAvatar;
  camera!: ThirdPersonCamera;
  level!: Level;
  autopilot: Autopilot | null = null;

  private textures!: TextureLibrary;
  private materials!: MaterialLibrary;
  private sky!: Sky;
  /** Toward the moon: low over the sea behind the harbour beacon, so it shines in through the breach. */
  private readonly moonDir = new THREE.Vector3(-0.38, 0.33, -0.86).normalize();
  private accumulator = 0;
  private lastFrame = 0;
  time = 0;
  private respawnFade = 0;
  private hadPointerLock = false;
  private debugVisible = false;
  private physicsLines: THREE.LineSegments | null = null;
  private fps = 60;
  private reachChecks = 0;
  private reachPulse = 0;

  private constructor(
    private readonly container: HTMLElement,
    readonly options: GameOptions,
  ) {
    this.hud = new HUD(container);
    this.input = new Input(container);
    this.progression = new Progression(this.events);
    this.checkpoints = new Checkpoints(this.events);
    this.dialogue = new Dialogue(this.events);
  }

  static async create(container: HTMLElement, options: GameOptions): Promise<Game> {
    const game = new Game(container, options);
    await game.init();
    return game;
  }

  private async init(): Promise<void> {
    this.hud.showLoading('Charging the tide engine…');
    // Let the loading card paint before the heavy synchronous texture generation.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    this.physics = await Physics.create();
    this.textures = createTextureLibrary();
    this.materials = createMaterials(this.textures);

    this.scene.background = Palette.skyTop.clone();
    this.scene.fog = new THREE.FogExp2(Palette.fog, 0.024);
    this.setupLights();
    this.sky = new Sky(this.moonDir);
    this.scene.add(this.sky.mesh);

    const spawn = new THREE.Vector3(0, 0, 0);
    this.player = new PlayerController(this.physics, this.events, spawn, 0);
    this.player.traversal = this.traversal;
    this.avatar = new PlayerAvatar(this.scene, this.textures);
    this.camera = new ThirdPersonCamera(this.physics, this.player.collider);
    this.pipeline = new RenderPipeline(this.container, this.scene, this.camera.camera);
    this.container.insertBefore(this.pipeline.canvas, this.hud.root);
    this.environmentMap();

    const ctx: LevelContext = {
      scene: this.scene,
      physics: this.physics,
      materials: this.materials,
      textures: this.textures,
      events: this.events,
      input: this.input,
      progression: this.progression,
      checkpoints: this.checkpoints,
      triggers: this.triggers,
      interactions: this.interactions,
      dialogue: this.dialogue,
      player: this.player,
      avatar: this.avatar,
      camera: this.camera,
      hud: this.hud,
      moonDir: this.moonDir,
      traversal: this.traversal,
      respawn: (reason) => this.respawn(reason),
      complete: (card) => this.complete(card),
      setControl: (enabled) => this.setControl(enabled),
    };
    this.level = new QuietCellLevel(ctx);
    this.wireEvents();
    this.applySettings(this.hud.settings);
    // Automated runs default to Low: software rendering in CI sandboxes is slow and memory-bound.
    const forced = this.options.quality ?? (this.options.test ? 'low' : null);
    if (forced) this.setQuality(forced);

    const startId = this.options.start && this.level.checkpointIds.includes(this.options.start) ? this.options.start : this.level.checkpointIds[0];
    this.teleportToCheckpoint(startId);
    // Compile shaders up front to avoid a hitch on the first frame.
    this.pipeline.renderer.compile(this.scene, this.camera.camera);

    if (this.options.dev || this.options.test) this.installDevTools();
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);

    if (this.options.test) {
      this.hud.hideScreen();
      this.state = 'playing';
      if (this.options.autoplay) this.startAutopilot();
    } else {
      this.state = 'title';
      this.hud.showTitle(() => this.begin());
    }
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight('#3f5f78', '#1b1712', 0.75);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(Palette.moon, 1.5);
    moon.position.copy(this.moonDir).multiplyScalar(60);
    moon.target.position.set(0, 0, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(4096, 4096);
    const cam = moon.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 140;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    moon.shadow.radius = 2;
    this.scene.add(moon, moon.target);
  }

  /** Night-time reflections for metals: cold sky above, warm lamp glow near the horizon. */
  private environmentMap(): void {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { moonDir: { value: this.moonDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 moonDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(vec3(0.05,0.07,0.09), vec3(0.12,0.2,0.28), smoothstep(-0.2, 0.8, d.y));
          col += vec3(0.9,0.55,0.25) * 0.5 * exp(-abs(d.y + 0.05) * 9.0) * (0.5 + 0.5 * sin(atan(d.z, d.x) * 3.0));
          col += vec3(0.7,0.8,1.0) * pow(max(dot(d, moonDir), 0.0), 40.0) * 3.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(this.pipeline.renderer);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  private wireEvents(): void {
    this.events.on('objective', ({ text }) => this.hud.setObjective(text));
    // The level may have set its first objective before this listener existed.
    this.hud.setObjective(this.progression.objective);
    this.dialogue.onShow = (line) => this.hud.showLine(line);
    this.events.on('jump', () => {
      this.avatar.onJump();
      this.audio.play('jump', this.player.feet, 0.8);
    });
    this.events.on('land', ({ impact }) => {
      this.avatar.onLand(impact);
      if (impact > 3) this.audio.play('land', this.player.feet, Math.min(1, impact / 10));
    });
    this.events.on('sfx', (e) => this.audio.play(e.name, e.x !== undefined ? { x: e.x, y: e.y ?? 0, z: e.z ?? 0 } : undefined, e.volume ?? 1));
    this.avatar.onFootstep = (speed) => this.audio.play('footstep', this.player.feet, Math.min(1, speed / 6) * 0.8);

    this.input.onPauseRequest = () => {
      if (this.hud.documentOpen) this.hud.hideDocument();
      else if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.input.onRecenter = () => this.camera.recenter(this.player.facing);
    this.pipeline.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.options.test) this.input.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) this.hadPointerLock = true;
      else if (this.hadPointerLock && this.state === 'playing' && !this.options.test) this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !this.options.test) this.pause();
    });
  }

  // ---------------------------------------------------------------- state changes

  private begin(): void {
    this.audio.unlock();
    this.audio.setVolume(this.hud.settings.volume);
    this.state = 'playing';
    this.input.requestPointerLock();
    if (this.options.autoplay) this.startAutopilot();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clear();
    this.input.exitPointerLock();
    this.audio.suspend(true);
    this.hud.showPause(
      {
        resume: () => this.resume(),
        restartCheckpoint: () => {
          this.resume();
          this.respawn('manual');
        },
        restartSection: () => this.restartSection(),
        hint: () => this.level.hint(),
        settingsChanged: (s) => this.applySettings(s),
      },
      this.checkpoints.current?.id !== this.level.checkpointIds[0],
    );
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.hud.hideScreen();
    this.state = 'playing';
    this.audio.suspend(false);
    this.input.requestPointerLock();
  }

  private applySettings(s: Settings): void {
    this.input.mouseSensitivity = BASE_MOUSE_SENSITIVITY * s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    if (!this.options.quality && !this.options.test) this.setQuality(s.quality);
  }

  /** Low: lower resolution, no bloom, smaller moon shadow map, no lamp shadows. */
  setQuality(level: 'high' | 'low'): void {
    this.pipeline.setQuality(level);
    this.scene.traverse((o) => {
      const light = o as THREE.Light & { shadow?: THREE.LightShadow };
      if (!light.isLight || !light.shadow) return;
      if ((light as THREE.DirectionalLight).isDirectionalLight) {
        const size = level === 'high' ? 4096 : 1536;
        if (light.shadow.mapSize.x !== size) {
          light.shadow.mapSize.set(size, size);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
      } else {
        light.userData.wantsShadow ??= light.castShadow;
        light.castShadow = level === 'high' && light.userData.wantsShadow;
      }
    });
  }

  setControl(enabled: boolean): void {
    this.input.enabled = enabled;
    this.player.frozen = !enabled;
    if (!enabled) this.input.clear();
  }

  respawn(reason: 'fall' | 'manual'): void {
    const cp = this.checkpoints.current;
    if (!cp) return;
    this.player.teleport(cp.feet, cp.facing);
    this.camera.clearShot();
    this.camera.snapBehind(cp.feet, cp.facing, 0.32, cp.cameraYaw);
    this.triggers.resetPresence();
    this.respawnFade = 1;
    if (reason === 'fall') this.audio.play('respawn');
  }

  /** Back to a completely fresh run of the section. */
  restartSection(): void {
    this.progression.reset();
    this.dialogue.reset();
    this.triggers.rearm();
    this.hud.resetRun();
    this.level.reset();
    this.checkpoints.force(this.level.checkpointIds[0]);
    this.camera.clearShot();
    this.setControl(true);
    const cp = this.checkpoints.current!;
    this.player.teleport(cp.feet, cp.facing);
    this.camera.snapBehind(cp.feet, cp.facing, 0.32);
    this.respawnFade = 1;
    this.hud.hideScreen();
    this.state = 'playing';
    this.audio.suspend(false);
    if (!this.options.test) this.input.requestPointerLock();
  }

  private complete(card?: { title: string; body: string }): void {
    this.progression.complete = true;
    this.state = 'complete';
    this.input.exitPointerLock();
    this.events.emit('complete', { timeSeconds: this.progression.elapsed, falls: this.progression.falls });
    this.hud.showComplete(
      { time: this.progression.elapsed, falls: this.progression.falls, ...card },
      () => this.restartSection(),
      () => {
        this.hud.hideScreen();
        this.camera.clearShot();
        this.setControl(true);
        this.state = 'playing';
        if (!this.options.test) this.input.requestPointerLock();
      },
    );
  }

  /** Dev/test: jump to a checkpoint with a consistent world state. */
  teleportToCheckpoint(id: string): void {
    const cp = this.checkpoints.force(id);
    if (!cp) return;
    for (const f of cp.impliesFlags) this.progression.set(f);
    this.level.applyCheckpointState(id);
    this.player.teleport(cp.feet, cp.facing);
    this.camera.clearShot();
    this.camera.snapBehind(cp.feet, cp.facing, 0.32, cp.cameraYaw);
    this.triggers.resetPresence();
  }

  startAutopilot(part?: string): Autopilot {
    this.autopilot = new Autopilot(
      {
        input: this.input,
        player: this.player,
        interactions: this.interactions,
        progression: this.progression,
        conditions: this.level.conditions,
        cameraYaw: () => this.camera.yaw,
      },
      (part && this.level.routeParts?.[part]) || this.level.route,
    );
    return this.autopilot;
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    // rAF timestamps can precede the last performance.now() reading: never feed a negative dt.
    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.input.pollFrame(dt);
    const simulate = this.state === 'playing' || this.state === 'complete';
    if (simulate && (!this.options.test || this.options.realtime)) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 6) {
        this.fixedStep();
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 6) this.accumulator = 0;
    }
    this.renderFrame(dt, this.options.test && !this.options.realtime ? 1 : this.accumulator / FIXED_DT);
  };

  /** One deterministic simulation step. */
  fixedStep(): void {
    const dt = FIXED_DT;
    this.autopilot?.fixedUpdate(dt);
    const frame = this.input.sampleFixed();
    if (this.hud.documentOpen && (frame.interactPressed || Math.hypot(frame.moveX, frame.moveY) > 0.5)) {
      this.hud.hideDocument();
      frame.interactPressed = false;
    }
    this.level.fixedUpdate(dt, this.time);
    this.player.fixedUpdate(dt, frame, this.camera.yaw);
    this.level.afterPlayer?.(dt);
    this.interactions.update(this.player.feet, this.player.facing);
    if (frame.interactPressed && !this.player.isLocked) {
      const id = this.interactions.interact();
      if (id) this.events.emit('interact', { id });
    }
    this.triggers.update(this.player.feet);
    this.physics.step();
    this.player.postStep();
    this.dialogue.update(dt);
    if (!this.progression.complete) this.progression.elapsed += dt;
    this.time += dt;
    this.reachChecks++;
  }

  private readonly tmpFeet = new THREE.Vector3();
  private readonly tmpProj = new THREE.Vector3();

  /** Per-render-frame work: animation, camera, effects, HUD. */
  renderFrame(dt: number, alpha: number): void {
    const feet = this.player.interpolatedFeet(Math.min(1, alpha), this.tmpFeet);
    const focus = this.interactions.focused;
    this.reachPulse = Math.max(0, this.reachPulse - dt * 2);
    this.avatar.update(dt, {
      feet,
      facing: this.player.facing,
      speed: this.player.speed,
      verticalSpeed: this.player.velocity.y,
      grounded: this.player.grounded,
      carrying: false,
      reach: this.player.isLocked && !this.player.frozen ? 0.5 : this.reachPulse,
      lookAt: focus ? focus.position : null,
      mode: this.player.mode,
      modeT: this.player.modeT,
    });
    const look = this.state === 'playing' ? this.input.consumeLook() : (this.input.consumeLook(), { dx: 0, dy: 0 });
    this.camera.update(dt, look, 1, feet, this.player.grounded, this.player.speed);
    this.avatar.setOpacity(this.camera.inShot ? 1 : smoothstep(0.5, 1.25, this.camera.distance));
    this.level.update(dt, this.time, alpha);
    this.sky.update(this.time, this.camera.camera.position);
    this.audio.setListener(this.camera.camera);

    // Interaction prompt anchored to the object on screen.
    const promptText = this.state === 'playing' && !this.player.frozen && !this.hud.documentOpen ? this.interactions.focusedPrompt : null;
    if (promptText) {
      const anchor = focus ? this.tmpProj.copy(focus.position) : this.tmpProj.copy(feet).setY(feet.y + 1.9);
      anchor.project(this.camera.camera);
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      const onScreen = anchor.z < 1 && Math.abs(anchor.x) < 1.1 && Math.abs(anchor.y) < 1.1;
      const x = onScreen ? (anchor.x * 0.5 + 0.5) * w : w / 2;
      const y = onScreen ? (-anchor.y * 0.5 + 0.5) * h - 34 : h * 0.62;
      this.hud.setPrompt(promptText, Math.min(w - 120, Math.max(120, x)), Math.min(h - 60, Math.max(60, y)), this.input.usingGamepad);
    } else this.hud.setPrompt(null, 0, 0, false);

    this.respawnFade = Math.max(0, this.respawnFade - dt * 2.2);
    this.hud.setFade(this.respawnFade);
    this.hud.update(dt);
    if (this.debugVisible) this.updateDebug();
    if (this.physicsLines) this.updatePhysicsLines();
    this.pipeline.render(this.time);
  }

  // ---------------------------------------------------------------- dev tools

  private installDevTools(): void {
    this.input.onDevKey = (code) => {
      if (code === 'Backquote' || code === 'F3') this.debugVisible = !this.debugVisible;
      if (!this.debugVisible) this.hud.setDebug(null);
      if (code === 'KeyT') this.togglePhysicsLines();
      if (code === 'KeyR' && this.state === 'playing') this.respawn('manual');
      if (code === 'Digit0') this.restartSection();
      const n = /^Digit([1-9])$/.exec(code);
      if (n) {
        const id = this.level.checkpointIds[Number(n[1]) - 1];
        if (id) this.teleportToCheckpoint(id);
      }
    };
    (window as unknown as { __GAME: unknown }).__GAME = this.testApi();
  }

  private testApi() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const game = this;
    return {
      ready: true,
      game,
      RAPIER,
      state: () => ({
        gameState: game.state,
        feet: game.player.feet.toArray().map((n) => Number(n.toFixed(3))),
        velocity: game.player.velocity.toArray().map((n) => Number(n.toFixed(3))),
        grounded: game.player.grounded,
        mode: game.player.mode,
        facing: game.player.facing,
        flags: game.progression.list(),
        objective: game.progression.objective,
        checkpoint: game.checkpoints.current?.id ?? null,
        falls: game.progression.falls,
        complete: game.progression.complete,
        focused: game.interactions.focused?.id ?? null,
        prompt: game.interactions.focusedPrompt,
        cameraZone: game.camera.activeZone,
        cameraDistance: Number(game.camera.distance.toFixed(3)),
        level: game.level.debugInfo(),
        autopilot: game.autopilot?.status ?? null,
        time: Number(game.time.toFixed(3)),
      }),
      /** Advance the simulation by `n` fixed steps (render once at the end). */
      step: (n = 1) => {
        for (let i = 0; i < n; i++) {
          if (game.state === 'playing' || game.state === 'complete') game.fixedStep();
          game.renderFrame(FIXED_DT, 1);
        }
        return game.player.feet.toArray();
      },
      /** Like step, but skips rendering between steps (fast). */
      stepFast: (n = 1) => {
        for (let i = 0; i < n; i++) {
          if (game.state === 'playing' || game.state === 'complete') game.fixedStep();
        }
        game.renderFrame(FIXED_DT, 1);
        return game.player.feet.toArray();
      },
      teleport: (id: string) => game.teleportToCheckpoint(id),
      restart: () => game.restartSection(),
      setInput: (v: { moveX: number; moveY: number; jumpHeld: boolean } | null) => {
        game.input.virtual = v;
      },
      press: (a: 'jump' | 'interact') => game.input.press(a),
      setCamera: (yaw: number, pitch?: number) => {
        game.camera.yaw = yaw;
        if (pitch !== undefined) game.camera.pitch = pitch;
      },
      setPlayer: (x: number, y: number, z: number, facing = 0) => game.player.teleport(new THREE.Vector3(x, y, z), facing),
      /** Run the scripted route (all of it, or a named part such as 'engine'). */
      autopilot: (part?: string) => game.startAutopilot(part).status,
      pause: () => game.pause(),
      resume: () => game.resume(),
      fps: () => Math.round(game.fps),
    };
  }

  private updateDebug(): void {
    const p = this.player.feet;
    const info = this.level.debugInfo();
    this.hud.setDebug(
      [
        `fps ${this.fps.toFixed(0)}  state ${this.state}`,
        `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`,
        `vel ${this.player.velocity.x.toFixed(1)} ${this.player.velocity.y.toFixed(1)} ${this.player.velocity.z.toFixed(1)}  ${this.player.grounded ? 'grounded' : 'air'}`,
        `camera ${this.camera.activeZone} d=${this.camera.distance.toFixed(2)}`,
        `checkpoint ${this.checkpoints.current?.id}  falls ${this.progression.falls}`,
        `focus ${this.interactions.focused?.id ?? '-'}`,
        ...Object.entries(info).map(([k, v]) => `${k} ${String(v)}`),
        `flags ${this.progression.list().join(', ')}`,
        `[\`] debug  [T] physics  [R] respawn  [1-3] checkpoints  [0] restart`,
      ].join('\n'),
    );
  }

  private togglePhysicsLines(): void {
    if (this.physicsLines) {
      this.scene.remove(this.physicsLines);
      this.physicsLines.geometry.dispose();
      this.physicsLines = null;
      return;
    }
    this.physicsLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 }));
    this.physicsLines.frustumCulled = false;
    this.physicsLines.renderOrder = 999;
    this.scene.add(this.physicsLines);
  }

  private updatePhysicsLines(): void {
    const { vertices, colors } = this.physics.debugLines();
    const g = this.physicsLines!.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Level, LevelContext, RouteStep } from '../Level';
import { RingTrack, WatchSentry } from '../../gameplay/WatchSentry';
import { buildCoast, type Coast } from './Coast';
import { Skiff } from './Skiff';
import { C, surgeAt } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Beat {
  at: number;
  run: () => void;
  done?: boolean;
  watchOnly?: boolean;
}

/** Checkpoints where Mara comes back aboard the skiff: where it floats, which way it points. */
const BOAT_CPS: Record<string, { at: THREE.Vector3; heading: number }> = {
  skiff: { at: C.skiffAt.clone(), heading: 0.35 },
  bar: { at: v3(24, 0, 61), heading: 0 },
  lagoon: { at: v3(26, 0, 76), heading: -0.3 },
};

/**
 * Chapter Three, "The Low Tide": late morning on the water between the hangar spur and Knoll Rock.
 * Mara swims out to a moored steam skiff, takes it across to the lagoon's mouth, where the bar is
 * too shallow at low water until Breakwater's engine sends a surge over it, slips past a Watch on
 * a patrol boat that listens for her engine, docks at the lighthouse's stairs and climbs to the
 * gallery, where someone has lit the lamp.
 */
export class LowTideLevel implements Level {
  readonly name = 'The Low Tide';
  readonly checkpointIds = ['slipway', 'skiff', 'bar', 'lagoon', 'stairs'];
  readonly conditions: Record<string, () => boolean>;
  readonly route: RouteStep[];
  readonly routeParts: Record<string, RouteStep[]>;
  readonly coast: Coast;
  readonly skiff: Skiff;
  readonly patrol: WatchSentry;
  private readonly patrolHolder = new THREE.Group();
  private sequence: { t: number; steps: Beat[] } | null = null;
  private time = 0;
  /** Board the skiff on the next step (after a respawn or a dev teleport moved her). */
  private boardNext = false;
  private noiseT = 0;
  private lastWatchLine = -99;
  private lastSurge = 0;
  private steamT = 0;
  private hintTier = 0;
  private readonly chest = new THREE.Vector3();

  static async create(ctx: LevelContext): Promise<LowTideLevel> {
    const lh = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/models/lighthouse.glb`).catch((e: unknown) => {
      console.warn('lighthouse.glb unavailable; its colliders stand alone.', e);
      return null;
    });
    return new LowTideLevel(ctx, lh);
  }

  private constructor(
    private readonly ctx: LevelContext,
    lighthouse: GLTF | null,
  ) {
    const { scene, physics, materials: m, events, interactions, player, progression, dialogue, hud, camera } = ctx;
    this.coast = buildCoast(ctx, lighthouse);
    player.steam = true;
    player.water = { level: () => this.coast.level };

    // ------------------------------------------------------------ the skiff, on its buoy
    this.skiff = new Skiff(physics, m, C.skiffAt, BOAT_CPS.skiff.heading);
    scene.add(this.skiff.group);
    {
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: '#c96a2a', roughness: 0.6 }));
      buoy.position.copy(C.skiffAt).add(v3(0, 0.15, 2.6));
      buoy.castShadow = true;
      scene.add(buoy);
    }
    this.skiff.onBump = (kind, at) => {
      events.emit('sfx', { name: 'thunk', x: at.x, y: at.y, z: at.z, volume: 0.8 });
      ctx.camera.shake(0.15);
      if (kind === 'aground' && at.z > C.mouth.z - 6 && at.z < C.mouth.z + 6) {
        dialogue.sayOnce('bar-aground', 'Mara', "Aground. The bar's too shallow at low water.", 2.6, { story: true });
      }
    };

    // ------------------------------------------------------------ the Watch's patrol boat
    this.patrolHolder.position.set(C.light.x, 0, C.light.z);
    scene.add(this.patrolHolder);
    const track = new RingTrack(this.patrolHolder, C.patrolR, () => this.coast.level, new THREE.Vector2(C.light.x, C.light.z));
    // Starting on the far side of the lighthouse from the mouth.
    this.patrol = new WatchSentry(physics, m, track, track.at(0), { range: 13 });
    this.patrol.enabled = ctx.watch;
    {
      // Its boat: a grey launch under it.
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 3.0), new THREE.MeshStandardMaterial({ color: '#4a555c', roughness: 0.6, metalness: 0.4 }));
      hull.position.y = -0.1;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 2.8), m.ironDark);
      deck.position.y = 0.17;
      this.patrol.group.add(hull, deck);
    }
    events.on('groundPound', (e) => {
      if (this.patrol.enabled && this.patrol.pound(e)) {
        const p = this.patrol.position();
        events.emit('sfx', { name: 'watchStun', x: p.x, y: p.y + 1, z: p.z });
      }
    });

    // ------------------------------------------------------------ checkpoints
    const stand = this.coast.stairFoot;
    const cps: Array<{ id: string; order: number; label: string; feet: THREE.Vector3; facing: number }> = [
      { id: 'slipway', order: 1, label: 'The slipway', feet: v3(0, C.slipway.top, -9.5), facing: 0 },
      { id: 'skiff', order: 2, label: 'The skiff', feet: this.skiffSeat('skiff'), facing: BOAT_CPS.skiff.heading },
      { id: 'bar', order: 3, label: 'The bar', feet: this.skiffSeat('bar'), facing: BOAT_CPS.bar.heading },
      { id: 'lagoon', order: 4, label: 'The lagoon', feet: this.skiffSeat('lagoon'), facing: BOAT_CPS.lagoon.heading },
      { id: 'stairs', order: 5, label: 'Knoll Rock', feet: stand.clone(), facing: Math.PI },
    ];
    for (const c of cps) ctx.checkpoints.register({ id: c.id, order: c.order, label: c.label, feet: c.feet, facing: c.facing, impliesFlags: ['kicker.taken'] });

    // ------------------------------------------------------------ interactions: board, dock
    const skiffSeat = new THREE.Vector3();
    interactions.add({
      id: 'skiff',
      get position() {
        return skiffSeat;
      },
      radius: 2.6,
      prompt: () => {
        this.skiff.seatFeet(skiffSeat).setY(this.coast.level + 0.4);
        return (player.mode === 'move' || player.mode === 'swim') && player.ride === null ? 'Climb into the skiff' : null;
      },
      interact: () => this.board(),
    });
    const stairs = this.coast.stairFoot.clone().setY(this.coast.stairFoot.y + 0.6);
    interactions.add({
      id: 'stairs',
      position: stairs,
      radius: 4.5,
      prompt: () => (player.ride === this.skiff ? 'Step onto the stairs' : null),
      interact: () => {
        this.skiff.ridden = false;
        // Just above the treads (she settles onto them), never inside the ramp.
        player.teleport(this.coast.stairFoot.clone().add(v3(0, 0.45, 0.3)), 0);
        events.emit('sfx', { name: 'land:metal', x: stairs.x, y: stairs.y, z: stairs.z });
        if (ctx.checkpoints.reach('stairs')) events.emit('sfx', { name: 'ignite' });
        progression.setObjective('Climb up to the gallery');
        dialogue.sayOnce('stairs', 'Mara', "Up we go. Whoever lit that lamp came this way.", 2.8, { story: true });
      },
    });
    camera.zones.push({ id: 'boat', contains: () => player.ride === this.skiff, distance: 6.6, height: 2.2, fov: 62, priority: 5 });

    // ------------------------------------------------------------ the story
    const { triggers } = ctx;
    triggers.add({
      id: 'near-bar',
      contains: (p) => p.z > 52 && p.z < C.mouth.z && player.ride === this.skiff,
      onEnter: () => {
        if (ctx.checkpoints.reach('bar')) events.emit('sfx', { name: 'ignite' });
        progression.setObjective('Cross the bar into the lagoon');
        dialogue.say('Mara', "The lagoon's behind that bar. And the tide's out.", 2.8, { story: true });
      },
    });
    triggers.add({
      id: 'lagoon',
      contains: (p) => p.z > C.mouth.z + 4 && Math.hypot(p.x - C.light.x, p.z - C.light.z) < C.lagoonR,
      onEnter: () => {
        if (player.ride === this.skiff && ctx.checkpoints.reach('lagoon')) events.emit('sfx', { name: 'ignite' });
        progression.set('lagoon.reached');
        progression.setObjective('Reach the lighthouse stairs');
        if (this.patrol.enabled) {
          dialogue.say('Mara', "A Watch boat. It'll hear the engine before it sees me.", 3, { story: true });
          hud.tip('Ease off near the Watch: a quiet engine carries less far. Rocks and the piles hide you.', 'patrol');
        }
      },
    });
    triggers.add({
      id: 'door',
      contains: (p) => p.distanceTo(this.coast.door) < 1.8 && p.y > this.coast.door.y - 0.6,
      onEnter: () => this.ending(),
    });

    this.conditions = {
      aboard: () => player.ride === this.skiff,
      'in-lagoon': () => progression.has('lagoon.reached'),
      done: () => progression.has('tide.finished'),
    };
    // The autopilot can walk and swim; the boat is driven by the tests.
    this.route = [
      { kind: 'move', to: [0, C.slipway.top, -5] },
      { kind: 'move', to: [1, 0.3, 11] },
      { kind: 'move', to: [5, 0, 21] },
      { kind: 'interact', id: 'skiff', standAt: [7.2, 0, 23.6], expectFlag: 'skiff.boarded' },
    ];
    this.routeParts = { swim: this.route };

    events.emit('music', { music: 'hall', ambience: 'waves' });
    progression.setObjective('Swim out to the skiff');
    if (ctx.intro) this.opening();
    else hud.tip('Swim: move as usual. Swim into a low ledge to climb out; Space kicks up.', 'swim');
  }

  private skiffSeat(id: string): THREE.Vector3 {
    const b = BOAT_CPS[id];
    return v3(b.at.x - Math.sin(b.heading) * 1.0, 0.05, b.at.z - Math.cos(b.heading) * 1.0);
  }

  private board(): void {
    const { player, progression, hud, events, dialogue } = this.ctx;
    this.skiff.ridden = true;
    player.startRide(this.skiff);
    events.emit('sfx', { name: 'thunk', x: this.skiff.pos.x, y: this.skiff.pos.y, z: this.skiff.pos.z, volume: 0.5 });
    if (progression.set('skiff.boarded')) {
      if (this.ctx.checkpoints.reach('skiff')) events.emit('sfx', { name: 'ignite' });
      dialogue.say('Mara', 'Still warm. Somebody fired this boiler not long ago.', 2.8, { story: true });
      hud.tip(this.ctx.input.usingGamepad ? 'Skiff: the left stick steers toward where it points and sets the speed. A: jump out.' : 'Skiff: steer toward where you point (W A S D, relative to the camera); push for speed. Space: jump out.', 'skiff');
      progression.setObjective('Take the skiff to Knoll Rock');
    }
  }

  // ---------------------------------------------------------------- the opening and the end

  get cinematicActive(): boolean {
    return this.sequence !== null && this.ctx.player.frozen;
  }

  private opening(): void {
    const { hud, camera, setControl, dialogue, player } = this.ctx;
    const cp = this.ctx.checkpoints.get('slipway')!;
    setControl(false);
    hud.letterbox(true);
    const feet = cp.feet;
    this.sequence = {
      t: 0,
      steps: [
        {
          at: 0,
          watchOnly: true,
          run: () => {
            hud.story({ eyebrow: 'Chapter Three', title: 'The Low Tide', text: 'Late morning. The water between the spur and Knoll Rock.', backdrop: false, lower: true });
            camera.playShot(v3(8, 3.5, 10), v3(0, 1, -8), 6, { from: { pos: v3(18, 6, 30), look: v3(20, 4, 80) }, fov: 52 });
          },
        },
        { at: 3.8, watchOnly: true, run: () => hud.story(null) },
        { at: 4.2, watchOnly: true, run: () => dialogue.say('Mara', "Low tide. There's a skiff out on that buoy...", 2.6, { story: true }) },
        { at: 7.0, watchOnly: true, run: () => dialogue.say('Mara', 'And that light. Somebody is out there.', 2.4, { story: true }) },
        {
          at: 8.0,
          run: () => {
            hud.story(null);
            hud.letterbox(false);
            player.teleport(feet, cp.facing);
            camera.clearShot();
            camera.snapBehind(feet, cp.facing, 0.3);
            setControl(true);
            hud.tip('Swim: move as usual. Swim into a low ledge to climb out; Space kicks up.', 'swim');
          },
        },
      ],
    };
  }

  skipCinematic(): void {
    if (!this.cinematicActive || !this.sequence) return;
    for (const s of this.sequence.steps) {
      if (s.done) continue;
      s.done = true;
      if (!s.watchOnly) s.run();
    }
    this.sequence = null;
    this.ctx.events.emit('sfx', { name: 'paper' });
  }

  private ending(): void {
    const { progression, dialogue, camera, events } = this.ctx;
    if (progression.has('tide.finished')) return;
    progression.set('tide.finished');
    progression.setObjective('');
    events.emit('music', { music: 'ending' });
    const feet = this.ctx.player.feet.clone();
    dialogue.say('Mara', "The door's been forced. And the lamp... new copper on the burner. Like the pipe in my cell.", 4.2, { story: true });
    this.sequence = {
      t: 0,
      steps: [
        { at: 0.3, watchOnly: true, run: () => camera.playShot(feet.clone().add(v3(3.5, 2.5, -4)), v3(C.light.x, feet.y + 7, C.light.z), 6) },
        { at: 4.6, watchOnly: true, run: () => dialogue.say('Mara', 'Chalked on the lens housing: "IV". Ivo, what are you doing out here?', 3.6, { story: true }) },
        {
          at: 8.5,
          run: () =>
            this.ctx.complete({
              title: 'The Low Tide',
              body: 'Mara reached the lighthouse on Knoll Rock. Someone forced the door, mended the lamp with new copper and left an "IV" on the lens. Next: Chapter Four, <i>The Pier Arcade</i> (in development).',
              reward: true,
            }),
        },
      ],
    };
  }

  // ---------------------------------------------------------------- the loop

  fixedUpdate(dt: number, time: number): void {
    this.time = time;
    const { player, events, dialogue, avatar, camera } = this.ctx;
    player.steam = true;
    if (this.sequence) {
      this.sequence.t += dt;
      for (const s of this.sequence.steps) {
        if (!s.done && this.sequence.t >= s.at) {
          s.done = true;
          s.run();
        }
      }
      if (this.sequence.steps.every((s) => s.done)) this.sequence = null;
    }

    // The sea: low water, and Breakwater's surge every few seconds.
    const surge = surgeAt(time);
    const level = C.surge.height * surge;
    this.coast.level = level;
    this.skiff.level = level;
    this.patrolHolder.position.y = level;
    if (surge > 0.02 && this.lastSurge <= 0.02) {
      events.emit('sfx', { name: 'engineThump' });
      if (this.skiff.ridden && Math.abs(this.skiff.pos.z - C.mouth.z) < 14) {
        camera.shake(0.12);
        dialogue.sayOnce('surge', 'Mara', "The engine's breath! Breakwater pushes the sea up over the bar. Now!", 3, { story: true });
      }
    }
    this.lastSurge = surge;

    if (this.boardNext) {
      this.boardNext = false;
      this.skiff.ridden = true;
      player.startRide(this.skiff);
    }
    // Nobody aboard: it drifts to a stop.
    if (player.ride !== this.skiff) this.skiff.advance(dt, 0, 0, 0);

    // Steam from the funnel, more with the throttle; the engine is heard.
    this.steamT -= dt;
    if (this.steamT <= 0) {
      this.steamT = this.skiff.ridden ? 0.35 - this.skiff.throttle * 0.2 : 1.2;
      const f = this.skiff.funnelTop;
      this.ctx.effects.burst(f, { count: 2, color: '#eef2f2', dir: { x: 0, y: 1, z: 0 }, speed: 0.8 + this.skiff.throttle, spread: 0.3, life: 1.4, size: [0.2, 0.6], opacity: 0.35, rise: 0.6 });
    }
    this.noiseT -= dt;
    if (this.skiff.ridden && this.skiff.throttle > 0.25 && this.noiseT <= 0) {
      this.noiseT = 0.5;
      if (this.patrol.hear(this.skiff.pos, 5 + 10 * this.skiff.throttle)) {
        const p = this.patrol.position();
        events.emit('sfx', { name: 'watchHear', x: p.x, y: p.y + 1.4, z: p.z });
      }
    }

    // The patrol: it sees, suspects, raises the alarm, catches (back to the checkpoint, aboard).
    this.chest.copy(player.feet).setY(player.feet.y + 1.0);
    const inLagoon = Math.hypot(player.feet.x - C.light.x, player.feet.z - C.light.z) < C.lagoonR + 3;
    const r = this.patrol.step(dt, this.chest, inLagoon, player.collider);
    if (r === 'alert') {
      const p = this.patrol.position();
      events.emit('sfx', { name: 'watchAlert', x: p.x, y: p.y + 1.4, z: p.z });
      if (this.time - this.lastWatchLine > 8) {
        this.lastWatchLine = this.time;
        dialogue.interrupt();
        dialogue.say('Watch', 'Vessel in the restricted water. Heave to!', 2.4, { story: true, maxWait: 1 });
      }
    } else if (r === 'caught') {
      events.emit('sfx', { name: 'watchCatch' });
      avatar.emote('surprised', 1.4);
      this.ctx.respawn('manual');
      dialogue.interrupt();
      dialogue.say('Watch', 'Vessel towed back.', 2.2, { story: true, maxWait: 2 });
    }

    // Lost: far out at sea, or somehow under the bed.
    const f = player.feet;
    if (f.y < -6 || f.x < C.area.x0 - 10 || f.x > C.area.x1 + 10 || f.z < C.area.z0 - 10 || f.z > C.area.z1 + 10) this.ctx.respawn('fall');
  }

  onRespawn(id: string): void {
    this.patrol.reset();
    const b = BOAT_CPS[id];
    if (b) {
      this.skiff.moor(b.at, b.heading);
      this.boardNext = true;
    }
  }

  update(dt: number, time: number): void {
    const { hud, input, camera, player } = this.ctx;
    hud.setSkipHint(this.cinematicActive, input.usingGamepad);
    this.coast.update(dt, time, this.coast.level, camera.camera.position);
    this.patrol.update();
    const key = this.ctx.keyLight;
    key.target.position.set(Math.round(player.feet.x), 0, Math.round(player.feet.z));
    key.position.copy(key.target.position).addScaledVector(this.ctx.moonDir, 60);
    key.target.updateMatrixWorld();
  }

  reset(): void {
    this.patrol.reset();
    this.skiff.moor(BOAT_CPS.skiff.at, BOAT_CPS.skiff.heading);
    this.skiff.ridden = false;
    this.sequence = null;
    this.ctx.events.emit('music', { music: 'hall', ambience: 'waves' });
    this.ctx.progression.setObjective('Swim out to the skiff');
  }

  applyCheckpointState(id: string): void {
    const { progression } = this.ctx;
    const order = this.checkpointIds.indexOf(id);
    if (order >= 1) progression.set('skiff.boarded');
    if (order >= 3) progression.set('lagoon.reached');
    progression.setObjective(['Swim out to the skiff', 'Take the skiff to Knoll Rock', 'Cross the bar into the lagoon', 'Reach the lighthouse stairs', 'Climb up to the gallery'][order] ?? '');
    this.patrol.reset();
    const b = BOAT_CPS[id];
    if (b) {
      this.skiff.moor(b.at, b.heading);
      this.boardNext = true;
    } else this.skiff.ridden = false;
  }

  pointOfInterest(feet: THREE.Vector3): THREE.Vector3 | null {
    if (!this.ctx.progression.has('skiff.boarded') && feet.z > -6) return this.skiff.pos.clone().setY(1);
    return null;
  }

  hint(): void {
    const id = this.ctx.checkpoints.current?.id ?? 'slipway';
    const lines: Record<string, string[]> = {
      slipway: ['Swim out to the skiff on its buoy; the sandbar halfway is a place to stand.'],
      skiff: ['Point the stick where you want to go; the skiff turns toward it. The buoys mark the channel to the bar.'],
      bar: ['The bar is too shallow at low water. Wait just outside it: when the engine thumps, the sea rises; go then, at full speed.'],
      lagoon: ['Keep the rocks or the lighthouse between you and the Watch boat; ease off the throttle when it is close.', 'Dock where the lighthouse stairs come down into the water, on the south side.'],
      stairs: ['Up the stairs to the gallery, and round to the door.'],
    };
    const set = lines[id] ?? lines.slipway;
    this.ctx.dialogue.say('Tip', set[Math.min(this.hintTier++, set.length - 1)], 5);
  }

  debugInfo(): Record<string, unknown> {
    return {
      level: this.coast.level.toFixed(2),
      skiff: `${this.skiff.pos.x.toFixed(1)},${this.skiff.pos.z.toFixed(1)} v${this.skiff.speed.toFixed(1)}${this.skiff.aground ? ' aground' : ''}`,
      patrol: `${this.patrol.state} ${this.patrol.suspicion.toFixed(2)}`,
    };
  }
}

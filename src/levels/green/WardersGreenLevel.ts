import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Level, LevelContext, RouteStep } from '../Level';
import { ServiceLight, glowSprite } from '../../world/props/Lanterns';
import { Hangar } from '../../world/props/Hangar';
import { PathTrack, WatchSentry } from '../../gameplay/WatchSentry';
import { buildVillage, type Village } from './Village';
import { buildPlayground, type Playground } from './Playground';
import { G, groundY } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** One beat of a scripted sequence; `watchOnly` beats are dropped on skip. */
interface Beat {
  at: number;
  run: () => void;
  done?: boolean;
  watchOnly?: boolean;
}

/** Noise from the swing carries this far (scaled by how hard it creaks). */
const SWING_HEARING = 12;

/**
 * Chapter Two, "The Warders' Green": dawn on the spur behind Breakwater. Mara wakes on the shingle,
 * climbs to Cottage Lane and slips past a Watch behind the garden hedges, slides down into the old
 * sunken playground, pumps a swing high enough to leap onto the fallen sea wall (while a second
 * Watch on the rim listens for the creak), and crosses the hangar yard to the causeway gate.
 */
export class WardersGreenLevel implements Level {
  readonly name = "The Warders' Green";
  readonly checkpointIds = ['cove', 'lane', 'green', 'bowl', 'wall'];
  readonly conditions: Record<string, () => boolean>;
  readonly route: RouteStep[];
  readonly routeParts: Record<string, RouteStep[]>;
  readonly village: Village;
  readonly playground: Playground;
  readonly laneWatch: WatchSentry;
  readonly rimWatch: WatchSentry;
  private readonly lights = new Map<string, ServiceLight>();
  private readonly hangar: Hangar;
  private readonly beacon: THREE.Sprite;
  private sequence: { t: number; steps: Beat[] } | null = null;
  private time = 0;
  private falling = false;
  private lastWatchLine = -99;
  private readonly chest = new THREE.Vector3();
  private hintTier = 0;

  /** Load the models first (the slide; the lighthouse far out on the water), then build. */
  static async create(ctx: LevelContext): Promise<WardersGreenLevel> {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}assets/models/`;
    const load = (f: string) =>
      loader.loadAsync(base + f).catch((e: unknown) => {
        console.warn(`${f} unavailable; using a stand-in.`, e);
        return null;
      });
    const [slide, lighthouse] = await Promise.all([load('slide.glb'), load('lighthouse.glb')]);
    return new WardersGreenLevel(ctx, slide, lighthouse);
  }

  private constructor(
    private readonly ctx: LevelContext,
    slide: GLTF | null,
    lighthouse: GLTF | null,
  ) {
    const { scene, physics, materials: m, events, interactions, player, progression, dialogue, hud } = ctx;
    this.village = buildVillage(ctx);
    this.playground = buildPlayground(ctx, slide);
    const pg = this.playground;

    // ------------------------------------------------------------ distant set pieces
    // The old hangar at the end of the causeway (seen, not reached, in this chapter).
    this.hangar = new Hangar(v3(0, 0, G.yard.z1 + 44), Math.PI);
    scene.add(this.hangar.group);
    {
      // The causeway out to it.
      const cw = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 40), new THREE.MeshStandardMaterial({ color: '#59605f', roughness: 1, map: m.stone.map }));
      cw.position.set(0, -1.6, G.yard.z1 + 20);
      cw.receiveShadow = true;
      scene.add(cw);
    }
    // The lighthouse on Knoll Rock (Chapter Three's destination), burning when it should be dark.
    {
      const at = this.village.lighthouseAt;
      const holder = new THREE.Group();
      if (lighthouse) {
        const model = lighthouse.scene;
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.castShadow = false;
        });
        holder.add(model);
        // The scan's pile feet (about y 3) stand in the sea.
        model.position.y = -3.0;
      }
      holder.position.set(at.x, G.seaY - 0.4, at.z);
      holder.rotation.y = -2.2;
      scene.add(holder);
      this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.beacon.position.set(at.x, G.seaY - 0.4 + 13.6, at.z);
      this.beacon.scale.setScalar(9);
      scene.add(this.beacon);
    }

    // ------------------------------------------------------------ checkpoints (service lights)
    const cps: Array<{ id: string; order: number; label: string; feet: THREE.Vector3; facing: number; lamp?: [number, number, number, number] }> = [
      { id: 'cove', order: 1, label: 'The cove', feet: v3(1.2, groundY(1.2, -40)!, -40), facing: 0 },
      { id: 'lane', order: 2, label: 'Cottage Lane', feet: v3(3.4, 0, -25.2), facing: 0, lamp: [4.4, 0, -25.9, -Math.PI / 2] },
      { id: 'green', order: 3, label: 'The green', feet: v3(2.6, 0, G.lane.z1 + 2.2), facing: 0, lamp: [4.2, 0, G.lane.z1 + 1.4, -Math.PI / 2] },
      { id: 'bowl', order: 4, label: 'The playground', feet: v3(2.2, G.bowl.floorY, 28.8), facing: 0, lamp: [3.4, G.bowl.floorY, 28.0, -Math.PI / 2] },
      { id: 'wall', order: 5, label: 'The sea wall', feet: v3(0.6, G.wall.lowTop, 41.0), facing: 0, lamp: [1.7, G.wall.lowTop, 41.2, -Math.PI / 2] },
    ];
    for (const c of cps) {
      ctx.checkpoints.register({ id: c.id, order: c.order, label: c.label, feet: c.feet, facing: c.facing, impliesFlags: ['kicker.taken'], recoverBelowY: G.recoverY });
      if (c.lamp) {
        const light = new ServiceLight(m, v3(c.lamp[0], c.lamp[1], c.lamp[2]), c.lamp[3]);
        scene.add(light.group);
        this.lights.set(c.id, light);
      }
    }
    const reach = (id: string) => {
      if (!ctx.checkpoints.reach(id)) return false;
      const l = this.lights.get(id);
      if (l) {
        l.ignite();
        events.emit('sfx', { name: 'ignite', x: l.lampWorld.x, y: l.lampWorld.y, z: l.lampWorld.z });
      }
      return true;
    };

    // ------------------------------------------------------------ the Watch
    this.laneWatch = new WatchSentry(physics, m, new PathTrack(this.village.root, G.laneRail, false), 9);
    // On the rim it looks down into the playground: a longer lamp.
    this.rimWatch = new WatchSentry(physics, m, new PathTrack(this.village.root, G.rimRail, false), 28.6, { range: 13 });
    for (const w of [this.laneWatch, this.rimWatch]) w.enabled = ctx.watch;
    this.drawRails();
    events.on('groundPound', (e) => {
      for (const w of [this.laneWatch, this.rimWatch]) {
        if (!w.enabled || !w.pound(e)) continue;
        const p = w.position();
        events.emit('sfx', { name: 'watchStun', x: p.x, y: p.y + 1, z: p.z });
        ctx.effects.burst(p.clone().setY(p.y + 1.3), { count: 14, color: '#e8eef0', speed: 2.4, spread: 1.6, life: 1.2, size: [0.2, 0.8], opacity: 0.5, rise: 0.6 });
        ctx.camera.shake(0.3);
        ctx.avatar.emote('happy', 1.6);
      }
    });
    // The swing creaks as it goes through the bottom: a Watch close enough comes to look.
    pg.swing.onCreak = (loud) => {
      const seat = pg.swing.seatAt(new THREE.Vector3());
      events.emit('sfx', { name: 'swingCreak', x: seat.x, y: seat.y, z: seat.z, volume: 0.4 + loud * 0.6 });
      for (const w of [this.rimWatch, this.laneWatch]) {
        if (w.hear(seat, SWING_HEARING * (0.6 + 0.4 * loud))) {
          const p = w.position();
          events.emit('sfx', { name: 'watchHear', x: p.x, y: p.y + 1.4, z: p.z });
          dialogue.sayOnce('watch-heard', 'Mara', 'Those chains... It heard me.', 2.4, { maxWait: 2 });
        }
      }
    };

    // ------------------------------------------------------------ interactions: swing, ladder
    const swingSeat = new THREE.Vector3();
    interactions.add({
      id: 'swing',
      get position() {
        return pg.swing.seatAt(swingSeat);
      },
      radius: 1.4,
      prompt: () => (player.mode === 'move' && player.grounded && player.feet.y < G.bowl.floorY + 0.5 && pg.swing.settled ? 'Sit on the swing' : null),
      interact: () => {
        pg.swing.sit();
        player.startRide(pg.swing);
        events.emit('sfx', { name: 'swingCreak', x: swingSeat.x, y: swingSeat.y, z: swingSeat.z, volume: 0.3 });
        if (progression.set('swing.sat')) {
          hud.tip(
            ctx.input.usingGamepad
              ? 'Swing: push the stick toward the wall as it swings forward, away as it swings back. A: leap off. X: get off.'
              : 'Swing: push toward the wall as it swings forward, away as it swings back. Space: leap off. E: get off.',
            'swing',
          );
        }
      },
    });
    const ladderAt = pg.ladderFoot.clone().setY(pg.ladderFoot.y + 1.0);
    interactions.add({
      id: 'ladder',
      position: ladderAt,
      radius: 1.6,
      prompt: () => (player.mode === 'move' && player.grounded && player.feet.y < G.bowl.floorY + 0.5 ? 'Climb the ladder' : null),
      interact: () => {
        pg.ladder.start(player.feet.clone());
        player.startRide(pg.ladder);
        events.emit('sfx', { name: 'climb', x: ladderAt.x, y: ladderAt.y, z: ladderAt.z });
      },
    });
    pg.slide.onEnd = () => events.emit('sfx', { name: 'land', x: player.feet.x, y: player.feet.y, z: player.feet.z });

    // ------------------------------------------------------------ the story, triggers
    const { triggers } = ctx;
    triggers.add({
      id: 'lane-top',
      contains: (p) => p.z > G.lane.z0 - 0.3 && p.z < G.lane.z0 + 4 && p.y > -0.3,
      onEnter: () => {
        reach('lane');
        if (progression.set('area.green')) hud.areaTitle("The Warders' Green", "Where Breakwater's keepers raised their children");
        dialogue.say('Mara', 'Houses. Families lived out here, once.', undefined, { story: true });
        if (this.laneWatch.enabled) {
          dialogue.say('Mara', "And the Watch still walks the lane. Hedges, then. Out of its lamp.", undefined, { story: true });
          hud.tip('The Watch sees what its lamp sees. Hedges, walls and houses hide you; tall grass too.', 'watch');
        }
        progression.setObjective('Get through Cottage Lane to the green');
      },
    });
    triggers.add({
      id: 'green',
      contains: (p) => p.z > G.lane.z1 + 0.6 && p.z < G.bowl.z0 && p.y > -0.3,
      onEnter: () => {
        reach('green');
        dialogue.say('Mara', 'A playground. On a prison island.', undefined, { story: true });
        progression.setObjective('Find a way over the sea wall');
      },
    });
    triggers.add({
      id: 'rim',
      contains: (p) => p.z > G.bowl.z0 - 3 && p.z < G.bowl.z0 && Math.abs(p.x) < 4 && p.y > -0.3,
      onEnter: () => {
        dialogue.say('Mara', "The wall's come down at the back, over the swings. Still too high to jump...", 3.6, { story: true });
      },
    });
    triggers.add({
      id: 'bowl',
      contains: (p) => p.z > G.slide.backZ + 4 && p.z < G.bowl.z1 && p.y < G.bowl.floorY + 0.3 && Math.abs(p.x) < G.bowl.x1,
      onEnter: () => {
        reach('bowl');
        if (progression.set('bowl.reached')) dialogue.say('Mara', 'Ha. Still got it.', 2, { story: true });
        progression.setObjective('Get up onto the fallen sea wall');
      },
    });
    triggers.add({
      id: 'swing-near',
      contains: (p) => p.distanceTo(pg.swingSpot) < 3 && p.y < G.bowl.floorY + 0.4,
      onEnter: () => dialogue.sayOnce('swing-idea', 'Mara', 'If I get that swing going high enough...', 2.6, { story: true }),
    });
    triggers.add({
      id: 'wall',
      contains: (p) => p.z > G.wall.z0 - 0.1 && p.z < G.wall.z1 + 0.2 && p.y > G.wall.lowTop - 0.3 && Math.abs(p.x) < G.wall.lowX,
      onEnter: () => {
        reach('wall');
        if (progression.set('wall.reached')) {
          ctx.avatar.emote('happy', 2);
          dialogue.say('Mara', "Over! The hangar's past the yard. And there's a light out on the water...", 3.8, { story: true });
        }
        progression.setObjective('Cross the yard to the causeway gate');
      },
    });
    triggers.add({ id: 'end', contains: (p) => p.z > G.yard.z1 - 3.5 && p.y > -0.5, onEnter: () => this.ending() });

    this.conditions = {
      'on-lane': () => player.feet.z > G.lane.z0 && player.feet.y > -0.3,
      'on-green': () => player.feet.z > G.lane.z1 + 0.6,
      'in-bowl': () => player.feet.y < G.bowl.floorY + 0.3,
      'on-wall': () => progression.has('wall.reached'),
      done: () => progression.has('green.finished'),
    };
    this.route = [
      { kind: 'move', to: [1.5, G.cove.landingY, -28.4] },
      { kind: 'climb', from: [1.5, G.cove.landingY, -28.1], to: [1.5, 0, -26.4] },
      { kind: 'move', to: [-3.6, 0, -23.5] },
      { kind: 'move', to: [-4.6, 0, -14.0] },
      { kind: 'move', to: [-4.6, 0, -4.8] },
      { kind: 'move', to: [-4.6, 0, 3.6] },
      { kind: 'move', to: [0, 0, 5.2] },
      { kind: 'move', to: [0, 0, 9] },
      { kind: 'move', to: [0, 0, 21.2], precise: true },
      { kind: 'move', to: [0, 0, 24.4] },
      { kind: 'wait', until: 'in-bowl', timeout: 8 },
    ];
    this.routeParts = { lane: this.route.slice(0, 8) };

    events.emit('music', { music: 'title', ambience: 'waves' });
    progression.setObjective('Climb up from the cove');
    if (ctx.intro) this.opening();
  }

  /** The Watch's rails: two iron strips set into the ground along each track. */
  private drawRails(): void {
    const mat = this.ctx.materials.ironDark;
    for (const pts of [G.laneRail, G.rimRail]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const d = b.clone().sub(a);
        const len = d.length();
        const yaw = Math.atan2(d.x, d.z);
        for (const off of [-0.16, 0.16]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, len + 0.3), mat);
          rail.position.copy(a).addScaledVector(d, 0.5).add(new THREE.Vector3(Math.cos(yaw) * off, 0.025, -Math.sin(yaw) * off));
          rail.rotation.y = yaw;
          rail.receiveShadow = true;
          this.village.root.add(rail);
        }
      }
    }
  }

  // ---------------------------------------------------------------- the opening and the end

  get cinematicActive(): boolean {
    return this.sequence !== null && this.ctx.player.frozen;
  }

  private opening(): void {
    const { hud, camera, avatar, setControl, dialogue, player } = this.ctx;
    const cp = this.ctx.checkpoints.get('cove')!;
    setControl(false);
    hud.letterbox(true);
    avatar.cinematic('wake', 0);
    const feet = cp.feet;
    this.sequence = {
      t: 0,
      steps: [
        {
          at: 0,
          watchOnly: true,
          run: () => {
            hud.story({ eyebrow: 'Chapter Two', title: "The Warders' Green", text: 'First light. Somewhere behind Breakwater.', backdrop: false, lower: true });
            camera.playShot(v3(feet.x + 6, feet.y + 2.2, feet.z - 9), v3(feet.x, feet.y + 0.4, feet.z), 7, { from: { pos: v3(feet.x + 10, feet.y + 1.2, feet.z - 16), look: v3(feet.x, feet.y + 0.6, feet.z + 6) }, fov: 50 });
          },
        },
        { at: 4.2, watchOnly: true, run: () => hud.story(null) },
        { at: 4.6, watchOnly: true, run: () => avatar.cinematic('wake', 1, 0) },
        { at: 5.4, watchOnly: true, run: () => dialogue.say('Mara', 'Cold. Cold, cold, cold.', 2.2, { story: true }) },
        { at: 8.2, watchOnly: true, run: () => dialogue.say('Mara', "That's the spur. If Ivo was right about the hangar...", 3.2, { story: true }) },
        {
          at: 9.2,
          run: () => {
            hud.story(null);
            hud.letterbox(false);
            avatar.endCinematic();
            player.teleport(feet, cp.facing);
            camera.clearShot();
            camera.snapBehind(feet, cp.facing, 0.3);
            setControl(true);
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
    if (progression.has('green.finished')) return;
    progression.set('green.finished');
    progression.setObjective('');
    const feet = this.ctx.player.feet.clone();
    const light = this.village.lighthouseAt;
    events.emit('music', { music: 'ending' });
    this.hangar.setLit(true);
    dialogue.say('Mara', 'Locked from the other side. Of course it is.', 3, { story: true });
    this.sequence = {
      t: 0,
      steps: [
        { at: 0.2, watchOnly: true, run: () => camera.playShot(feet.clone().add(v3(-2.4, 2.4, -3.2)), v3(0, 2, G.yard.z1 + 40), 5) },
        { at: 3.4, watchOnly: true, run: () => dialogue.say('Mara', 'And that light, out on Knoll Rock. It should have been dark for years.', 3.8, { story: true }) },
        { at: 3.6, watchOnly: true, run: () => camera.playShot(feet.clone().add(v3(-1.6, 2.2, -2.4)), v3(light.x, light.y + 10, light.z), 5) },
        {
          at: 7.5,
          run: () =>
            this.ctx.complete({
              title: "The Warders' Green",
              body: 'Mara is over the sea wall. The old hangar waits at the end of the causeway, and out on Knoll Rock a lighthouse is burning that should have been dark for years. Next: Chapter Three, <i>The Low Tide</i>.',
              reward: true,
            }),
        },
      ],
    };
  }

  // ---------------------------------------------------------------- the loop

  fixedUpdate(dt: number, time: number): void {
    this.time = time;
    const { player, progression, events, dialogue, avatar } = this.ctx;
    // She kept Ivo's steam kicker from Chapter One.
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

    const pg = this.playground;
    if (player.ride !== pg.swing) pg.swing.idle(dt);
    // Onto the chute from the platform: down she goes.
    if (player.mode === 'move' && !player.isLocked) {
      const top = pg.chuteTop;
      const f = player.feet;
      if (Math.abs(f.x - top.x) < 0.5 && f.z > top.z - 0.25 && f.z < top.z + 0.45 && f.y > top.y - 0.3 && f.y < top.y + 0.6 && player.velocity.z > 0.3) {
        pg.slide.start(Math.max(0, player.velocity.z));
        player.startRide(pg.slide);
        events.emit('sfx', { name: 'slide', x: f.x, y: f.y, z: f.z });
        if (progression.set('slide.ridden')) dialogue.say('Mara', 'Wheee!', 1.2, { story: true });
      }
    }

    // The Watch: each sees, suspects, raises the alarm, catches.
    this.chest.copy(player.feet).setY(player.feet.y + 1.0);
    const f = player.feet;
    const hidden = this.isHidden(f);
    const laneZone = f.z > G.lane.z0 - 0.5 && f.z < G.lane.z1 + 1 && f.y > -0.6;
    const rimZone = f.z > G.green.z0 + 8 && f.z < G.wall.z0 + 0.5 && Math.abs(f.x) < 14;
    for (const [w, zone] of [
      [this.laneWatch, laneZone],
      [this.rimWatch, rimZone],
    ] as const) {
      const r = w.step(dt, this.chest, zone, player.collider, hidden);
      if (r === 'alert') {
        const p = w.position();
        events.emit('sfx', { name: 'watchAlert', x: p.x, y: p.y + 1.4, z: p.z });
        if (this.time - this.lastWatchLine > 8) {
          this.lastWatchLine = this.time;
          dialogue.interrupt();
          dialogue.say('Watch', 'Inmate out of bounds. Halt!', 2.2, { story: true, maxWait: 1 });
        }
      } else if (r === 'caught') {
        const p = w.position();
        events.emit('sfx', { name: 'watchCatch', x: p.x, y: p.y + 1, z: p.z });
        avatar.emote('surprised', 1.4);
        this.ctx.respawn('manual');
        dialogue.interrupt();
        dialogue.say('Watch', 'Inmate returned.', 2.2, { story: true, maxWait: 2 });
        dialogue.sayOnce('watch-caught', 'Tip', 'Stay out of the lamp: hedges, walls and tall grass hide you. A ground pound beside a Watch knocks it out for a while.', 5, { maxWait: 4 });
      }
    }

    // Into the sea: fade, then back at the checkpoint.
    const y = player.feet.y;
    if (y < G.recoverY + 0.6) this.falling = true;
    if (this.falling && y < G.recoverY) {
      this.falling = false;
      events.emit('sfx', { name: 'splash' });
      progression.falls++;
      this.ctx.respawn('fall');
    }
    if (y < -30 || Math.abs(f.x) > 60 || f.z < -70 || f.z > 90) this.ctx.respawn('fall');
  }

  /** In tall grass or inside the concrete pipe: the Watch cannot see her there. */
  isHidden(f: THREE.Vector3): boolean {
    for (const t of this.village.tallGrass) if (f.x > t.x0 && f.x < t.x1 && f.z > t.z0 && f.z < t.z1 && Math.abs(f.y - t.y) < 0.5) return true;
    const p = this.playground.tunnel;
    return f.x > p.x0 + 0.3 && f.x < p.x1 - 0.3 && f.z > p.z0 && f.z < p.z1 && f.y < G.bowl.floorY + 0.6;
  }

  onRespawn(): void {
    this.laneWatch.reset();
    this.rimWatch.reset();
    this.playground.swing.rest();
  }

  update(dt: number, time: number): void {
    const { hud, input, camera, player } = this.ctx;
    hud.setSkipHint(this.cinematicActive, input.usingGamepad);
    this.village.update(dt, time, camera.camera.position);
    this.playground.update(dt, time);
    this.laneWatch.update();
    this.rimWatch.update();
    this.hangar.update(dt);
    for (const l of this.lights.values()) l.update(dt, time);
    // The beacon turns: a slow pulse as its lens comes round.
    const pulse = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(time * 0.9)), 6);
    this.beacon.material.opacity = pulse;
    // The sun's shadows follow Mara (the spur is longer than one shadow map).
    const key = this.ctx.keyLight;
    const snap = 1;
    key.target.position.set(Math.round(player.feet.x / snap) * snap, 0, Math.round(player.feet.z / snap) * snap);
    key.position.copy(key.target.position).addScaledVector(this.ctx.moonDir, 60);
    key.target.updateMatrixWorld();
  }

  reset(): void {
    this.laneWatch.reset();
    this.rimWatch.reset();
    this.playground.swing.rest();
    for (const l of this.lights.values()) l.extinguish();
    this.hangar.setLit(false, true);
    this.sequence = null;
    this.ctx.events.emit('music', { music: 'title', ambience: 'waves' });
    this.ctx.progression.setObjective('Climb up from the cove');
  }

  applyCheckpointState(id: string): void {
    const order = this.checkpointIds.indexOf(id);
    for (const [cid, light] of this.lights) if (this.checkpointIds.indexOf(cid) <= order) light.ignite(true);
    const { progression } = this.ctx;
    if (order >= 1) progression.set('area.green');
    if (order >= 3) progression.set('bowl.reached');
    if (order >= 4) progression.set('wall.reached');
    progression.setObjective(['Climb up from the cove', 'Get through Cottage Lane to the green', 'Find a way over the sea wall', 'Get up onto the fallen sea wall', 'Cross the yard to the causeway gate'][order] ?? '');
    this.laneWatch.reset();
    this.rimWatch.reset();
  }

  pointOfInterest(feet: THREE.Vector3): THREE.Vector3 | null {
    if (feet.z > G.bowl.z0 - 4 && feet.z < G.bowl.z1 && feet.y > -0.5) return this.playground.swingSpot.clone().setY(G.bowl.floorY + 1);
    if (feet.y > G.wall.lowTop - 0.3 && feet.z > G.wall.z0) return this.village.lighthouseAt.clone().setY(G.seaY + 12);
    return null;
  }

  hint(): void {
    const { dialogue, checkpoints } = this.ctx;
    const id = checkpoints.current?.id;
    const lines: Record<string, string[]> = {
      cove: ['The cove wall: jump at it and hold toward it to catch the top.'],
      lane: ["Keep to the gardens, behind the hedges. Cross the lane when the Watch rolls away from you.", 'The gap by each house leads from garden to garden. The back gardens are another way round.'],
      green: ['The slide goes down into the old playground.'],
      bowl: ['Sit on the swing. Push toward the wall as it swings forward, away as it swings back.', 'When it swings high toward the wall, leap: catch the top of the fallen section.', 'The Watch on the rim hears the chains. Swing while it is far away, or hide in the pipe until it goes.'],
      wall: ['The causeway gate is at the far end of the yard.'],
    };
    const set = lines[id ?? 'cove'] ?? lines.cove;
    dialogue.say('Tip', set[Math.min(this.hintTier++, set.length - 1)], 5);
  }

  debugInfo(): Record<string, unknown> {
    return {
      laneWatch: `${this.laneWatch.state} ${this.laneWatch.suspicion.toFixed(2)}`,
      rimWatch: `${this.rimWatch.state} ${this.rimWatch.suspicion.toFixed(2)}`,
      swing: `${this.playground.swing.theta.toFixed(2)} peak ${this.playground.swing.peak.toFixed(2)}`,
      hidden: this.isHidden(this.ctx.player.feet),
    };
  }
}

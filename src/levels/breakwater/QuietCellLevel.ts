import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Level, LevelContext, RouteStep } from '../Level';
import { Batcher, boxProjectUVs, worldBox } from '../../world/geometry';
import { Palette } from '../../world/materials';
import { saltStainTexture } from '../../world/textures';
import { PressureHatch, OPENING } from '../../world/props/PressureHatch';
import { ServiceLight, WorkLamp } from '../../world/props/Lanterns';
import { LightShaft, SteamEmitter, Water } from '../../world/Atmosphere';
import { PressureHatchLogic, enginePulse, LIFT_THRESHOLD } from '../../gameplay/puzzles/PressureHatchLogic';
import { boxVolume } from '../../gameplay/Progression';
import { mulberry32 } from '../../core/math';
import { CELL, FALL_FADE_Y, HALL, LOOKOUT, RECOVER_Y, SHAFT, SPAWNS, sideAngle } from './layout';

const sideAngle10 = sideAngle(10);
import { buildTurbineHall, type TurbineHall } from './TurbineHall';
import { EngineRoute, ROUTE_RAIL_GAPS, ROUTE_WALKWAY_OVERRIDES } from './EngineRoute';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Hatch puzzle hints. Automatic hints are gentle and happen at most once each: a reminder of the
 * goal, then attention to the diagram. The explicit causal solution is only given on request
 * (Pause -> Hint); repeated requests may repeat it.
 */
const AUTO_HINTS: Array<{ after: number; tier: HintTier }> = [
  { after: 60, tier: 'reminder' },
  { after: 120, tier: 'evidence' },
];
type HintTier = 'reminder' | 'evidence' | 'explicit';
const HINT_ORDER: HintTier[] = ['reminder', 'evidence', 'explicit'];

/**
 * Chapter 1 slice, "The Quiet Cell": Mara's cell and its pressure hatch, the maintenance shaft with
 * a practice jump and a drainage gap, and the lookout over the turbine hall.
 */
/** One beat of a scripted sequence. `watchOnly` beats (narration, lines, camera) are dropped on skip. */
interface SequenceStep {
  at: number;
  run: () => void;
  done?: boolean;
  watchOnly?: boolean;
}

export class QuietCellLevel implements Level {
  readonly name = 'The Quiet Cell';
  readonly checkpointIds = ['cell', 'landing', 'lookout', 'route', 'shuttle', 'engine', 'engine-top', 'breach', 'exit'];
  readonly conditions: Record<string, () => boolean>;
  readonly route: RouteStep[];
  readonly routeParts: Record<string, RouteStep[]>;

  private readonly logic = new PressureHatchLogic();
  private readonly hatch: PressureHatch;
  private readonly hall: TurbineHall;
  private readonly engine: EngineRoute;
  private readonly landingLight: ServiceLight;
  private readonly lookoutLight: ServiceLight;
  private readonly lamps: WorkLamp[] = [];
  private readonly dripSteam: SteamEmitter;
  private readonly channelWater: Water;
  private readonly slitShaft: LightShaft;
  private readonly drip: THREE.Mesh;
  private dripT = 0;
  private time = 0;
  private hintTimer = 0;
  /** Next automatic hint (index into AUTO_HINTS); never wraps around. */
  private autoHint = 0;
  /** Next tier for a requested hint. */
  private requestedHint = 0;
  /** Requested hints for the split feed at the breach. */
  private requestedEngineHint = 0;
  private lastPulse = 0;
  private sequence: { t: number; steps: SequenceStep[] } | null = null;
  private fadeLevel = 0;
  private falling = false;

  constructor(private readonly ctx: LevelContext) {
    const { scene, physics, materials: m } = ctx;
    this.hall = buildTurbineHall(scene, physics, m, ctx.moonDir, ROUTE_WALKWAY_OVERRIDES, ROUTE_RAIL_GAPS);

    const batch = new Batcher();
    const root = new THREE.Group();
    root.name = 'quiet-cell';
    scene.add(root);
    const rng = mulberry32(77);
    const tint = (b = 1) => new THREE.Color(b + (rng() - 0.5) * 0.1, b + (rng() - 0.5) * 0.08, b + (rng() - 0.5) * 0.1);

    /** Solid box: rendered (batched) and collidable. */
    const solid = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, opts: { tint?: THREE.Color; collide?: boolean; damp?: boolean } = {}) => {
      const w = x1 - x0;
      const h = y1 - y0;
      const d = z1 - z0;
      const c = v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      batch.add(worldBox(w, h, d, 3), mat, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), { tint: opts.tint ?? tint(), damp: opts.damp });
      if (opts.collide ?? true) physics.box(c, v3(w / 2, h / 2, d / 2));
    };

    // ------------------------------------------------------------ Mara's cell
    const cy = CELL.y;
    const top = cy + CELL.h;
    const wt = CELL.wallT;
    solid(CELL.x0 - wt, CELL.x1 + wt, cy - 0.5, cy, CELL.z0 - wt, CELL.z1 + wt, m.floor);
    solid(CELL.x0 - wt, CELL.x1 + wt, top, top + 0.5, CELL.z0 - wt, CELL.z1 + wt, m.stoneDark);
    solid(CELL.x0 - wt, CELL.x0, cy, top, CELL.z0, CELL.z1 + wt, m.stone, { damp: true }); // left
    solid(CELL.x1, CELL.x1 + wt, cy, top, CELL.z0, CELL.z1 + wt, m.stone, { damp: true }); // right
    // Back wall with the narrow ocean slit.
    const slit = { x0: 0.48, x1: 0.72, y0: cy + 1.75, y1: cy + 3.25 };
    solid(CELL.x0, slit.x0, cy, top, CELL.z1, CELL.z1 + wt, m.stone);
    solid(slit.x1, CELL.x1, cy, top, CELL.z1, CELL.z1 + wt, m.stone);
    solid(slit.x0, slit.x1, cy, slit.y0, CELL.z1, CELL.z1 + wt, m.stone);
    solid(slit.x0, slit.x1, slit.y1, top, CELL.z1, CELL.z1 + wt, m.stone);
    // Ceiling beams.
    for (const z of [28.4, 30.6]) solid(CELL.x0, CELL.x1, top - 0.3, top, z - 0.15, z + 0.15, m.wood, { collide: false });

    // ------------------------------------------------------------ hatch wall (cell <-> shaft)
    const hw = { z0: SHAFT.z1, z1: CELL.z0 };
    const ox0 = OPENING.x0;
    const ox1 = OPENING.x1;
    const oTop = cy + OPENING.height;
    solid(SHAFT.x0 - wt, ox0, SHAFT.channelBottom - 0.5, SHAFT.topY, hw.z0, hw.z1, m.stone, { damp: true });
    solid(ox1, SHAFT.x1 + wt, SHAFT.channelBottom - 0.5, SHAFT.topY, hw.z0, hw.z1, m.stone, { damp: true });
    solid(ox0, ox1, oTop, SHAFT.topY, hw.z0, hw.z1, m.stone);
    solid(ox0, ox1, SHAFT.channelBottom - 0.5, cy, hw.z0, hw.z1, m.stone);

    // Low bunk, blanket and belongings.
    const bunk = { x0: CELL.x0, x1: CELL.x0 + 0.9, z0: 29.4, z1: 31.75, h: 0.42 };
    solid(bunk.x0, bunk.x1, cy + bunk.h - 0.08, cy + bunk.h, bunk.z0, bunk.z1, m.wood);
    physics.box(v3((bunk.x0 + bunk.x1) / 2, cy + bunk.h / 2, (bunk.z0 + bunk.z1) / 2), v3(0.45, bunk.h / 2, (bunk.z1 - bunk.z0) / 2));
    for (const [x, z] of [
      [bunk.x1 - 0.08, bunk.z0 + 0.08],
      [bunk.x1 - 0.08, bunk.z1 - 0.08],
    ]) {
      batch.add(new THREE.BoxGeometry(0.07, bunk.h - 0.08, 0.07), m.iron, new THREE.Matrix4().makeTranslation(x, cy + (bunk.h - 0.08) / 2, z));
    }
    // Canvas straw mattress under a grey wool blanket.
    const canvas = new THREE.MeshStandardMaterial({ color: '#86765a', roughness: 1, map: ctx.textures.smock.map, normalMap: ctx.textures.smock.normalMap });
    const wool = new THREE.MeshStandardMaterial({ color: '#7a766b', roughness: 1, map: ctx.textures.wool.map, normalMap: ctx.textures.wool.normalMap });
    const mattress = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.1, 2.24, 3, 0.045), canvas);
    mattress.position.set(bunk.x0 + 0.46, cy + bunk.h + 0.045, (bunk.z0 + bunk.z1) / 2);
    mattress.castShadow = mattress.receiveShadow = true;
    root.add(mattress);
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.05, 1.5, 3, 0.024), wool);
    blanket.position.set(bunk.x0 + 0.46, cy + bunk.h + 0.11, bunk.z0 + 1.0);
    blanket.rotation.y = 0.04;
    blanket.castShadow = blanket.receiveShadow = true;
    const fold = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.12, 0.35, 3, 0.05), wool);
    fold.position.set(bunk.x0 + 0.47, cy + bunk.h + 0.15, bunk.z0 + 0.2);
    fold.rotation.set(0.15, -0.1, 0);
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.12, 0.3, 3, 0.06), new THREE.MeshStandardMaterial({ color: '#a69a7c', roughness: 1 }));
    pillow.position.set(bunk.x0 + 0.45, cy + bunk.h + 0.13, bunk.z1 - 0.25);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), m.tin);
    cup.position.set(-1.0, cy + 0.05, 31.6);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.tin);
    bowl.material = m.tin.clone();
    (bowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    bowl.position.set(-0.85, cy + 0.11, 31.45);
    root.add(blanket, fold, pillow, cup, bowl);
    for (const o of [fold, pillow, cup, bowl]) o.castShadow = true;
    // Locked cell door in the right wall (dressing; the hatch is the way out).
    {
      const door = new THREE.Mesh(new RoundedBoxGeometry(0.12, 2.1, 1.1, 2, 0.03), m.iron);
      for (const y of [0.35, 1.05, 1.85]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 1.12), m.ironDark);
        strap.position.set(CELL.x1 - 0.105, cy + y, 30.6);
        root.add(strap);
      }
      door.position.set(CELL.x1 - 0.04, cy + 1.05, 30.6);
      door.castShadow = door.receiveShadow = true;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.5), m.cellShadow);
      slot.position.set(CELL.x1 - 0.04, cy + 1.65, 30.6);
      root.add(door, slot);
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), m.iron);
        bar.position.set(CELL.x1 - 0.12, cy + 1.65, 30.42 + i * 0.12);
        root.add(bar);
      }
    }
    // Rubble and a cracked patch: believable maintenance damage.
    for (let i = 0; i < 7; i++) {
      const s = 0.1 + rng() * 0.16;
      const chunk = new THREE.Mesh(boxProjectUVs(new RoundedBoxGeometry(s * 1.4, s, s * 1.1, 1, 0.03)), m.stone);
      chunk.position.set(1.7 + rng() * 0.45, cy + s / 2, 31.2 + rng() * 0.6);
      chunk.rotation.set(rng(), rng() * 3, rng());
      chunk.castShadow = true;
      root.add(chunk);
    }

    // Structure and wear (visual only): a darker base course, a repaired patch of newer brick
    // with iron tie plates, a wall shackle, scratched tally marks, a bucket and a floor drain.
    {
      const base = (x0: number, x1: number, z0: number, z1: number) =>
        batch.add(worldBox(x1 - x0, 0.32, z1 - z0, 3), m.stoneDark, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, cy + 0.16, (z0 + z1) / 2), { tint: tint(0.75), damp: true });
      base(CELL.x0, CELL.x0 + 0.05, CELL.z0, CELL.z1);
      base(CELL.x1 - 0.05, CELL.x1, CELL.z0, CELL.z1);
      base(CELL.x0, CELL.x1, CELL.z1 - 0.05, CELL.z1);
      // Repair: smaller, warmer brick infill set into the back wall, with lime streaks.
      batch.add(worldBox(1.25, 1.15, 0.03, 1.5), m.stone, new THREE.Matrix4().makeTranslation(-1.15, cy + 1.95, CELL.z1 - 0.012), { tint: new THREE.Color(1.18, 1.06, 0.92) });
      for (const [x, y] of [
        [-1.95, 3.2],
        [1.95, 3.2],
      ]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16), m.ironDark);
        plate.rotation.x = Math.PI / 2;
        plate.position.set(x, cy + y, CELL.z1 - 0.015);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6), m.iron);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(x, cy + y, CELL.z1 - 0.04);
        root.add(plate, bolt);
      }
      // Shackle ring above the bunk, with a short length of chain.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16), m.iron);
      ring.position.set(CELL.x0 + 0.03, cy + 1.45, 30.1);
      ring.rotation.y = Math.PI / 2;
      root.add(ring);
      for (let i = 0; i < 4; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10), m.ironDark);
        link.scale.set(1, 1.5, 1);
        link.position.set(CELL.x0 + 0.04, cy + 1.33 - i * 0.075, 30.1);
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        root.add(link);
      }
      // Tally marks scratched into the wall beside the bunk.
      const tally = document.createElement('canvas');
      tally.width = 256;
      tally.height = 128;
      const g = tally.getContext('2d')!;
      g.strokeStyle = 'rgba(214,206,186,0.75)';
      g.lineWidth = 3;
      for (let i = 0; i < 17; i++) {
        const group = Math.floor(i / 5);
        const j = i % 5;
        const x = 18 + group * 58 + j * 10 + rng() * 2;
        if (j === 4) {
          g.beginPath();
          g.moveTo(x - 46, 92);
          g.lineTo(x + 4, 34);
          g.stroke();
        } else {
          g.beginPath();
          g.moveTo(x, 30 + rng() * 6);
          g.lineTo(x + rng() * 3 - 1.5, 96 + rng() * 6);
          g.stroke();
        }
      }
      const tallyTex = new THREE.CanvasTexture(tally);
      tallyTex.colorSpace = THREE.SRGBColorSpace;
      const marks = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.28), new THREE.MeshStandardMaterial({ map: tallyTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }));
      marks.position.set(CELL.x0 + 0.012, cy + 1.1, 31.2);
      marks.rotation.y = Math.PI / 2;
      root.add(marks);
      // Tin bucket in the back corner.
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 16, 1, true), m.tin.clone());
      (bucket.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      bucket.position.set(1.95, cy + 0.15, 31.55);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 16, Math.PI), m.iron);
      handle.position.set(1.95, cy + 0.3, 31.55);
      handle.rotation.set(0, 0.4, 0);
      bucket.castShadow = true;
      root.add(bucket, handle);
      // Floor drain beside the puddle.
      const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18), m.ironDark);
      drain.position.set(-0.75, cy + 0.008, 28.2);
      root.add(drain);
      for (let i = -2; i <= 2; i++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.24 - Math.abs(i) * 0.05), m.cellShadow);
        slot.position.set(-0.75 + i * 0.055, cy + 0.016, 28.2);
        root.add(slot);
      }
    }

    // Salt crust decals: around the slit, along the tide line, below the vent.
    const salt = new THREE.MeshStandardMaterial({ map: saltStainTexture(5), transparent: true, opacity: 0.7, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
    const decal = (w: number, h: number, pos: THREE.Vector3, rotY: number) => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), salt);
      d.position.copy(pos);
      d.rotation.y = rotY;
      d.receiveShadow = true;
      root.add(d);
    };
    decal(1.1, 2.0, v3(0.6, cy + 2.3, CELL.z1 - 0.01), Math.PI);
    decal(1.0, 1.1, v3(-1.75, cy + 0.55, CELL.z0 + 0.012), 0);
    decal(1.6, 0.7, v3(CELL.x0 + 0.01, cy + 0.35, 31.0), Math.PI / 2);
    // Puddle under the dripping pipe.
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshStandardMaterial({ color: '#0b1416', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.scale.set(1.3, 0.8, 1);
    puddle.position.set(-1.3, cy + 0.006, 27.75);
    root.add(puddle);

    // Pressure hatch assembly on the front wall.
    this.hatch = new PressureHatch(physics, m, v3(0, cy, CELL.z0), 0);
    scene.add(this.hatch.group, this.hatch.ventSteam.group, this.hatch.sealSteam.group);
    // Water drip that taps the hatch line (opening detail and a sound cue).
    this.drip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: '#cfe8ee', emissive: '#4d8994', emissiveIntensity: 0.6, roughness: 0 }));
    this.drip.visible = false;
    scene.add(this.drip);
    this.dripSteam = new SteamEmitter(this.hatch.anchors.drip.clone(), v3(0, 0.2, 0.3), 0, new THREE.Color('#cfe0e4'));
    scene.add(this.dripSteam.group);

    // Practical amber lamp (casts the pipe shadows across the wall) and the slit's moonlight.
    const cellLamp = new WorkLamp(m, v3(CELL.x1 - 0.01, cy + 2.6, 28.6), v3(-1, 0, 0), { light: true, intensity: 6.5, distance: 9, castShadow: true, poolOpacity: 0.06 });
    this.lamps.push(cellLamp);
    scene.add(cellLamp.group);
    const slitLight = new THREE.SpotLight(Palette.moon, 14, 14, 0.16, 0.6, 1.4);
    slitLight.position.set(0.6, cy + 5.8, CELL.z1 + 5.5);
    slitLight.target.position.set(0.2, cy, 29.6);
    slitLight.castShadow = true;
    slitLight.shadow.mapSize.set(512, 512);
    slitLight.shadow.bias = -0.0015;
    scene.add(slitLight, slitLight.target);
    this.slitShaft = new LightShaft(v3(0.6, cy + 2.5, CELL.z1 + 0.25), v3(0.25, cy, 29.5), 0.08, 0.32, Palette.moon, 0.07);
    scene.add(this.slitShaft.mesh);
    // A little fill so the room's corners read without washing out the lamp.
    const fill = new THREE.PointLight('#5f7f95', 1.6, 7, 1.5);
    fill.position.set(-0.5, cy + 3.4, 30.2);
    scene.add(fill);

    // ------------------------------------------------------------ maintenance shaft
    const S = SHAFT;
    solid(S.x0 - wt, S.x0, S.channelBottom - 0.5, S.topY, S.z0, S.z1, m.stone, { damp: true });
    solid(S.x1, S.x1 + wt, S.channelBottom - 0.5, S.topY, S.z0, S.z1, m.stone, { damp: true });
    solid(S.x0 - wt, S.x1 + wt, S.topY, S.topY + 0.6, S.z0, S.z1, m.stoneDark);
    // Near landing (cell side) and far landing (lookout side): solid masonry up to the walkway.
    solid(S.x0, S.x1, S.channelBottom - 0.5, S.floorY, S.gapNear, S.z1, m.stone, { damp: true });
    batch.add(worldBox(S.x1 - S.x0, 0.06, S.z1 - S.gapNear, 3), m.floor, new THREE.Matrix4().makeTranslation(0, S.floorY + 0.005, (S.gapNear + S.z1) / 2));
    solid(S.x0, S.x1, S.channelBottom - 0.5, S.floorY, S.z0, S.gapFar, m.stone, { damp: true });
    batch.add(worldBox(S.x1 - S.x0, 0.06, S.gapFar - S.z0, 3), m.floor, new THREE.Matrix4().makeTranslation(0, S.floorY + 0.005, (S.z0 + S.gapFar) / 2));
    solid(S.x0, S.x1, S.channelBottom - 0.6, S.channelBottom, S.gapFar, S.gapNear, m.stoneDark, { damp: true });
    // Worn iron edge angles so the gap's lips read clearly from above.
    for (const z of [S.gapNear + 0.06, S.gapFar - 0.06]) {
      batch.add(worldBox(S.x1 - S.x0, 0.08, 0.14, 1.5), m.iron, new THREE.Matrix4().makeTranslation(0, S.floorY + 0.02, z), { tint: tint(1.3) });
    }
    // Practice jump: a fallen girder lying across the whole landing.
    {
      const g = S.girder;
      const gy = S.floorY + g.height / 2;
      const len = S.x1 - S.x0 - 0.1;
      batch.add(new RoundedBoxGeometry(len, g.height - 0.1, g.depth - 0.12, 2, 0.03), m.ironDark, new THREE.Matrix4().makeTranslation(0, gy, g.z));
      for (const fy of [S.floorY + 0.05, S.floorY + g.height - 0.05]) {
        batch.add(new RoundedBoxGeometry(len + 0.04, 0.1, g.depth, 2, 0.025), m.iron, new THREE.Matrix4().makeTranslation(0, fy, g.z));
      }
      // Stiffener plates and rivets so it reads as a heavy fallen beam, not a plank.
      for (let i = 0; i < 7; i++) {
        const x = S.x0 + 0.6 + i * ((len - 1.0) / 6);
        batch.add(new THREE.BoxGeometry(0.06, g.height - 0.2, g.depth - 0.02), m.iron, new THREE.Matrix4().makeTranslation(x, gy, g.z));
        for (const side of [-1, 1]) {
          const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), m.brass);
          rivet.position.set(x + 0.12, gy + 0.12, g.z + side * (g.depth / 2 - 0.055));
          root.add(rivet);
        }
      }
      physics.box(v3(0, gy, g.z), v3((S.x1 - S.x0) / 2, g.height / 2, g.depth / 2));
    }
    // Broken catwalk stubs over the channel (dressing, bent downward).
    for (const [z, dir] of [
      [S.gapNear, -1],
      [S.gapFar, 1],
    ] as Array<[number, number]>) {
      const stub = new THREE.Group();
      for (const sx of [-0.68, 0.68]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.6), m.iron);
        beam.position.set(sx, 0, dir * 0.3);
        stub.add(beam);
      }
      for (const sx of [-0.68, 0.68]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), m.iron);
        post.position.set(sx, 0.45, dir * 0.45);
        post.rotation.x = dir * 0.5;
        stub.add(post);
      }
      stub.position.set(0.6, S.floorY - 0.06, z);
      stub.rotation.x = dir * 0.55;
      stub.traverse((o) => (o.castShadow = true));
      root.add(stub);
    }
    // Pipes along the left wall: the maintenance spine.
    for (const [y, r] of [
      [7.3, 0.2],
      [8.1, 0.14],
      [10.6, 0.28],
    ]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, S.z1 - S.z0, 14), m.brass);
      p.rotation.x = Math.PI / 2;
      p.position.set(S.x0 + 0.4, y, (S.z0 + S.z1) / 2);
      p.castShadow = p.receiveShadow = true;
      root.add(p);
      for (const z of [19.4, 23, 26]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), m.ironDark);
        bracket.position.set(S.x0 + 0.25, y - r - 0.04, z);
        root.add(bracket);
      }
    }
    const channelSteam = new SteamEmitter(v3(S.x0 + 0.5, 7.3, 21.6), v3(0.6, 0.3, 0), 0.8, new THREE.Color('#b9c8cc'));
    scene.add(channelSteam.group);
    this.channelSteam = channelSteam;
    this.channelWater = new Water({ radius: 4.2, y: S.waterY, deep: new THREE.Color('#081c22'), moonDir: ctx.moonDir, fogDensity: 0.05, fogColor: Palette.fog, scale: 0.6 });
    this.channelWater.mesh.position.set(0, S.waterY, (S.gapNear + S.gapFar) / 2);
    this.channelWater.mesh.scale.set(1, 1, 0.3);
    scene.add(this.channelWater.mesh);

    // Shaft lights: the far landing is warm and inviting; a cold lamp over the hatch.
    const farLamp = new WorkLamp(m, v3(S.x1 - 0.01, S.floorY + 2.4, 19.6), v3(-1, 0, 0), { light: true, intensity: 8, distance: 9 });
    const hatchLamp = new WorkLamp(m, v3(-1.2, S.floorY + 2.7, S.z1 - 0.01), v3(0, 0, -1), { light: true, intensity: 4, distance: 7 });
    this.lamps.push(farLamp, hatchLamp);
    scene.add(farLamp.group, hatchLamp.group);
    this.landingLight = new ServiceLight(m, v3(-2.6, S.floorY, 25.7), Math.PI / 2);
    scene.add(this.landingLight.group);

    // ------------------------------------------------------------ breach + lookout
    const L = LOOKOUT;
    const breach = { x0: -1.1, x1: 1.1, top: L.y + 2.75 };
    solid(S.x0 - wt, breach.x0, S.channelBottom - 0.5, S.topY, L.z1, S.z0, m.stone, { damp: true });
    solid(breach.x1, S.x1 + wt, S.channelBottom - 0.5, S.topY, L.z1, S.z0, m.stone, { damp: true });
    solid(breach.x0, breach.x1, breach.top, S.topY, L.z1, S.z0, m.stone);
    solid(breach.x0, breach.x1, S.channelBottom - 0.5, L.y, L.z1, S.z0, m.stone);
    for (let i = 0; i < 8; i++) {
      const s = 0.25 + rng() * 0.35;
      const side = i % 2 ? breach.x0 : breach.x1;
      const block = new THREE.Mesh(boxProjectUVs(new RoundedBoxGeometry(s * 1.3, s, s, 1, 0.05)), m.stone);
      block.position.set(side + (i % 2 ? -0.1 : 0.1), L.y + 0.4 + (i >> 1) * 0.65, L.z1 + 0.5 + rng() * 0.4);
      block.rotation.set(rng() * 0.4, rng(), rng() * 0.4);
      block.castShadow = true;
      root.add(block);
    }
    // Lookout cell: floor, side walls, ceiling (front is the hall facade built by the hall).
    solid(L.x0 - wt, L.x1 + wt, L.y - HALL.floorT, L.y, HALL.aWall - 0.3, L.z1, m.floor);
    solid(L.x0 - wt, L.x0, L.y, L.y + L.h, L.z0, L.z1, m.stone, { damp: true });
    solid(L.x1, L.x1 + wt, L.y, L.y + L.h, L.z0, L.z1, m.stone, { damp: true });
    solid(L.x0 - wt, L.x1 + wt, L.y + L.h, L.y + L.h + 0.5, L.z0, L.z1, m.stoneDark);
    // Bent remains of the old bars and a railing at the edge.
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1 + rng() * 1.2, 6), m.iron);
      const x = -1.15 + i * 0.46;
      bar.position.set(x, L.y + (i % 3 === 1 ? 2.2 : 0.5), HALL.aWall + 0.25);
      bar.rotation.set(-0.3 - rng() * 0.6, 0, (rng() - 0.5) * 0.5);
      if (i % 3 !== 1) bar.geometry.translate(0, 0.4, 0);
      bar.castShadow = true;
      root.add(bar);
    }
    const railZ = HALL.aWall - 0.12;
    // A temporary repair railing across the collapsed front (rope-lashed to the posts).
    // The right part (x > 0.65) is a rope gate owned by the engine route; it drops after the reveal.
    batch.add(new THREE.BoxGeometry(2.85, 0.07, 0.07), m.iron, new THREE.Matrix4().makeTranslation(-0.78, L.y + 1.0, railZ));
    batch.add(new THREE.BoxGeometry(2.85, 0.045, 0.045), m.iron, new THREE.Matrix4().makeTranslation(-0.78, L.y + 0.5, railZ));
    for (const x of [-2.05, -0.7, 0.65, 2.1]) batch.add(new THREE.BoxGeometry(0.08, 1.05, 0.08), m.iron, new THREE.Matrix4().makeTranslation(x, L.y + 0.52, railZ));
    batch.add(new THREE.TorusGeometry(0.06, 0.02, 6, 12), m.rope, new THREE.Matrix4().makeTranslation(-0.7, L.y + 0.98, railZ));
    physics.box(v3(-0.78, L.y + 1.3, railZ), v3(1.43, 1.3, 0.08), undefined, { blocksCamera: false });
    this.lookoutLight = new ServiceLight(m, v3(-1.15, L.y, HALL.aWall + 0.45), Math.PI / 2);
    scene.add(this.lookoutLight.group);
    // Ivo's intercom: a brass speaker box with a cracked grille.
    {
      const box = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.52, 0.16, 2, 0.04), m.brass);
      box.position.set(L.x1 - 0.08, L.y + 1.7, 14.9);
      const grille = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), m.ironDark);
      grille.position.set(L.x1 - 0.165, L.y + 1.75, 14.9);
      grille.rotation.y = -Math.PI / 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), m.warningLamp);
      lamp.position.set(L.x1 - 0.17, L.y + 1.5, 14.9);
      this.intercomLamp = lamp.material as THREE.MeshStandardMaterial;
      root.add(box, grille, lamp);
      box.castShadow = true;
    }

    batch.build(root);
    this.intercomPos.set(L.x1 - 0.2, L.y + 1.7, 14.9);

    // ------------------------------------------------------------ the next increment: the engine route
    this.engine = new EngineRoute(ctx);
    this.engine.onExit = () => this.finishEngine();

    // ------------------------------------------------------------ gameplay wiring
    this.registerCheckpoints();
    this.registerInteractions();
    this.registerTriggers();
    this.registerCameraZones();

    this.conditions = {
      ...this.engine.conditions,
      pressureReady: () => this.logic.inLiftBand,
      hatchOpen: () => this.logic.hatch === 'latched',
      complete: () => ctx.progression.complete,
      revealDone: () => ctx.progression.has('reveal.done'),
    };
    this.route = [...buildRoute(), ...this.engine.route];
    this.routeParts = { slice: buildRoute(), engine: this.engine.route, feed: this.engine.feedRoute };
    this.startIntro();
  }

  private channelSteam: SteamEmitter;
  private intercomLamp: THREE.MeshStandardMaterial | null = null;
  private readonly intercomPos = new THREE.Vector3();

  // ---------------------------------------------------------------- setup helpers

  private registerCheckpoints(): void {
    const { checkpoints } = this.ctx;
    checkpoints.register({ id: 'cell', order: 0, label: 'Cell', feet: v3(SPAWNS.cell.x, SPAWNS.cell.y, SPAWNS.cell.z), facing: SPAWNS.cell.facing, impliesFlags: [], recoverBelowY: RECOVER_Y });
    checkpoints.register({
      id: 'landing',
      order: 1,
      label: 'Maintenance landing',
      feet: v3(SPAWNS.landing.x, SPAWNS.landing.y, SPAWNS.landing.z),
      facing: SPAWNS.landing.facing,
      impliesFlags: ['hatch.open'],
      recoverBelowY: RECOVER_Y,
      // The hatch wall is right behind this spawn: frame the landing diagonally instead.
      cameraYaw: SPAWNS.landing.facing + Math.PI + 1.05,
    });
    checkpoints.register({
      id: 'lookout',
      order: 2,
      label: 'Lookout',
      feet: v3(SPAWNS.lookout.x, SPAWNS.lookout.y, SPAWNS.lookout.z),
      facing: SPAWNS.lookout.facing,
      impliesFlags: ['hatch.open', 'gap.crossed'],
      recoverBelowY: -3,
    });
  }

  private registerInteractions(): void {
    const { interactions, dialogue, progression, player, hud, events } = this.ctx;
    const a = this.hatch.anchors;

    interactions.add({
      id: 'diagram',
      position: a.diagram,
      radius: 2.6,
      prompt: () => 'Inspect diagram',
      interact: () => {
        player.lockFor(0.4, a.diagram);
        hud.showDocument('diagram', this.hatch.diagramImage(), 'Scratched beside the hatch');
        const first = progression.set('clue.read');
        if (first) dialogue.say('Mara', 'Two ways for the pressure to go. Out the vent... or up into the piston.');
        events.emit('sfx', { name: 'paper' });
      },
    });

    interactions.add({
      id: 'valve',
      position: a.valve,
      radius: 2.2,
      prompt: () => (this.logic.bypassOpen ? 'Close bypass valve' : 'Open bypass valve'),
      interact: () => {
        player.lockFor(0.7, a.valve);
        const open = this.logic.toggleValve();
        this.hatch.setValve(open);
        events.emit('sfx', { name: open ? 'valveOpen' : 'valveClose', x: a.valve.x, y: a.valve.y, z: a.valve.z });
        this.hintTimer = 0;
        if (!open) {
          progression.set('valve.closed');
          if (this.logic.hatch === 'closed') this.later(1.4, () => dialogue.sayOnce('valve-closed', 'Mara', "Vent's quiet. The needle's climbing."));
        } else if (this.logic.hatch === 'latched') {
          dialogue.sayOnce('valve-reopen', 'Mara', 'The latch holds it now.');
        }
      },
    });

    let hissLines = 0;
    interactions.add({
      id: 'lever',
      position: a.lever,
      radius: 2.2,
      prompt: () => (this.logic.hatch === 'closed' ? 'Pull hatch lever' : null),
      interact: () => {
        player.lockFor(0.6, a.lever);
        const result = this.logic.pullLever();
        events.emit('sfx', { name: 'lever', x: a.lever.x, y: a.lever.y, z: a.lever.z });
        if (result === 'hiss') {
          this.hatch.pullLever(false);
          this.hatch.sealSteam.burst = 0.5;
          events.emit('sfx', { name: 'hiss', x: a.pistonSeal.x, y: a.pistonSeal.y, z: a.pistonSeal.z });
          const lines = ["All hiss, no lift. The pressure's going somewhere else.", 'Still bleeding off.', 'Not enough behind it.'];
          dialogue.say('Mara', lines[Math.min(hissLines++, lines.length - 1)]);
          progression.set('lever.tried');
        } else if (result === 'lift') {
          this.hatch.pullLever(true);
          events.emit('sfx', { name: 'piston', x: a.hatch.x, y: a.hatch.y, z: a.hatch.z });
          progression.set('hatch.lifting');
        }
      },
    });

    interactions.add({
      id: 'lookout-light',
      position: this.lookoutLight.lampWorld,
      radius: 2.4,
      prompt: () => (this.lookoutLight.lit ? null : 'Light the service lamp'),
      interact: () => this.activateLookout(),
    });
  }

  private registerTriggers(): void {
    const { triggers, progression, dialogue, hud, checkpoints, events } = this.ctx;
    const S = SHAFT;
    // Stepping through the hatch: light the landing's service light (checkpoint after the puzzle).
    triggers.add({
      id: 'landing',
      contains: boxVolume(v3(S.x0, S.floorY - 0.5, S.gapNear + 0.3), v3(S.x1, S.floorY + 3, S.z1 - 0.1)),
      onEnter: () => {
        if (checkpoints.reach('landing')) {
          this.landingLight.ignite();
          events.emit('sfx', { name: 'ignite', x: this.landingLight.lampWorld.x, y: this.landingLight.lampWorld.y, z: this.landingLight.lampWorld.z });
          hud.tip('Lit service lights mark where you return after a fall.');
          progression.setObjective('Cross the maintenance shaft');
        }
      },
    });
    triggers.add({
      id: 'jump-tip',
      contains: boxVolume(v3(S.x0, S.floorY - 0.5, S.girder.z + 0.3), v3(S.x1, S.floorY + 3, S.girder.z + 1.4)),
      onEnter: () => hud.tip(this.ctx.input.usingGamepad ? 'Press A to jump.' : 'Press Space to jump.', 'jump'),
    });
    triggers.add({
      id: 'far-landing',
      contains: boxVolume(v3(S.x0, S.floorY - 0.5, S.z0 - 1), v3(S.x1, S.floorY + 3, S.gapFar - 0.1)),
      onEnter: () => {
        progression.set('gap.crossed');
        progression.setObjective('Reach the lookout');
      },
    });
    triggers.add({
      id: 'lookout-enter',
      contains: boxVolume(v3(LOOKOUT.x0, LOOKOUT.y - 0.5, LOOKOUT.z0 - 0.6), v3(LOOKOUT.x1, LOOKOUT.y + 3, LOOKOUT.z1 - 0.4)),
      onEnter: () => {
        progression.set('lookout.reached');
        dialogue.say('Mara', 'A tide engine. They built the prison on top of it.');
        progression.setObjective('Light the service lamp');
      },
    });
  }

  private registerCameraZones(): void {
    const zones = this.ctx.camera.zones;
    zones.push({ id: 'cell', contains: boxVolume(v3(CELL.x0, CELL.y - 1, CELL.z0 - 0.2), v3(CELL.x1, CELL.y + 4, CELL.z1)), distance: 3.4, height: 1.5, fov: 62, priority: 2 });
    zones.push({ id: 'shaft', contains: boxVolume(v3(SHAFT.x0, -2, SHAFT.z0), v3(SHAFT.x1, 14, SHAFT.z1)), distance: 5.0, height: 1.6, fov: 60, priority: 1 });
    zones.push({ id: 'lookout', contains: boxVolume(v3(LOOKOUT.x0, LOOKOUT.y - 1, HALL.aWall - 0.5), v3(LOOKOUT.x1, LOOKOUT.y + 4, LOOKOUT.z1 + 0.3)), distance: 3.8, height: 1.6, fov: 60, priority: 2 });
  }

  // ---------------------------------------------------------------- story beats

  private startIntro(): void {
    if (this.ctx.intro) {
      this.playOpening();
      return;
    }
    const { dialogue, progression } = this.ctx;
    progression.setObjective('Open the service hatch');
    this.later(1.2, () => dialogue.say('Horn', 'Pressure cycle in progress. All cells remain sealed.'));
    this.later(4.2, () => dialogue.say('Mara', 'Fresh copper on that line. Who repairs a pipe in a cell?'));
  }

  /**
   * Chapter One's opening. The night before, Mara refused to sign off a flood diversion that
   * would drown her district, went back to her workshop to prove the plan wrong and fell asleep
   * over the drawings. She wakes on the floor of a cell in Breakwater. Narration cards over black,
   * then the cell: she gets up, looks around, works out where she is, and the chapter title plays.
   *
   * Skipping (Jump/Interact) leaves out the narration, lines and camera moves (`watchOnly`) and
   * runs every other step, so watching and skipping end the same way: Mara standing at the cell
   * spawn, camera behind her, control on, objective set.
   */
  private playOpening(): void {
    const { dialogue, progression, camera, avatar, hud, events } = this.ctx;
    const y = CELL.y;
    const at = (x: number, dy: number, z: number) => v3(x, y + dy, z);
    const steps: SequenceStep[] = [
      {
        at: 0,
        run: () => {
          this.ctx.setControl(false);
          progression.setObjective('');
          // Asleep on the floor between the bunk and the hatch: the first frame of getting up.
          avatar.cinematic('wake', 0);
          camera.playShot(at(1.75, 2.35, 27.55), at(-0.45, 0.1, 30.0), 0.001);
          hud.story({
            backdrop: true,
            eyebrow: 'Saltmere, the night before',
            text: 'Mara Venn keeps the tide engines of Saltmere running. Yesterday she was ordered to sign off a flood diversion that would drown her own district at the next high tide.',
          });
        },
      },
      { at: 6.2, watchOnly: true, run: () => hud.story({ backdrop: true, text: 'She refused. She went back to her workshop to prove the plan was wrong, and fell asleep over the drawings.' }) },
      { at: 11.4, watchOnly: true, run: () => hud.story({ backdrop: true, text: 'She woke up somewhere else.' }) },
      {
        at: 14.2,
        watchOnly: true,
        run: () => {
          hud.story(null);
          events.emit('sfx', { name: 'horn' });
        },
      },
      { at: 15.0, watchOnly: true, run: () => dialogue.say('Horn', 'Pressure cycle in progress. All cells remain sealed.', 3.4) },
      {
        at: 16.4,
        watchOnly: true,
        run: () => {
          avatar.cinematic('wake', 0.75);
          camera.playShot(at(1.3, 1.6, 27.85), at(-0.4, 0.95, 29.75), 2.6);
        },
      },
      { at: 18.9, watchOnly: true, run: () => dialogue.say('Mara', "Where... This isn't my workshop.", 2.4) },
      {
        at: 19.3,
        watchOnly: true,
        run: () => {
          // Face on: she looks around the cell.
          avatar.cinematic('shakeHead', 0.9);
          camera.playShot(at(0.25, 1.6, 27.95), at(-0.35, 1.45, 29.7), 1.6);
        },
      },
      { at: 21.6, watchOnly: true, run: () => dialogue.say('Mara', 'Salt on the walls. That engine thump... I know this place. Breakwater.', 3.6) },
      { at: 22.6, watchOnly: true, run: () => camera.playShot(at(1.85, 3.3, 27.4), at(-0.3, 0.7, 30.4), 5.0) },
      {
        at: 25.2,
        watchOnly: true,
        run: () => hud.story({ eyebrow: 'Chapter One', title: 'The Quiet Cell', text: 'The prison runs on the tide. So will her way out.' }),
      },
      {
        at: 29.4,
        run: () => {
          hud.story(null);
          avatar.endCinematic();
          camera.clearShot();
          camera.snapBehind(this.ctx.player.feet, this.ctx.player.facing, 0.3);
          this.ctx.setControl(true);
          progression.setObjective('Open the service hatch');
        },
      },
      { at: 31.2, run: () => dialogue.say('Mara', 'Fresh copper on that line. Who repairs a pipe in a cell?') },
    ];
    this.sequence = { t: 0, steps };
  }

  private activateLookout(): void {
    const { checkpoints, events, progression, dialogue, camera, player } = this.ctx;
    if (this.lookoutLight.lit) return;
    player.lockFor(0.5, this.lookoutLight.lampWorld);
    this.lookoutLight.ignite();
    checkpoints.reach('lookout');
    progression.set('lookout.lit');
    events.emit('sfx', { name: 'ignite', x: this.lookoutLight.lampWorld.x, y: this.lookoutLight.lampWorld.y, z: this.lookoutLight.lampWorld.z });
    progression.setObjective('');
    // Control is held only for the camera move and the lights coming on (about 3 s); the intercom
    // exchange plays over gameplay. The whole beat can be skipped (Jump/Interact).
    const steps: SequenceStep[] = [
      { at: 0.25, run: () => this.ctx.setControl(false) },
      {
        at: 0.3,
        run: () => {
          // Frame Mara at the rail with the hall, the engine and the beacon beyond.
          camera.playShot(v3(1.7, LOOKOUT.y + 2.2, 15.3), v3(-10.5, LOOKOUT.y + 2.6, -16), 1.8);
        },
      },
    ];
    this.hall.routeLamps.forEach((lamp, i) => {
      steps.push({
        at: 0.9 + i * 0.24,
        run: () => {
          lamp.setOn(true);
          events.emit('sfx', { name: 'lampOn', x: lamp.group.position.x, y: lamp.group.position.y, z: lamp.group.position.z });
        },
      });
    });
    const tLights = 0.9 + this.hall.routeLamps.length * 0.24;
    steps.push(
      {
        at: tLights,
        run: () => {
          events.emit('sfx', { name: 'intercom', x: this.intercomPos.x, y: this.intercomPos.y, z: this.intercomPos.z });
          this.intercomBlink = 4;
          dialogue.say('Intercom', 'The tide turns soon. Follow the service lights.', 3.6);
        },
      },
      {
        at: tLights + 0.9,
        run: () => {
          progression.set('reveal.done');
          camera.clearShot();
          camera.snapBehind(this.ctx.player.feet, this.ctx.player.facing, 0.3);
          this.ctx.setControl(true);
          this.engine.openRoute();
          events.emit('sfx', { name: 'lever', x: 1.4, y: LOOKOUT.y + 1, z: HALL.aWall - 0.1 });
          progression.setObjective('Follow the service lights down into the hall');
          this.ctx.hud.tip('The rope at the right of the railing has dropped. Short drops are safe.', 'route-open');
        },
      },
      { at: tLights + 4.0, run: () => dialogue.say('Mara', 'Who is this?', 1.8) },
      { at: tLights + 5.6, run: () => events.emit('sfx', { name: 'static' }) },
    );
    this.sequence = { t: 0, steps };
  }

  private intercomBlink = 0;
  private timers: Array<{ t: number; run: () => void }> = [];

  /** Whether a cinematic currently holds control (and can be skipped). */
  get cinematicActive(): boolean {
    return this.sequence !== null && this.ctx.player.frozen;
  }

  /**
   * Finish the running sequence now: every remaining step runs once, in order, so the camera,
   * gate, objective, dialogue and checkpoint end exactly as if the player had watched it. Steps
   * marked `watchOnly` (narration cards, story lines, camera moves) are dropped.
   */
  skipCinematic(): void {
    if (!this.cinematicActive || !this.sequence) return;
    const seq = this.sequence;
    for (const s of seq.steps) {
      if (s.done) continue;
      s.done = true;
      if (!s.watchOnly) s.run();
    }
    this.ctx.camera.clearShot();
    this.ctx.camera.snapBehind(this.ctx.player.feet, this.ctx.player.facing, 0.3);
    this.sequence = null;
    this.ctx.events.emit('sfx', { name: 'paper' });
  }

  private later(seconds: number, run: () => void): void {
    this.timers.push({ t: seconds, run });
  }

  /** Chapter One's ending: out on the gantry in the breach, with the harbour below. */
  private finishEngine(): void {
    const { progression, dialogue, camera, events, hud } = this.ctx;
    if (progression.has('engine.finished')) return;
    progression.set('engine.finished');
    progression.setObjective('');
    const ex = this.engine.exitCenter;
    const out = v3(Math.sin(sideAngle10), 0, Math.cos(sideAngle10));
    this.sequence = {
      t: 0,
      steps: [
        { at: 0.2, run: () => this.ctx.setControl(false) },
        { at: 0.25, watchOnly: true, run: () => camera.playShot(ex.clone().addScaledVector(out, -3.2).add(v3(1.6, 2.2, 0)), ex.clone().addScaledVector(out, 40).add(v3(0, -6, 0)), 3.0) },
        { at: 1.4, watchOnly: true, run: () => events.emit('sfx', { name: 'intercom', x: ex.x, y: ex.y + 1, z: ex.z }) },
        { at: 1.9, watchOnly: true, run: () => dialogue.say('Intercom', "You made the engine carry you. You're out of the cells, not off the rock.", 3.8) },
        { at: 6.0, watchOnly: true, run: () => dialogue.say('Mara', 'Who are you? Who brought me here?', 2.4) },
        { at: 8.6, watchOnly: true, run: () => dialogue.say('Intercom', 'Sorn wants your signature, or your silence. The only thing on Breakwater that still flies is in the hangar cell. Get there.', 5.4) },
        { at: 14.2, watchOnly: true, run: () => dialogue.say('Mara', 'Ivo. It has to be.', 2) },
        {
          at: 16.6,
          watchOnly: true,
          run: () => hud.story({ eyebrow: 'End of Chapter One', title: 'The Quiet Cell', text: 'Mara is out of the cell block. Somewhere above her, in the hangar cell, an old aircraft is waiting.' }),
        },
        {
          at: 21.4,
          run: () => {
            hud.story(null);
            this.ctx.complete({
              title: 'Chapter One complete',
              body: 'The machine that held the prison together just carried you out of the cell block. Next: Chapter Two, Wings in a Cage, the hangar cell and the old aircraft. It is in development; this is the end of the current build.',
            });
          },
        },
      ],
    };
  }

  // ---------------------------------------------------------------- hints

  /** A hint the player asked for (pause menu): the next tier, up to the explicit solution. */
  hint(): void {
    // Up at the split feed, hints are about that puzzle (their own escalation).
    if (this.engine.feedPuzzleActive) {
      this.engine.hint(HINT_ORDER[Math.min(this.requestedEngineHint, HINT_ORDER.length - 1)]);
      this.requestedEngineHint++;
      return;
    }
    if (this.logic.hatch !== 'closed') {
      const next = this.ctx.progression.objective || 'Explore the lookout';
      this.ctx.hud.tip(`Objective: ${next}.`);
      return;
    }
    const tier = HINT_ORDER[Math.min(this.requestedHint, HINT_ORDER.length - 1)];
    this.requestedHint++;
    this.hintTimer = 0;
    this.giveHint(tier);
  }

  private giveHint(tier: HintTier): void {
    const { dialogue, hud } = this.ctx;
    if (tier === 'reminder') {
      hud.tip('Objective: open the service hatch.');
      hud.pulseObjective();
    } else if (tier === 'evidence') {
      dialogue.interrupt();
      dialogue.say('Mara', 'Someone scratched a diagram next to the hatch.');
      this.hatch.pulseHighlight();
    } else {
      dialogue.interrupt();
      dialogue.say('Mara', 'The bypass is dumping it all into the vent. Shut the bypass, wait for the needle, then the lever.', 5);
    }
  }

  // ---------------------------------------------------------------- per-frame

  fixedUpdate(dt: number, time: number): void {
    this.time = time;
    const { progression, player, dialogue, events } = this.ctx;
    this.engine.fixedUpdate(dt);

    // Timers and scripted sequence (fixed step keeps them deterministic for tests).
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    due.forEach((t) => t.run());
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

    // Puzzle state.
    const pulse = enginePulse(time);
    const latchedNow = this.logic.update(dt, pulse);
    if (pulse > 0.5 && this.lastPulse <= 0.5) {
      // Each engine breath: the open bypass vents loudly and the hatch rattles in its rails.
      if (this.logic.bypassOpen) {
        this.hatch.ventSteam.burst = 0.6;
        if (this.logic.hatch === 'closed') this.hatch.rattleHatch(1);
        events.emit('sfx', { name: 'vent', x: this.hatch.anchors.vent.x, y: this.hatch.anchors.vent.y, z: this.hatch.anchors.vent.z });
      }
      events.emit('sfx', { name: 'engineThump' });
    }
    this.lastPulse = pulse;
    this.hatch.fixedUpdate(dt, this.logic.hatch === 'closed' ? 0 : this.logic.liftProgress, this.logic.hatch === 'latched', time);
    if (latchedNow) {
      progression.set('hatch.open');
      events.emit('sfx', { name: 'latch', x: this.hatch.anchors.hatch.x, y: this.hatch.anchors.hatch.y, z: this.hatch.anchors.hatch.z });
      dialogue.say('Mara', 'There you go. Thank you, old girl.');
      progression.setObjective('Go through the hatch');
    }

    // Hints, only while the puzzle is unsolved and the player is in the cell.
    if (this.logic.hatch === 'closed' && player.feet.z > CELL.z0) {
      this.hintTimer += dt;
      const next = AUTO_HINTS[this.autoHint];
      if (next && this.hintTimer >= next.after) {
        this.autoHint++;
        this.giveHint(next.tier);
      }
    }

    // Falling below the current checkpoint's recovery height: fade, then recover there.
    const y = player.feet.y;
    const recoverY = this.ctx.checkpoints.current?.recoverBelowY ?? -30;
    if (y < recoverY + (FALL_FADE_Y - RECOVER_Y)) this.falling = true;
    if (this.falling && y < recoverY) {
      this.falling = false;
      events.emit('sfx', { name: 'splash' });
      progression.falls++;
      this.ctx.respawn('fall');
    }
    if (y < -30 || Math.abs(player.feet.x) > 60 || Math.abs(player.feet.z) > 80) this.ctx.respawn('fall');

    // Drip: a drop every ~1.7 s taps the hatch line.
    this.dripT += dt;
    if (this.dripT > 1.7) {
      this.dripT = 0;
      events.emit('sfx', { name: 'drip', x: this.hatch.anchors.drip.x, y: this.hatch.anchors.drip.y, z: this.hatch.anchors.drip.z });
    }
  }

  /** After a fall recovery at a checkpoint. */
  onRespawn(checkpointId: string): void {
    this.engine.onRespawn(checkpointId);
  }

  afterPlayer(): void {
    this.engine.applyMotion();
  }

  update(dt: number, time: number, alpha: number): void {
    this.ctx.hud.setSkipHint(this.cinematicActive, this.ctx.input.usingGamepad);
    this.engine.update(dt, time, alpha);
    this.hatch.update(dt, time, this.logic.pressure);
    this.hall.update(dt, time, this.ctx.camera.camera.position);
    this.landingLight.update(dt, time);
    this.lookoutLight.update(dt, time);
    for (const l of this.lamps) l.update(dt, time);
    this.dripSteam.update(dt);
    this.channelSteam.update(dt);
    this.channelWater.update(time);
    this.slitShaft.update(time);
    // Falling drop from the ceiling onto the hatch line.
    const d = this.dripT / 0.45;
    if (d < 1) {
      this.drip.visible = true;
      this.drip.position.copy(this.hatch.anchors.drip).setY(CELL.y + CELL.h - 0.1 - (CELL.y + CELL.h - 0.1 - this.hatch.anchors.drip.y) * d * d);
    } else this.drip.visible = false;
    // Fall fade.
    const target = this.falling ? 1 : 0;
    this.fadeLevel += (target - this.fadeLevel) * (1 - Math.exp(-dt * (target ? 9 : 4)));
    this.ctx.hud.setFallFade(this.fadeLevel);
    if (this.intercomLamp) {
      this.intercomBlink = Math.max(0, this.intercomBlink - dt);
      this.intercomLamp.emissiveIntensity = this.intercomBlink > 0 ? (Math.sin(time * 14) > 0 ? 3 : 0.4) : 0.3;
    }
  }

  // ---------------------------------------------------------------- state management

  reset(): void {
    this.logic.reset();
    this.hatch.reset();
    this.landingLight.extinguish();
    this.lookoutLight.extinguish();
    this.hall.routeLamps.forEach((l) => l.setOn(false, true));
    this.engine.reset();
    this.sequence = null;
    this.timers = [];
    this.hintTimer = 0;
    this.autoHint = 0;
    this.requestedHint = 0;
    this.requestedEngineHint = 0;
    this.falling = false;
    this.fadeLevel = 0;
    this.startIntro();
  }

  applyCheckpointState(id: string): void {
    const { progression } = this.ctx;
    if (id === 'landing' || id === 'lookout') {
      if (this.logic.hatch !== 'latched') {
        this.logic.bypassOpen = false;
        this.logic.pressure = 0.9;
        this.logic.hatch = 'latched';
        this.logic.liftProgress = 1;
        this.hatch.setValve(false, true);
        this.hatch.pullLever(true);
        this.hatch.fixedUpdate(0, 1, true, this.time);
      }
      progression.set('hatch.open');
      this.landingLight.ignite(true);
      progression.setObjective('Cross the maintenance shaft');
    }
    if (id === 'lookout') {
      progression.set('gap.crossed');
      progression.setObjective('Light the service lamp');
    }
    if (this.checkpointIds.indexOf(id) > 2) {
      for (const f of ['gap.crossed', 'lookout.reached', 'lookout.lit', 'reveal.done']) progression.set(f);
      this.lookoutLight.ignite(true);
      this.hall.routeLamps.forEach((l) => l.setOn(true, true));
      this.engine.applyCheckpointState(id);
      progression.setObjective('Follow the service lights to the engine');
    }
  }

  debugInfo(): Record<string, unknown> {
    return {
      bypassOpen: this.logic.bypassOpen,
      pressure: Number(this.logic.pressure.toFixed(2)),
      liftBand: this.logic.pressure >= LIFT_THRESHOLD,
      hatch: this.logic.hatch,
      failedPulls: this.logic.failedPulls,
      autoHints: this.autoHint,
      requestedHints: this.requestedHint,
    };
  }
}

/** Critical path for the autopilot and the automated route test. */
function buildRoute(): RouteStep[] {
  const y = CELL.y;
  const S = SHAFT;
  return [
    { kind: 'pause', seconds: 0.5 },
    { kind: 'interact', id: 'diagram', standAt: [-0.55, y, 28.35], expectFlag: 'clue.read' },
    // Deliberately try the lever first: the hiss is the intended feedback for the wrong state.
    { kind: 'interact', id: 'lever', standAt: [1.75, y, 27.95], expectFlag: 'lever.tried' },
    { kind: 'interact', id: 'valve', standAt: [-1.35, y, 28.15], expectFlag: 'valve.closed' },
    { kind: 'wait', until: 'pressureReady', timeout: 6 },
    { kind: 'interact', id: 'lever', standAt: [1.75, y, 27.95], expectFlag: 'hatch.lifting' },
    { kind: 'wait', until: 'hatchOpen', timeout: 5 },
    { kind: 'move', to: [1.05, y, 27.6], precise: true },
    { kind: 'move', to: [1.05, S.floorY, 26.0], precise: true },
    { kind: 'jump', from: [1.0, S.floorY, S.girder.z + 0.75], to: [0.9, S.floorY, S.girder.z - 0.9] },
    { kind: 'move', to: [0.7, S.floorY, S.gapNear + 1.3], precise: true },
    { kind: 'jump', from: [0.6, S.floorY, S.gapNear + 0.25], to: [0.5, S.floorY, S.gapFar - 1.0] },
    { kind: 'move', to: [0.0, LOOKOUT.y, 17.9], precise: true },
    { kind: 'move', to: [-0.3, LOOKOUT.y, 14.6], precise: true },
    { kind: 'interact', id: 'lookout-light', standAt: [-0.45, LOOKOUT.y, 13.5], expectFlag: 'lookout.lit' },
    { kind: 'wait', until: 'revealDone', timeout: 20 },
  ];
}

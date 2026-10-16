import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Level, LevelContext, RouteStep } from '../Level';
import { Batcher, boxProjectUVs, mergeStatic, worldBox } from '../../world/geometry';
import { Palette } from '../../world/materials';
import { saltStainTexture } from '../../world/textures';
import { PressureHatch, OPENING } from '../../world/props/PressureHatch';
import { hazardStripeTexture } from '../../world/props/Maintenance';
import { Hangar } from '../../world/props/Hangar';
import { Workshop } from './Workshop';
import { ChalkMarks, chalkArrowTexture, type ChalkMarkSpot } from '../../world/props/ChalkMarks';
import { BoardedHatch } from '../../world/props/BoardedHatch';
import { Chain } from '../../world/props/Mechanisms';
import { GrindRail } from '../../player/GrindRail';
import { ServiceLight, WorkLamp, glowSprite } from '../../world/props/Lanterns';
import { LightShaft, SteamEmitter, Water } from '../../world/Atmosphere';
import { PressureHatchLogic, enginePulse, LIFT_THRESHOLD } from '../../gameplay/puzzles/PressureHatchLogic';
import { boxVolume } from '../../gameplay/Progression';
import { mulberry32 } from '../../core/math';
import { CELL, FALL_FADE_Y, HALL, LOOKOUT, RECOVER_Y, SHAFT, SPAWNS, sideAngle, sideFraction } from './layout';

const sideAngle10 = sideAngle(10);
import { buildTurbineHall, type TurbineHall } from './TurbineHall';
import { EngineRoute, ROUTE_RAIL_GAPS, ROUTE_WALKWAY_OVERRIDES } from './EngineRoute';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Merged meshes start without shadow flags: cast and receive for everything under `root` except `skip`. */
function castShadows(root: THREE.Object3D, skip: THREE.Object3D[]): void {
  for (const child of root.children) {
    if (skip.includes(child)) continue;
    child.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }
}
/** Hall cells whose bars someone bent open ("tier:k"): tier three, side 9, before the ram. */
const OPEN_CELLS = new Set(['2:9']);

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
  /** The opening's set (Saltmere, the night before) and the two cell lights it borrows. */
  private readonly workshop: Workshop;
  private readonly cellLamp: WorkLamp;
  private readonly fill: THREE.PointLight;
  private readonly fillHome = new THREE.Vector3();
  private inWorkshop = false;
  /** Secrets and toys (see buildSecrets). */
  private marks!: ChalkMarks;
  private boards!: BoardedHatch;
  private boardsNearT = 0;
  private readonly whistleAt = new THREE.Vector3();
  private readonly whistleTop = new THREE.Vector3();
  private whistleHandle!: THREE.Group;
  private whistleHandleY = 0;
  private whistleSteam!: SteamEmitter;
  private whistleT = 0;
  private whistlePulls = 0;
  private readonly chest = new THREE.Vector3();
  /** The feed pipe Mara can grind down from the lookout. */
  feedRail!: GrindRail;

  constructor(private readonly ctx: LevelContext) {
    const { scene, physics, materials: m } = ctx;
    this.hall = buildTurbineHall(scene, physics, m, ctx.moonDir, ROUTE_WALKWAY_OVERRIDES, ROUTE_RAIL_GAPS, OPEN_CELLS);

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
      if (opts.collide ?? true) {
        const col = physics.box(c, v3(w / 2, h / 2, d / 2));
        if (mat === m.wood) physics.setSurface(col, 'wood');
        else if (mat === m.iron || mat === m.ironDark || mat === m.grate) physics.setSurface(col, 'metal');
      }
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
      // The warden's transfer order, nailed inside the door: why Mara is here, and a pencilled
      // answer from whoever fixed her pipe.
      this.orderCanvas = transferOrderCanvas();
      const orderTex = new THREE.CanvasTexture(this.orderCanvas);
      orderTex.colorSpace = THREE.SRGBColorSpace;
      orderTex.anisotropy = 4;
      const order = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.45), new THREE.MeshStandardMaterial({ map: orderTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
      order.position.set(CELL.x1 - 0.105, cy + 1.22, 30.48);
      order.rotation.set(0, -Math.PI / 2, 0.04);
      root.add(order);
      this.orderPos.copy(order.position);
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
    this.cellLamp = cellLamp;
    this.fill = fill;
    this.fillHome.copy(fill.position);

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
      // At a run, Space vaults it; from a walk it is a small jump.
      const girder = physics.box(v3(0, gy, g.z), v3((S.x1 - S.x0) / 2, g.height / 2, g.depth / 2));
      ctx.traversal.markVaultable(girder);
      physics.setSurface(girder, 'metal');
    }
    // Railing along the channel's near lip, open only at the broken catwalk (S.crossing).
    {
      const z = S.gapNear + 0.14;
      const x0 = S.x0 + 0.05;
      const x1 = S.crossing.x0;
      const top = S.floorY + 1.05;
      const len = x1 - x0;
      batch.add(new THREE.BoxGeometry(len, 0.06, 0.06), m.iron, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, top, z));
      batch.add(new THREE.BoxGeometry(len, 0.04, 0.04), m.iron, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, S.floorY + 0.55, z));
      const posts = Math.ceil(len / 0.95);
      for (let i = 0; i <= posts; i++) {
        const x = x0 + (len * i) / posts;
        batch.add(new THREE.BoxGeometry(0.07, 1.05, 0.07), m.ironDark, new THREE.Matrix4().makeTranslation(x, S.floorY + 0.525, z));
      }
      // The torn end of the rail, bent toward the gap where the catwalk used to join it.
      const torn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), m.iron);
      torn.position.set(x1 + 0.2, top - 0.12, z - 0.05);
      torn.rotation.set(0.2, 0.35, -0.45);
      torn.castShadow = true;
      root.add(torn);
      physics.box(v3((x0 + x1) / 2, S.floorY + 0.55, z), v3(len / 2, 0.55, 0.05), undefined, { blocksCamera: false });
      // Hazard paint on the lip where the jump is made.
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(S.crossing.x1 - S.crossing.x0 - 0.1, 0.22), new THREE.MeshStandardMaterial({ map: (() => { const t = hazardStripeTexture().clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(4, 1); t.needsUpdate = true; return t; })(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set((S.crossing.x0 + S.crossing.x1) / 2, S.floorY + 0.012, S.gapNear + 0.16);
      root.add(stripe);
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
      stub.position.set((S.crossing.x0 + S.crossing.x1) / 2, S.floorY - 0.06, z);
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

    this.wallDust = new SteamEmitter(v3(0.4, cy + 3.95, CELL.z0 + 0.12), v3(0, -0.25, 0.35), 0, new THREE.Color('#8f806b'));
    this.wallDust.peakOpacity = 0.16;
    scene.add(this.wallDust.group);

    // Shaft lights: the far landing is warm and inviting; a cold lamp over the hatch.
    const farLamp = new WorkLamp(m, v3(S.x1 - 0.01, S.floorY + 2.4, 19.6), v3(-1, 0, 0), { light: true, intensity: 8, distance: 9 });
    const hatchLamp = new WorkLamp(m, v3(-1.2, S.floorY + 2.7, S.z1 - 0.01), v3(0, 0, -1), { light: true, intensity: 4, distance: 7 });
    // A lamp over the broken catwalk marks the crossing (glow and a light pool, no extra light).
    const crossingLamp = new WorkLamp(m, v3(S.x1 - 0.01, S.floorY + 2.3, S.gapNear + 0.9), v3(-1, 0, 0), { light: false, pool: true, poolOpacity: 0.12 });
    this.lamps.push(farLamp, hatchLamp, crossingLamp);
    scene.add(farLamp.group, hatchLamp.group, crossingLamp.group);
    this.landingLight = new ServiceLight(m, v3(-2.6, S.floorY, 25.7), Math.PI / 2);
    scene.add(this.landingLight.group);

    // Ivo's kit, on a crate by the hatch: a canvas tool roll and a brass steam kicker, chalked "IV".
    {
      const kx = 2.95;
      const kz = 26.05;
      const crate = new THREE.Mesh(boxProjectUVs(new RoundedBoxGeometry(0.66, 0.5, 0.5, 2, 0.03)), m.wood);
      crate.position.set(kx, S.floorY + 0.25, kz);
      crate.castShadow = crate.receiveShadow = true;
      root.add(crate);
      physics.box(v3(kx, S.floorY + 0.25, kz), v3(0.33, 0.25, 0.25));
      const chalk = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshStandardMaterial({ map: chalkMarkTexture(), transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      chalk.position.set(kx - 0.335, S.floorY + 0.27, kz);
      chalk.rotation.y = -Math.PI / 2;
      root.add(chalk);
      const kit = new THREE.Group();
      const canvas = new THREE.MeshStandardMaterial({ color: '#8a7a58', roughness: 1 });
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.52, 14), canvas);
      roll.rotation.z = Math.PI / 2;
      roll.position.y = 0.09;
      kit.add(roll);
      for (const x of [-0.15, 0.15]) {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.012, 6, 16), m.ironDark);
        strap.rotation.y = Math.PI / 2;
        strap.position.set(x, 0.09, 0);
        kit.add(strap);
      }
      const brass = new THREE.MeshStandardMaterial({ color: '#b08a4a', metalness: 0.85, roughness: 0.35 });
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 16), brass);
      can.position.set(0.05, 0.31, 0.06);
      kit.add(can);
      const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), new THREE.MeshStandardMaterial({ color: '#3a2a12', emissive: '#ffb347', emissiveIntensity: 2.4 }));
      gauge.rotation.x = Math.PI / 2;
      gauge.position.set(0.05, 0.33, -0.017);
      kit.add(gauge);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffc46b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      glow.scale.setScalar(0.7);
      glow.position.set(0.05, 0.33, -0.05);
      kit.add(glow);
      kit.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
      kit.position.set(kx, S.floorY + 0.5, kz);
      kit.rotation.y = 0.3;
      root.add(kit);
      this.kit = kit;
      this.kitPos.set(kx, S.floorY + 0.7, kz);
    }

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
    // Its collider reaches the ceiling: a double jump must not clear it before the reveal.
    physics.box(v3(-0.78, L.y + L.h / 2, railZ), v3(1.43, L.h / 2, 0.08), undefined, { blocksCamera: false });
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
    // Chapter Two's destination, visible through the breach: the seaplane hangar on its rock spur,
    // about 70 m out and a little left of the view from the exit gantry.
    {
      const ex = this.engine.exitCenter;
      const dir = v3(Math.sin(sideAngle10 + 0.44), 0, Math.cos(sideAngle10 + 0.44));
      const at = ex.clone().addScaledVector(dir, 72).setY(0);
      this.hangar = new Hangar(at, Math.atan2(ex.x - at.x, ex.z - at.z));
      scene.add(this.hangar.group);
    }
    // The opening's set, far from the prison. Visible until the opening strikes it, so it is drawn
    // once with everything else behind the loading screen and its shaders are ready.
    this.workshop = new Workshop(m, physics);
    this.workshop.visible = ctx.intro;
    this.workshop.group.userData.skipWarmUp = !ctx.intro;
    scene.add(this.workshop.group);
    this.engine.onExit = () => this.finishEngine();

    // ------------------------------------------------------------ gameplay wiring
    this.buildSecrets();
    this.buildFeedPipe();
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
    // Things Mara glances at as she passes (head turns; the interaction target wins when focused).
    const a = this.hatch.anchors;
    this.pois.push(a.diagram, a.gauge, a.pistonSeal, this.orderPos, this.intercomPos, v3(0, HALL.tierY[1] + 3, 0), v3(0, HALL.tierY[2] + 2, 0));
    this.route = [...buildRoute(), ...this.engine.route];
    this.routeParts = { slice: buildRoute(), engine: this.engine.route, feed: this.engine.feedRoute };
    this.startIntro();
  }

  private channelSteam: SteamEmitter;
  private kit!: THREE.Group;
  private readonly kitPos = new THREE.Vector3();
  private readonly pois: THREE.Vector3[] = [];
  /** Dust shaken off the hatch wall by each breath of the engine (felt in the cell). */
  private wallDust!: SteamEmitter;
  private orderCanvas!: HTMLCanvasElement;
  private readonly orderPos = new THREE.Vector3();
  private hangar!: Hangar;
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
      impliesFlags: ['hatch.open', 'gap.crossed', 'kicker.taken'],
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
        if (first) dialogue.say('Mara', 'Two ways for the pressure to go. Out the vent... or up into the piston.', undefined, { story: true, maxWait: 6 });
        events.emit('sfx', { name: 'paper' });
      },
    });

    interactions.add({
      id: 'kicker',
      position: this.kitPos,
      radius: 1.7,
      prompt: () => (progression.has('kicker.taken') ? null : 'Pick up the tool roll'),
      interact: () => {
        if (progression.has('kicker.taken')) return;
        player.lockFor(1.2, this.kitPos);
        this.ctx.avatar.cinematic('pickup', 1.1);
        this.later(0.45, () => {
          this.kit.visible = false;
          progression.set('kicker.taken');
          events.emit('sfx', { name: 'pickup', x: this.kitPos.x, y: this.kitPos.y, z: this.kitPos.z });
        });
        this.later(0.95, () => {
          hud.abilityCard(
            {
              eyebrow: 'Found: a steam kicker',
              title: 'Pressure in a can',
              rows: [
                { key: 'Space', pad: 'A', text: 'In the air: a second jump' },
                { key: 'Shift', pad: 'B', text: 'In the air: a steam dash' },
                { key: 'Ctrl', pad: 'RB', text: 'In the air: slam down' },
              ],
            },
            this.ctx.input.usingGamepad,
          );
          dialogue.say('Mara', "A steam kicker. The kind I build for the dredger crews... chalked 'IV'.", undefined, { story: true });
          progression.setObjective('Cross the maintenance shaft');
        });
      },
    });

    interactions.add({
      id: 'order',
      position: this.orderPos,
      radius: 1.9,
      prompt: () => 'Read the notice on the door',
      interact: () => {
        player.lockFor(0.4, this.orderPos);
        hud.showDocument('order', this.orderCanvas.toDataURL(), 'Nailed inside the cell door');
        if (progression.set('order.read')) {
          dialogue.say('Mara', 'They carried me in asleep, to make me sign. And someone fixed my pipe before I woke.', undefined, { story: true, maxWait: 6 });
        }
        events.emit('sfx', { name: 'paper' });
      },
    });

    interactions.add({
      id: 'valve',
      position: a.valve,
      radius: 2.2,
      prompt: () => (this.logic.bypassOpen ? 'Close bypass valve' : 'Open bypass valve'),
      interact: () => {
        // The valve sits low on the pipe: Mara kneels to turn it.
        player.lockFor(1.15, a.valve);
        this.ctx.avatar.cinematic('fix', 1.5, 0.3, false, 7);
        this.later(1.0, () => this.ctx.avatar.releaseCinematic('fix'));
        const open = this.logic.toggleValve();
        this.hatch.setValve(open);
        events.emit('sfx', { name: open ? 'valveOpen' : 'valveClose', x: a.valve.x, y: a.valve.y, z: a.valve.z });
        this.hintTimer = 0;
        if (!open) {
          progression.set('valve.closed');
          if (this.logic.hatch === 'closed') this.later(1.4, () => dialogue.sayOnce('valve-closed', 'Mara', "Vent's quiet. The needle's climbing.", undefined, { story: true, maxWait: 6 }));
        } else if (this.logic.hatch === 'latched') {
          dialogue.sayOnce('valve-reopen', 'Mara', 'The latch holds it now.', undefined, { story: true, maxWait: 6 });
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
          dialogue.say('Mara', lines[Math.min(hissLines++, lines.length - 1)], undefined, { story: true, maxWait: 6 });
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
    const { triggers, progression, dialogue, checkpoints, events } = this.ctx;
    const S = SHAFT;
    // Stepping through the hatch: light the landing's service light (checkpoint after the puzzle).
    triggers.add({
      id: 'landing',
      contains: boxVolume(v3(S.x0, S.floorY - 0.5, S.gapNear + 0.3), v3(S.x1, S.floorY + 3, S.z1 - 0.1)),
      onEnter: () => {
        if (checkpoints.reach('landing')) {
          this.showArea('shaft', 'The Maintenance Shaft', 'Between the cells and the engine');
          this.landingLight.ignite();
          events.emit('sfx', { name: 'ignite', x: this.landingLight.lampWorld.x, y: this.landingLight.lampWorld.y, z: this.landingLight.lampWorld.z });
          progression.setObjective(progression.has('kicker.taken') ? 'Cross the maintenance shaft' : 'Check the tool roll on the crate');
        }
      },
    });
    // No tutorial text: the girder is low and lit. Only a player who stands at it for a while
    // without jumping gets the button, once.
    triggers.add({
      id: 'jump-tip',
      once: false,
      contains: boxVolume(v3(S.x0, S.floorY - 0.5, S.girder.z + 0.3), v3(S.x1, S.floorY + 3, S.girder.z + 1.4)),
      onEnter: () => (this.jumpHintAt = this.time + 7),
      onExit: () => (this.jumpHintAt = null),
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
    // No camera assist across the shaft's girder and gap.
    this.ctx.camera.precision.push(boxVolume(v3(SHAFT.x0, SHAFT.floorY - 2, SHAFT.gapFar - 1.2), v3(SHAFT.x1, SHAFT.floorY + 3, SHAFT.girder.z + 1.6)));
    zones.push({ id: 'lookout', contains: boxVolume(v3(LOOKOUT.x0, LOOKOUT.y - 1, HALL.aWall - 0.5), v3(LOOKOUT.x1, LOOKOUT.y + 4, LOOKOUT.z1 + 0.3)), distance: 3.8, height: 1.6, fov: 60, priority: 2 });
  }

  // ---------------------------------------------------------------- story beats

  private startIntro(): void {
    if (this.ctx.intro) {
      this.playOpening();
      return;
    }
    const { dialogue, progression } = this.ctx;
    this.ctx.events.emit('music', { music: 'cell', ambience: 'tomb' });
    progression.setObjective('Open the service hatch');
    this.later(1.2, () => dialogue.say('Horn', 'Pressure cycle in progress. All cells remain sealed.'));
    this.later(4.2, () => dialogue.say('Mara', 'Fresh copper on that line. Who repairs a pipe in a cell?'));
  }

  /**
   * Chapter One's opening, watched rather than read. Saltmere, the night before, in Mara's
   * workshop: rain on the window, the diversion plans she was ordered to sign on the bench. She
   * stays up to prove them wrong and falls asleep over them; someone walks past the window, the
   * lamp goes out. Then Breakwater: she wakes on the floor of a cell, gets up, works out where she
   * is, and the chapter title plays. Captions in the lower third carry the backstory.
   *
   * Skipping (Jump/Interact) leaves out the captions, lines and camera moves (`watchOnly`) and
   * runs every other step, so watching and skipping end the same way: Mara standing at the cell
   * spawn, camera behind her, control on, objective set.
   */
  private playOpening(): void {
    const { dialogue, progression, camera, avatar, hud, events, checkpoints, player } = this.ctx;
    const ws = this.workshop;
    const w = ws.at;
    const bz = ws.benchZ;
    const y = CELL.y;
    const at = (x: number, dy: number, z: number) => v3(x, y + dy, z);
    const lamp = ws.lampLight;
    const steps: SequenceStep[] = [
      {
        at: 0,
        run: () => {
          this.ctx.setControl(false);
          progression.setObjective('');
          events.emit('music', { music: 'workshop', ambience: 'rain' });
          this.setWorkshop(true);
          player.teleport(ws.seat, ws.seatFacing);
          avatar.cinematic('sitIdle', 1, 0, true);
          hud.letterbox(true);
          // Wide: the workshop at night, rain on the window, Mara at the bench under the lamp.
          camera.playShot(w(1.45, 1.95, -0.95), w(-0.25, 0.95, bz), 6.0, { from: { pos: w(1.95, 2.3, -1.65), look: w(-0.2, 0.9, bz) }, fov: 50 });
          hud.story({ lower: true, eyebrow: 'Saltmere, the night before', text: 'Mara Venn keeps the tide engines of Saltmere running.' });
        },
      },
      {
        at: 5.2,
        watchOnly: true,
        run: () => {
          // Over her shoulder, onto the plans she was ordered to sign.
          camera.playShot(w(0.5, 1.36, bz - 1.12), w(-0.15, 0.78, bz - 0.05), 5.4, { from: { pos: w(0.8, 1.52, bz - 1.48), look: w(-0.1, 0.78, bz - 0.02) }, fov: 42 });
          hud.story({ lower: true, text: 'Today she was ordered to sign off a flood diversion that would drown her own district at the next high tide.' });
        },
      },
      {
        at: 10.6,
        watchOnly: true,
        run: () => {
          // Side on, the lamp beyond her: she fights sleep, and loses.
          camera.playShot(w(1.2, 1.12, bz - 0.55), w(0, 1.0, bz - 0.98), 5.0, { from: { pos: w(1.45, 1.2, bz - 0.8), look: w(0, 1.05, bz - 1.0) }, fov: 45 });
          hud.story({ lower: true, text: 'She refused, and stayed up to prove the plan was wrong.' });
          avatar.doze = 0.55;
        },
      },
      { at: 12.3, watchOnly: true, run: () => (avatar.doze = 0.15) },
      { at: 13.1, watchOnly: true, run: () => (avatar.doze = 1) },
      {
        at: 15.4,
        watchOnly: true,
        run: () => {
          hud.story(null);
          // Past her to the window: someone walks by in the rain.
          camera.playShot(w(-0.3, 1.42, bz - 1.18), w(-0.05, 1.7, 2.8), 4.6, { from: { pos: w(-0.4, 1.36, bz - 1.36), look: w(-0.05, 1.66, 2.8) }, fov: 48 });
        },
      },
      { at: 15.6, watchOnly: true, run: () => ws.passFigure() },
      { at: 19.2, watchOnly: true, run: () => events.emit('sfx', { name: 'doorCreak', x: lamp.x - 2, y: lamp.y, z: lamp.z - 3 }) },
      {
        at: 20.0,
        watchOnly: true,
        run: () => {
          ws.setLamp(0);
          events.emit('sfx', { name: 'lampOut', x: lamp.x, y: lamp.y, z: lamp.z });
        },
      },
      {
        at: 21.4,
        watchOnly: true,
        run: () => {
          hud.story({ backdrop: true, text: 'She woke up somewhere else.' });
          events.emit('music', { music: null, ambience: null });
        },
      },
      {
        at: 23.4,
        run: () => {
          // Breakwater: asleep on the cell floor, between the bunk and the hatch.
          this.setWorkshop(false);
          const cp = checkpoints.get('cell')!;
          player.teleport(cp.feet, cp.facing);
          avatar.endCinematic();
          avatar.cinematic('wake', 0);
          camera.playShot(at(1.75, 2.35, 27.55), at(-0.45, 0.1, 30.0), 0.001, { fov: 58 });
          events.emit('music', { ambience: 'tomb' });
        },
      },
      {
        at: 24.2,
        watchOnly: true,
        run: () => {
          hud.story(null);
          events.emit('sfx', { name: 'horn' });
        },
      },
      { at: 25.0, watchOnly: true, run: () => dialogue.say('Horn', 'Pressure cycle in progress. All cells remain sealed.', 3.4) },
      {
        at: 26.4,
        watchOnly: true,
        run: () => {
          avatar.cinematic('wake', 0.75);
          camera.playShot(at(1.3, 1.6, 27.85), at(-0.4, 0.95, 29.75), 2.6);
        },
      },
      { at: 28.9, watchOnly: true, run: () => dialogue.say('Mara', "Where... This isn't my workshop.", 2.4, { story: true }) },
      {
        at: 29.3,
        watchOnly: true,
        run: () => {
          // Face on: she looks around the cell.
          avatar.cinematic('shakeHead', 0.9);
          camera.playShot(at(0.25, 1.6, 27.95), at(-0.35, 1.45, 29.7), 1.6);
        },
      },
      { at: 31.6, watchOnly: true, run: () => dialogue.say('Mara', 'Salt on the walls. That engine thump... I know this place. Breakwater.', 3.6, { story: true }) },
      { at: 32.6, watchOnly: true, run: () => camera.playShot(at(1.85, 3.3, 27.4), at(-0.3, 0.7, 30.4), 5.0) },
      {
        at: 35.2,
        watchOnly: true,
        run: () => {
          hud.story({ eyebrow: 'Chapter One', title: 'The Quiet Cell', text: 'The prison runs on the tide. So will her way out.' });
          events.emit('music', { music: 'cell' });
        },
      },
      {
        at: 39.0,
        run: () => {
          hud.story(null);
          hud.letterbox(false);
          avatar.endCinematic();
          camera.clearShot();
          camera.snapBehind(this.ctx.player.feet, this.ctx.player.facing, 0.3);
          this.ctx.setControl(true);
          progression.setObjective('Open the service hatch');
          events.emit('music', { music: 'cell', ambience: 'tomb' });
        },
      },
      { at: 40.8, run: () => dialogue.say('Mara', 'Fresh copper on that line. Who repairs a pipe in a cell?') },
    ];
    this.sequence = { t: 0, steps };
  }

  /**
   * Put up or strike the opening's workshop set. Two of the cell's lights stand in for the oil
   * lamp and the window (moving a light costs nothing; adding one recompiles every material), the
   * moon and sky light go down, and the prison's engine drone goes quiet.
   */
  private setWorkshop(on: boolean): void {
    if (on === this.inWorkshop) return;
    this.inWorkshop = on;
    this.workshop.visible = on;
    this.ctx.setOutdoorLight(on ? 0.12 : 1);
    this.ctx.events.emit('music', { drone: !on });
    const lamp = this.cellLamp.light;
    if (lamp) {
      if (on) {
        this.ctx.scene.attach(lamp);
        lamp.position.copy(this.workshop.lampLight);
      } else {
        this.cellLamp.group.add(lamp);
        lamp.position.set(0, 0, 0.3);
      }
    }
    this.fill.position.copy(on ? this.workshop.windowLight : this.fillHome);
    this.fill.intensity = on ? 5.5 : 1.6;
    if (on) this.workshop.setLamp(1, true);
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
      {
        at: 0.25,
        run: () => {
          this.ctx.setControl(false);
          this.ctx.hud.letterbox(true);
        },
      },
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
          events.emit('music', { music: 'hall', ambience: 'waves' });
          this.ctx.hud.letterbox(false);
          camera.clearShot();
          camera.snapBehind(this.ctx.player.feet, this.ctx.player.facing, 0.3);
          this.ctx.setControl(true);
          this.engine.openRoute();
          events.emit('sfx', { name: 'lever', x: 1.4, y: LOOKOUT.y + 1, z: HALL.aWall - 0.1 });
          progression.setObjective('Follow the service lights down into the hall');
          this.showArea('hall', 'The Turbine Hall', 'Breakwater runs on the tide');
          this.ropeHintAt = this.time + 16;
        },
      },
      { at: tLights + 4.0, run: () => dialogue.say('Mara', 'Who is this?', 1.8, { story: true }) },
      {
        at: tLights + 7.4,
        run: () => {
          if (!progression.has('grind.first') && this.ctx.player.feet.y > LOOKOUT.y - 0.5) dialogue.say('Mara', 'That old feed pipe runs all the way down. I could ride it...', 3.2);
        },
      },
      { at: tLights + 5.6, run: () => events.emit('sfx', { name: 'static' }) },
    );
    this.sequence = { t: 0, steps };
  }

  private intercomBlink = 0;
  /** Hesitation hints: shown only if the player has not moved on by then. */
  private jumpHintAt: number | null = null;
  private ropeHintAt: number | null = null;
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

  // ---------------------------------------------------------------- secrets and toys

  /**
   * Off the main path: five chalk "IV" marks (one beside the tally marks in Mara's cell, one on a
   * shelf only a double jump reaches, one at the lookout, one under boards only a ground pound
   * breaks, one in a cell whose bars someone bent open), and a steam whistle by the scaffold, for
   * the joy of pulling it.
   */
  private buildSecrets(): void {
    const { scene, physics, materials: m, interactions, events } = this.ctx;
    const S = SHAFT;
    const L = LOOKOUT;
    const T1 = HALL.tierY[0];
    const T3 = HALL.tierY[2];
    const radial = (k: number) => v3(Math.sin(sideAngle(k)), 0, Math.cos(sideAngle(k)));
    const onSide = (k: number, a: number, f: number, y: number) => {
      const [x, z] = sideFraction(k, a, f);
      return v3(x, y, z);
    };
    const root = new THREE.Group();
    root.name = 'secrets';
    scene.add(root);
    // Props are grouped by place and each group is merged on its own, so each still culls.
    const shelfRoot = new THREE.Group();
    const arrowRoot = new THREE.Group();
    const cellRoot = new THREE.Group();
    const whistleRoot = new THREE.Group();
    root.add(shelfRoot, arrowRoot, cellRoot, whistleRoot);

    // A maintenance shelf high on the breach wall over the far landing. A single jump falls short
    // (with the controller's step-up) by about 0.4 m; a double jump clears it with 0.45 m to spare.
    const shelfTop = S.floorY + 2.15;
    const sx0 = 2.05;
    const sz1 = S.z0 + 0.8;
    const sc = v3((sx0 + S.x1) / 2, shelfTop - 0.06, (S.z0 + sz1) / 2);
    const shelf = new THREE.Mesh(boxProjectUVs(new THREE.BoxGeometry(S.x1 - sx0, 0.12, sz1 - S.z0)), m.wood);
    shelf.position.copy(sc);
    shelf.castShadow = shelf.receiveShadow = true;
    shelfRoot.add(shelf);
    for (const x of [sx0 + 0.25, S.x1 - 0.3]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.95), m.ironDark);
      brace.position.set(x, shelfTop - 0.45, S.z0 + 0.36);
      brace.rotation.x = -0.72;
      shelfRoot.add(brace);
    }
    const toolbox = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.2, 0.22, 2, 0.02), m.iron);
    toolbox.position.set(3.25, shelfTop + 0.1, S.z0 + 0.3);
    toolbox.rotation.y = 0.2;
    toolbox.castShadow = true;
    shelfRoot.add(toolbox);
    const shelfCol = physics.box(sc, v3((S.x1 - sx0) / 2, 0.06, (sz1 - S.z0) / 2));
    physics.setSurface(shelfCol, 'wood');

    // Boards over an old floor hatch in the dead end left of the scaffold (tier one, side 17),
    // with a chalk arrow on the pier above pointing down at them.
    const kB = 17;
    const boardsAt = onSide(kB, 11.0, 0.84, T1);
    this.boards = new BoardedHatch(physics, m, boardsAt, sideAngle(kB));
    root.add(this.boards.group);
    const arrowTex = chalkArrowTexture();
    const arrow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.68),
      new THREE.MeshStandardMaterial({ map: arrowTex, emissiveMap: arrowTex, emissive: '#f4ecd8', emissiveIntensity: 0.35, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    const arrowAt = onSide(kB, HALL.aWall - 0.012, 0.9, T1 + 1.3);
    arrow.position.copy(arrowAt);
    arrow.lookAt(arrowAt.clone().sub(radial(kB)));
    arrowRoot.add(arrow);
    events.on('groundPound', (e) => {
      if (this.boards.broken) return;
      const c = this.boards.centre;
      const onBoards = e.collider === this.boards.collider.handle || (Math.hypot(e.x - c.x, e.z - c.z) < 0.75 && Math.abs(e.y - c.y) < 0.6);
      if (onBoards) this.breakBoards();
    });

    // The cell with the bent bars (tier three, side 9): someone slept here.
    const cellBack = HALL.aWall + HALL.wallT + HALL.recess;
    const bedroll = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 4, 10), m.wool);
    bedroll.position.copy(onSide(9, cellBack - 0.5, 0.36, T3 + 0.2));
    bedroll.rotation.set(Math.PI / 2, 0, sideAngle(9) + Math.PI / 2);
    bedroll.scale.set(1, 1, 0.6);
    cellRoot.add(bedroll);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 8), m.ceramic);
    const candleAt = onSide(9, cellBack - 0.35, 0.66, T3 + 0.06);
    candle.position.copy(candleAt);
    cellRoot.add(candle);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffb46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    flame.position.copy(candleAt).setY(T3 + 0.2);
    flame.scale.setScalar(0.5);
    cellRoot.add(flame);

    // The marks.
    this.marks = new ChalkMarks([
      { id: 'cell', pos: v3(CELL.x0 + 0.014, CELL.y + 0.82, 31.62), normal: v3(1, 0, 0), radius: 1.35, size: 0.28 },
      { id: 'shelf', pos: v3(2.85, shelfTop + 0.8, S.z0 + 0.012), normal: v3(0, 0, 1), radius: 0.85 },
      { id: 'lookout', pos: v3(L.x0 + 0.012, L.y + 0.55, 16.5), normal: v3(1, 0, 0), radius: 1.1 },
      { id: 'boards', pos: boardsAt.clone().setY(T1 + 0.012), normal: v3(0, 1, 0), radius: 1.15, size: 0.6, hidden: true },
      { id: 'open-cell', pos: onSide(9, cellBack - 0.012, 0.56, T3 + 1.25), normal: radial(9).negate(), radius: 1.2 },
    ]);
    root.add(this.marks.group);

    // The steam whistle: a brass bell on a feed pipe against the pier, and a lever arm whose chain
    // hangs to a wooden grip at hand height.
    const kW = 1;
    const out = radial(kW).negate();
    const wBase = onSide(kW, HALL.aWall - 0.14, 0.88, T1);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 10), m.brass);
    pipe.position.copy(wBase).setY(T1 + 1.1);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.46, 18), m.brass);
    bell.position.copy(wBase).setY(T1 + 2.43);
    const slot = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.05, 18), m.ironDark);
    slot.position.copy(wBase).setY(T1 + 2.28);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.brass);
    cap.position.copy(wBase).setY(T1 + 2.66);
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), m.ironDark);
    valve.position.copy(wBase).setY(T1 + 2.15);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), m.ironDark);
    arm.position.copy(wBase).addScaledVector(out, 0.21).setY(T1 + 2.15);
    arm.rotation.y = sideAngle(kW);
    for (const o of [pipe, bell, slot, cap, valve, arm]) {
      o.castShadow = true;
      whistleRoot.add(o);
    }
    this.whistleHandle = new THREE.Group();
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.78, 4), m.ironDark);
    chain.position.y = 0.43;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.14, 4, 8), m.wood);
    grip.rotation.z = Math.PI / 2;
    grip.rotation.y = sideAngle(kW);
    this.whistleHandle.add(chain, grip);
    this.whistleHandle.position.copy(wBase).addScaledVector(out, 0.42).setY(T1 + 1.35);
    this.whistleHandleY = this.whistleHandle.position.y;
    root.add(this.whistleHandle);
    this.whistleAt.copy(this.whistleHandle.position);
    this.whistleTop.copy(wBase).setY(T1 + 2.3);
    // Steam leaves through the slot, up and out over the walkway.
    this.whistleSteam = new SteamEmitter(this.whistleTop.clone().addScaledVector(out, 0.1), v3(0, 1.8, 0).addScaledVector(out, 1.1), 0, new THREE.Color('#e4eaec'));
    this.whistleSteam.peakOpacity = 0.32;
    root.add(this.whistleSteam.group);
    // One draw per material for the static props (they also draw into the moon's shadow map).
    mergeStatic(shelfRoot);
    mergeStatic(arrowRoot);
    mergeStatic(cellRoot, [flame]);
    mergeStatic(whistleRoot);
    // The shelf and the whistle are big enough to cast a shadow worth drawing.
    castShadows(shelfRoot, []);
    castShadows(whistleRoot, []);
    interactions.add({
      id: 'whistle',
      position: this.whistleAt,
      radius: 1.6,
      prompt: () => (this.whistleT > 0 ? null : 'Pull the steam whistle'),
      interact: () => this.pullWhistle(),
    });
  }

  private breakBoards(): void {
    const { events, progression, camera, effects } = this.ctx;
    const c = this.boards.centre;
    this.boards.smash();
    this.marks.reveal('boards');
    progression.set('boards.broken');
    events.emit('sfx', { name: 'boardsBreak', x: c.x, y: c.y, z: c.z });
    effects.burst(c.clone().setY(c.y + 0.15), { count: 16, color: '#7d5a3a', speed: 3, spread: 1.2, life: 0.8, size: [0.08, 0.2], rise: 0.5, opacity: 0.8 });
    camera.shake(0.2);
  }

  private pullWhistle(): void {
    const { player, events, camera, dialogue, progression } = this.ctx;
    if (this.whistleT > 0) return;
    this.whistleT = 2.2;
    this.whistlePulls++;
    player.lockFor(0.35, this.whistleAt);
    const h = this.whistleAt;
    events.emit('sfx', { name: 'whistlePull', x: h.x, y: h.y, z: h.z });
    this.later(0.15, () => {
      const t = this.whistleTop;
      events.emit('sfx', { name: 'whistle', x: t.x, y: t.y, z: t.z });
      this.whistleSteam.burst = 1.6;
      camera.shake(0.12);
    });
    progression.set('whistle.pulled');
    if (this.whistlePulls === 1) this.later(2.1, () => dialogue.say('Mara', '...Sorry. I had to.', 2));
    if (this.whistlePulls === 3) this.later(2.3, () => dialogue.say('Horn', 'Unscheduled whistle. Pressure loss logged.', 3));
  }

  private onMarkFound(spot: ChalkMarkSpot): void {
    const { progression, events, hud, dialogue, effects } = this.ctx;
    progression.set(`mark.${spot.id}`);
    const n = this.marks.foundCount;
    events.emit('sfx', { name: 'markFound', x: spot.pos.x, y: spot.pos.y, z: spot.pos.z });
    effects.burst(spot.pos, { count: 10, color: '#efe6d2', dir: spot.normal, speed: 1.2, spread: 0.8, life: 0.9, size: [0.06, 0.16], opacity: 0.5, rise: 0.2 });
    hud.toast(`Chalk mark "IV" \u00b7 ${n} of ${this.marks.total}`);
    const lines = [
      "'IV', in chalk. Somebody's been through here before me.",
      "Another 'IV'. Same hand as the last one.",
      'Somebody is leaving me a trail.',
      "Whoever 'IV' is, they climb like a dredger crew.",
      "All five. 'IV'... I know that hand.",
    ];
    dialogue.say('Mara', lines[Math.min(n, lines.length) - 1], 3.2);
  }

  /**
   * The broken feed pipe from the lookout down into the hall. Bolted at the lookout's edge (right
   * of the rope gate), it swings out over the void, round in front of the engine, and back over the
   * tier-one railing at side 1, hung from the roof on chains. Stepping or jumping onto it from the
   * lookout rides it down (a grind of about 20 m); the rope and scaffold stay as the other way.
   */
  private buildFeedPipe(): void {
    const { scene, materials: m, traversal, events, progression, dialogue } = this.ctx;
    const root = new THREE.Group();
    root.name = 'feed-pipe';
    scene.add(root);
    const points = [
      [1.8, 4.42, 11.65],
      [1.2, 4.12, 9.95],
      [-0.6, 3.85, 8.55],
      [-2.9, 3.55, 7.65],
      [-4.25, 3.25, 6.05],
      [-3.5, 2.95, 4.65],
      [-0.6, 2.6, 5.5],
      [1.6, 2.3, 6.0],
      [3.15, 1.95, 7.15],
      [3.4, 1.6, 8.75],
      [3.45, 1.32, 9.85],
    ].map(([x, y, z]) => v3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const radius = 0.13;
    const rail = new GrindRail(curve, radius);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, radius, 12, false), m.brass);
    tube.castShadow = tube.receiveShadow = true;
    root.add(tube);
    // Iron collars along it, a flange where it is bolted at the lookout, a torn lip at the open end.
    const zAxis = v3(0, 0, 1);
    const collar = new THREE.TorusGeometry(radius + 0.02, 0.025, 6, 16);
    const at = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let s = 0.9; s < rail.length - 0.5; s += 1.7) {
      const c = new THREE.Mesh(collar, m.ironDark);
      c.position.copy(rail.pointAt(s, at));
      c.quaternion.setFromUnitVectors(zAxis, rail.tangentAt(s, tan));
      root.add(c);
    }
    for (const [s, r, w] of [
      [0.05, radius + 0.09, 0.05],
      [rail.length - 0.04, radius + 0.04, 0.03],
    ]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16), m.ironDark);
      flange.position.copy(rail.pointAt(s, at));
      flange.quaternion.setFromUnitVectors(v3(0, 1, 0), rail.tangentAt(s, tan));
      root.add(flange);
    }
    // Hung from the roof.
    for (const f of [0.2, 0.42, 0.63, 0.84]) {
      const p = rail.pointAt(f * rail.length);
      const chain = new Chain(m.ironDark, v3(p.x, HALL.roofY, p.z), p.clone().setY(p.y + radius), 0.12);
      root.add(chain.mesh);
    }
    // Tube, collars, flanges and chains: one draw per material.
    mergeStatic(root);
    castShadows(root, []);
    traversal.addRail(rail);
    this.feedRail = rail;
    events.on('grind', (g) => {
      if (g.on && progression.set('grind.first')) dialogue.say('Mara', 'Whoa... okay. Okay!', 1.8);
    });
  }

  /** A one-time area title (once per run). */
  private showArea(id: string, title: string, sub: string): void {
    if (this.ctx.progression.set(`area.${id}`)) this.ctx.hud.areaTitle(title, sub);
  }

  private later(seconds: number, run: () => void): void {
    this.timers.push({ t: seconds, run });
  }

  /**
   * Chapter One's ending: out on the gantry in the breach, the sea wind and the harbour below.
   * The camera comes round over Mara's shoulder; the intercom points her to the seaplane hangar on
   * the spur, whose lights come up as it is named; then the completion card lies over that view.
   */
  private finishEngine(): void {
    const { progression, dialogue, camera, events } = this.ctx;
    if (progression.has('engine.finished')) return;
    progression.set('engine.finished');
    progression.setObjective('');
    events.emit('music', { music: 'ending', ambience: 'waves' });
    const ex = this.engine.exitCenter;
    const out = v3(Math.sin(sideAngle10), 0, Math.cos(sideAngle10));
    const toHangar = this.hangar.focus.clone().sub(ex).setY(0).normalize();
    const side = v3(toHangar.z, 0, -toHangar.x);
    this.sequence = {
      t: 0,
      steps: [
        {
          at: 0.2,
          run: () => {
            this.ctx.setControl(false);
            this.ctx.hud.letterbox(true);
          },
        },
        // Over the shoulder, out to sea.
        { at: 0.25, watchOnly: true, run: () => camera.playShot(ex.clone().addScaledVector(out, -3.2).add(v3(1.6, 2.2, 0)), ex.clone().addScaledVector(out, 40).add(v3(0, -6, 0)), 3.0) },
        { at: 1.4, watchOnly: true, run: () => events.emit('sfx', { name: 'intercom', x: ex.x, y: ex.y + 1, z: ex.z }) },
        { at: 1.9, watchOnly: true, run: () => dialogue.say('Intercom', "You made the engine carry you. You're out of the cells, not off the rock.", 3.8) },
        { at: 6.0, watchOnly: true, run: () => dialogue.say('Mara', 'Who are you? Who brought me here?', 2.4, { story: true }) },
        { at: 8.6, watchOnly: true, run: () => dialogue.say('Intercom', "Sorn wants your signature, or your silence. Look left, past the breach. The old hangar on the spur.", 4.6) },
        // The hangar's work lights come up as it is named; the camera swings to frame it past Mara.
        {
          at: 10.6,
          run: () => {
            this.hangar.setLit(true);
            events.emit('sfx', { name: 'lampOn', x: ex.x, y: ex.y, z: ex.z, volume: 0.6 });
          },
        },
        {
          at: 10.7,
          watchOnly: true,
          // Aim below the hangar so it sits in the upper third, above the completion card.
          run: () => camera.playShot(ex.clone().addScaledVector(toHangar, -3.4).addScaledVector(side, -1.3).add(v3(0, 2.6, 0)), this.hangar.focus.clone().add(v3(0, -12, 0)), 4.0),
        },
        { at: 13.4, watchOnly: true, run: () => dialogue.say('Intercom', "There's a seaplane in there. The only thing on Breakwater that still flies. Get to it before the tide turns.", 5.0) },
        { at: 18.6, watchOnly: true, run: () => dialogue.say('Mara', 'Ivo. It has to be.', 2, { story: true }) },
        {
          at: 21.0,
          run: () => {
            this.ctx.hud.letterbox(false);
            this.ctx.complete({
              title: 'Chapter One complete',
              body: 'Mara is out of the cell block, and the old seaplane is waiting in the hangar on the spur. Next: Chapter Two, <i>Wings in a Cage</i> (in development).',
              reward: true,
              marks: { found: this.marks.foundCount, total: this.marks.total },
            });
          },
        },
      ],
    };
  }

  // ---------------------------------------------------------------- hints

  pointOfInterest(feet: THREE.Vector3, facing: number): THREE.Vector3 | null {
    // From the top tier and the exit gantry, the hangar across the water draws the eye.
    if (feet.y > HALL.tierY[2] - 1 && this.hangar.isLit) return this.hangar.focus;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const p of [...this.pois, ...this.marks.unfound]) {
      const dx = p.x - feet.x;
      const dz = p.z - feet.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6 || d > 12 || Math.abs(p.y - feet.y) > 8) continue;
      const yaw = Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing));
      if (Math.abs(yaw) > 1.3) continue;
      const score = d * (1 + Math.abs(yaw));
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

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
      dialogue.say('Mara', 'Someone scratched a diagram next to the hatch.', undefined, { story: true });
      this.hatch.pulseHighlight();
    } else {
      dialogue.interrupt();
      dialogue.say('Mara', 'The bypass is dumping it all into the vent. Shut the bypass, wait for the needle, then the lever.', 5, { story: true });
    }
  }

  // ---------------------------------------------------------------- per-frame

  fixedUpdate(dt: number, time: number): void {
    this.time = time;
    const { progression, player, dialogue, events } = this.ctx;
    this.engine.fixedUpdate(dt);

    // Ivo's steam kicker powers the double jump, air dash and ground pound.
    player.steam = progression.has('kicker.taken');

    // Hesitation hints.
    if (this.jumpHintAt !== null && this.time > this.jumpHintAt && player.grounded && !player.frozen) {
      this.jumpHintAt = null;
      this.ctx.hud.tip(this.ctx.input.usingGamepad ? 'Jump: A (hold for higher)' : 'Jump: Space (hold for higher)', 'jump');
    }
    if (this.ropeHintAt !== null && this.time > this.ropeHintAt) {
      this.ropeHintAt = null;
      if (this.ctx.checkpoints.current?.id === 'lookout' && player.feet.y > LOOKOUT.y - 0.5) {
        dialogue.say('Mara', "The rope gate's down. There's a scaffold just below the railing.");
      }
    }

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

    // Chalk marks within reach of Mara's chest.
    const mark = this.marks.collect(this.chest.copy(player.feet).setY(player.feet.y + 1.0));
    if (mark) this.onMarkFound(mark);
    // Standing on the boards: Mara notices them, and later says how to get through.
    if (!this.boards.broken) {
      const c = this.boards.centre;
      if (player.grounded && Math.hypot(player.feet.x - c.x, player.feet.z - c.z) < 0.9) {
        this.boardsNearT += dt;
        if (progression.set('boards.seen')) dialogue.say('Mara', 'Boards nailed over a hatch. And a chalk arrow pointing right at them.', 3.6);
        if (this.boardsNearT > 5 && progression.has('kicker.taken') && progression.set('boards.hint')) dialogue.say('Mara', "They won't pry up. Something heavier, from above...", 3.2);
      } else this.boardsNearT = 0;
    }
    this.whistleT = Math.max(0, this.whistleT - dt);

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
      // In the cell the engine is felt through the wall: a little dust drifts off the hatch wall.
      if (player.feet.z > CELL.z0 && player.feet.y > CELL.y - 1 && player.feet.y < CELL.y + 3) this.wallDust.burst = 0.5;
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
    if (!this.inWorkshop && (y < -30 || Math.abs(player.feet.x) > 60 || Math.abs(player.feet.z) > 80)) this.ctx.respawn('fall');

    // Drip: a drop every ~1.7 s taps the hatch line.
    this.dripT += dt;
    if (this.dripT > 1.7) {
      this.dripT = 0;
      events.emit('sfx', { name: 'drip', x: this.hatch.anchors.drip.x, y: this.hatch.anchors.drip.y, z: this.hatch.anchors.drip.z });
    }
  }

  /** After a fall recovery at a checkpoint. */
  onRespawn(checkpointId: string): void {
    // A restart from the pause menu during the opening: finish it as a skip would (the workshop
    // gives the cell its lights back, Mara ends up at the cell spawn with control).
    if (this.inWorkshop) this.skipCinematic();
    this.engine.onRespawn(checkpointId);
  }

  afterPlayer(): void {
    this.engine.applyMotion();
  }

  update(dt: number, time: number, alpha: number): void {
    this.ctx.hud.setSkipHint(this.cinematicActive, this.ctx.input.usingGamepad);
    this.engine.update(dt, time, alpha);
    this.hangar.update(dt);
    this.wallDust.update(dt);
    this.hatch.update(dt, time, this.logic.pressure);
    this.hall.update(dt, time, this.ctx.camera.camera.position);
    this.landingLight.update(dt, time);
    this.lookoutLight.update(dt, time);
    for (const l of this.lamps) l.update(dt, time);
    this.workshop.update(dt);
    this.marks.update(dt);
    this.boards.update(dt);
    this.whistleSteam.update(dt);
    this.whistleHandle.position.y = this.whistleHandleY - 0.16 * Math.min(1, Math.max(0, (this.whistleT - 1.2) / 0.4));
    // The cell lamp's light is the workshop's oil lamp during the opening.
    if (this.inWorkshop && this.cellLamp.light) this.cellLamp.light.intensity = 5.5 * this.workshop.lampBrightness;
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
    this.jumpHintAt = this.ropeHintAt = null;
    this.hangar.setLit(false, true);
    this.kit.visible = true;
    this.setWorkshop(false);
    this.marks.reset();
    this.boards.reset();
    this.boardsNearT = 0;
    this.whistleT = 0;
    this.whistlePulls = 0;
    this.startIntro();
  }

  applyCheckpointState(id: string): void {
    const { progression } = this.ctx;
    const inHall = !['cell', 'landing', 'lookout'].includes(id) || progression.has('reveal.done');
    this.ctx.events.emit('music', inHall ? { music: 'hall', ambience: 'waves' } : { music: 'cell', ambience: 'tomb' });
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
    { kind: 'interact', id: 'kicker', standAt: [2.3, S.floorY, 26.0], expectFlag: 'kicker.taken' },
    { kind: 'move', to: [1.05, S.floorY, 26.0], precise: true },
    { kind: 'jump', from: [1.0, S.floorY, S.girder.z + 0.75], to: [0.9, S.floorY, S.girder.z - 0.9] },
    { kind: 'move', to: [2.5, S.floorY, S.gapNear + 1.3], precise: true },
    { kind: 'jump', from: [2.5, S.floorY, S.gapNear + 0.25], to: [2.4, S.floorY, S.gapFar - 1.0] },
    { kind: 'move', to: [0.5, S.floorY, S.z0 + 0.6], precise: true },
    { kind: 'move', to: [0.0, LOOKOUT.y, 17.9], precise: true },
    { kind: 'move', to: [-0.3, LOOKOUT.y, 14.6], precise: true },
    { kind: 'interact', id: 'lookout-light', standAt: [-0.45, LOOKOUT.y, 13.5], expectFlag: 'lookout.lit' },
    { kind: 'wait', until: 'revealDone', timeout: 20 },
  ];
}

/** The warden's transfer order (Chapter One's "why am I here"), with Ivo's pencilled reply. */
function transferOrderCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 800;
  const g = c.getContext('2d')!;
  const rng = mulberry32(417);
  // Damp, yellowed paper with a torn corner and nail holes.
  g.fillStyle = '#d8ccb0';
  g.fillRect(0, 0, 600, 800);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(110, 86, 52, ${0.03 + rng() * 0.05})`;
    g.beginPath();
    g.arc(rng() * 600, rng() * 800, 10 + rng() * 60, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#2b2620';
  for (const [x, y] of [[300, 24], [300, 776]]) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  const type = (text: string, x: number, y: number, size = 24, weight = '') => {
    g.font = `${weight} ${size}px "Courier New", Courier, monospace`;
    g.fillStyle = 'rgba(28, 24, 20, 0.88)';
    g.fillText(text, x, y);
  };
  g.textAlign = 'center';
  type('BREAKWATER', 300, 80, 34, 'bold');
  type("WARDEN'S OFFICE", 300, 116, 22);
  g.fillRect(70, 136, 460, 2);
  type('TRANSFER ORDER  No. 0417', 300, 180, 24, 'bold');
  g.textAlign = 'left';
  const lines = [
    'Prisoner:   M. VENN',
    'Trade:      tide-engine mechanic,',
    '            Saltmere municipal works',
    'Received:   night tide, asleep.',
    '            No papers. No visitors.',
    '',
    'Hold in cell C-4 until she signs',
    'the diversion certificate.',
  ];
  lines.forEach((t, i) => type(t, 70, 240 + i * 36, 22));
  type('By order,', 70, 560, 22);
  // Signature.
  g.strokeStyle = 'rgba(30, 30, 60, 0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(80, 610);
  g.bezierCurveTo(130, 570, 150, 640, 190, 600);
  g.bezierCurveTo(220, 575, 240, 625, 300, 598);
  g.stroke();
  type('Warden SORN', 80, 640, 20);
  // A red HOLD stamp, slightly crooked.
  g.save();
  g.translate(450, 590);
  g.rotate(-0.22);
  g.strokeStyle = 'rgba(160, 40, 30, 0.75)';
  g.lineWidth = 5;
  g.strokeRect(-80, -34, 160, 68);
  g.font = 'bold 44px Georgia, serif';
  g.fillStyle = 'rgba(160, 40, 30, 0.75)';
  g.textAlign = 'center';
  g.fillText('HOLD', 0, 15);
  g.restore();
  // Ivo's pencilled reply, squeezed in at the bottom.
  g.save();
  g.translate(90, 720);
  g.rotate(-0.05);
  g.font = 'italic 26px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  g.fillStyle = 'rgba(55, 55, 60, 0.85)';
  g.fillText("Line's fixed. Read the wall.  - I.", 0, 0);
  g.restore();
  return c;
}

/** Ivo's chalk mark, "IV" with a little arrow, as a transparent texture. */
function chalkMarkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(232, 228, 214, 0.85)';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  // I
  g.moveTo(30, 18);
  g.lineTo(28, 70);
  // V
  g.moveTo(48, 18);
  g.lineTo(66, 72);
  g.lineTo(86, 16);
  g.stroke();
  // Underline arrow.
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(24, 84);
  g.lineTo(100, 82);
  g.lineTo(90, 75);
  g.moveTo(100, 82);
  g.lineTo(90, 90);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

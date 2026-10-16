import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { LevelContext, RouteStep } from '../Level';
import { Batcher, prismGeometry, worldBox } from '../../world/geometry';
import { paintedTextTexture } from '../../world/textures';
import { ServiceLight, WorkLamp, glowSprite } from '../../world/props/Lanterns';
import { SteamEmitter } from '../../world/Atmosphere';
import { FlowStrip } from '../../world/props/FlowStrip';
import { EngineCollar, PistonPlatform } from '../../world/props/EngineRides';
import { braceGantry, buildBarrierBeam, buildSparesRack, catchPlateTexture, dialTexture, feedPlateTexture, hazardStripeTexture } from '../../world/props/Maintenance';
import { SplitFeedLogic } from '../../gameplay/puzzles/SplitFeedLogic';
import { mulberry32 } from '../../core/math';
import { HALL, sideAngle, sideFraction, halfSide } from './layout';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const T1 = HALL.tierY[0];
const T3 = HALL.tierY[2];
/** Gantry decks sit this far below the collar deck stops. */
const GANTRY_DROP = 0.015;

/** Walkway segments the engine route replaces with its own pieces: "tier:k". */
export const ROUTE_WALKWAY_OVERRIDES = new Set(['0:2', '0:5', '0:6', '2:9']);
/** Walkways whose inner railing needs a gap for a gantry: "tier:k". */
export const ROUTE_RAIL_GAPS = new Set(['0:7', '2:7']);

/** Side-local frame helpers: u along the side (+ toward increasing k), a = apothem. */
function sidePos(k: number, a: number, u: number, y: number): THREE.Vector3 {
  const th = sideAngle(k);
  return v3(Math.sin(th) * a + Math.cos(th) * u, y, Math.cos(th) * a - Math.sin(th) * u);
}
function sideQuat(k: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sideAngle(k));
}
/** Unit vector along side k toward increasing k. */
function sideTangent(k: number): THREE.Vector3 {
  const th = sideAngle(k);
  return v3(Math.cos(th), 0, -Math.sin(th));
}
/** u coordinate of fraction f along side k at apothem a. */
const uAt = (a: number, f: number) => -halfSide(a) + 2 * halfSide(a) * f;

/** A wall or deck lever. Pulling animates; state is owned by the caller. */
class Lever {
  readonly group = new THREE.Group();
  private readonly arm = new THREE.Group();
  private angle = 0;
  private target = 0;
  constructor(ctx: LevelContext, label: string) {
    const m = ctx.materials;
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.36, 0.08, 2, 0.02), m.ironDark);
    base.position.set(0, 1.0, 0);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.52, 0.045), m.iron);
    shaft.position.y = 0.26;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), m.ceramic);
    grip.position.y = 0.56;
    this.arm.add(shaft, grip);
    this.arm.position.set(0, 1.0, 0.06);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.12),
      new THREE.MeshStandardMaterial({ map: paintedTextTexture(label, { w: 256, h: 96, color: 'rgba(30,24,20,0.95)', bg: 'rgba(217,207,182,1)', seed: 6 }), roughness: 0.8 }),
    );
    sign.position.set(0, 0.72, 0.045);
    this.group.add(base, this.arm, sign);
    this.group.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
  }
  set(down: boolean): void {
    this.target = down ? 1 : 0;
  }
  update(dt: number): void {
    this.angle += (this.target - this.angle) * (1 - Math.exp(-dt * 10));
    this.arm.rotation.x = -0.35 - this.angle * 2.0;
  }
}

/**
 * The next increment after the first slice: a parkour practice route along tier 1 of the turbine
 * hall, then The Breathing Engine. See docs/GAME_DESIGN.md for intent and recovery rules.
 */
export class EngineRoute {
  readonly collar: EngineCollar;
  readonly shuttle: PistonPlatform;
  readonly breachPiston: PistonPlatform;
  private readonly brakeLever: Lever;
  private readonly deckLever: Lever;
  private readonly feedWheel = new THREE.Group();
  private readonly catchLever: Lever;
  private readonly releaseLever: Lever;
  private readonly pawl = new THREE.Group();
  private readonly gauges: Array<{ needle: THREE.Object3D; value: number; target: () => number }> = [];
  private readonly reliefSteam: SteamEmitter;
  private readonly boardLamp: WorkLamp;
  private readonly curtain: SteamEmitter[] = [];
  private readonly curtainSheet: THREE.Mesh;
  private readonly lights: ServiceLight[] = [];
  private readonly lightById = new Map<string, ServiceLight>();
  /** The split feed at the breach: the curtain, the ram and its catch (see SplitFeedLogic). */
  readonly feed = new SplitFeedLogic();
  private feedWheelAngle = 0.6;
  private shudder = 0;
  private lastEmptyRises = 0;
  readonly releaseAnchor = new THREE.Vector3();
  private time = 0;
  readonly deckLeverAnchor = new THREE.Vector3();
  private readonly deckLeverLocal: THREE.Vector3;
  /** Railing barrier at the lookout's broken edge, removed once the route opens. */
  private gateCollider: import('@dimforge/rapier3d-compat').Collider | null = null;
  private readonly gateMesh: THREE.Group;
  routeOpen = false;
  readonly route: RouteStep[];
  /** The split-feed puzzle and exit only, from the upper gantry (reviews and movement captures). */
  readonly feedRoute: RouteStep[];

  constructor(private readonly ctx: LevelContext) {
    const { scene, physics, materials: m, player, traversal } = ctx;
    const batch = new Batcher();
    const root = new THREE.Group();
    root.name = 'engine-route';
    scene.add(root);
    const rng = mulberry32(4242);
    const solidBox = (center: THREE.Vector3, size: THREE.Vector3, q: THREE.Quaternion, mat: THREE.Material, opts: { blocksCamera?: boolean; uv?: number } = {}) => {
      batch.add(worldBox(size.x, size.y, size.z, opts.uv ?? 2), mat, new THREE.Matrix4().compose(center, q, new THREE.Vector3(1, 1, 1)));
      return physics.box(center, size.clone().multiplyScalar(0.5), q, { blocksCamera: opts.blocksCamera });
    };
    const walkwayPiece = (k: number, f0: number, f1: number, tierY: number, withRail = true) => {
      const poly: Array<[number, number]> = [sideFraction(k, HALL.aIn, f0), sideFraction(k, HALL.aWall + 0.05, f0), sideFraction(k, HALL.aWall + 0.05, f1), sideFraction(k, HALL.aIn, f1)];
      batch.add(prismGeometry(poly, tierY - HALL.floorT, tierY, 3), m.floor);
      physics.prism(poly, tierY - HALL.floorT, tierY);
      if (withRail) {
        const a = sideFraction(k, HALL.aIn + 0.12, f0);
        const b = sideFraction(k, HALL.aIn + 0.12, f1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const c = v3((a[0] + b[0]) / 2, tierY + 1.0, (a[1] + b[1]) / 2);
        batch.add(new THREE.BoxGeometry(len, 0.07, 0.07), m.iron, new THREE.Matrix4().compose(c, sideQuat(k), new THREE.Vector3(1, 1, 1)));
        physics.box(c.clone().setY(tierY + 1.2), v3(len / 2, 1.2, 0.06), sideQuat(k), { blocksCamera: false });
      }
    };

    // ------------------------------------------------------------ descent from the lookout
    // A wooden scaffold just below the lookout's broken edge: two short, safe drops to tier 1.
    {
      const k = 0;
      const top = T1 + 2.55;
      const center = sidePos(k, 11.35, 1.1, top - 0.08);
      solidBox(center, v3(1.9, 0.16, 1.7), sideQuat(k), m.wood);
      for (const [du, da] of [
        [-0.85, -0.75],
        [0.85, -0.75],
        [-0.85, 0.75],
        [0.85, 0.75],
      ]) {
        const p = sidePos(k, 11.35 + da, 1.1 + du, (top - 0.16) / 2);
        batch.add(new THREE.BoxGeometry(0.12, top - 0.16, 0.12), m.wood, new THREE.Matrix4().compose(p, sideQuat(k), new THREE.Vector3(1, 1, 1)));
      }
      const brace = sidePos(k, 10.6, 1.1, top / 2);
      batch.add(new THREE.BoxGeometry(1.9, 0.08, 0.08), m.wood, new THREE.Matrix4().compose(brace, sideQuat(k).clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.9))), new THREE.Vector3(1, 1, 1)));
    }
    // Rope barrier across the broken part of the lookout railing, dropped when the route opens.
    this.gateMesh = new THREE.Group();
    {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), m.rope);
      rope.rotation.z = Math.PI / 2;
      rope.position.set(1.38, 4.6 + 0.95, HALL.aWall - 0.12);
      const tag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.2),
        new THREE.MeshStandardMaterial({ map: paintedTextTexture('KEEP OUT', { w: 256, h: 128, color: 'rgba(30,24,20,0.95)', bg: 'rgba(214,180,90,1)', seed: 3 }), roughness: 0.8, side: THREE.DoubleSide }),
      );
      tag.position.set(1.38, 4.6 + 0.78, HALL.aWall - 0.1);
      this.gateMesh.add(rope, tag);
      root.add(this.gateMesh);
      this.gateCollider = physics.box(v3(1.4, 4.6 + 1.3, HALL.aWall - 0.12), v3(0.75, 1.3, 0.08), undefined, { blocksCamera: false });
    }

    // ------------------------------------------------------------ k = 2: first gap on tier 1 (1.9 m)
    walkwayPiece(2, 0, 0.27, T1);
    walkwayPiece(2, 0.77, 1, T1);
    for (const [f, side] of [
      [0.27, -1],
      [0.77, 1],
    ]) {
      // The walkway's end runs along a radial line (constant fraction), so the strip follows it.
      const p0 = sidePos(2, HALL.aIn + 0.15, uAt(HALL.aIn + 0.15, f), T1 + 0.006);
      const p1 = sidePos(2, HALL.aWall - 0.15, uAt(HALL.aWall - 0.15, f), T1 + 0.006);
      const d = p1.clone().sub(p0);
      const lip = new THREE.Mesh(
        new THREE.PlaneGeometry(d.length(), 0.16),
        new THREE.MeshStandardMaterial({ map: hazardStripeTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
      );
      // Inset 9 cm from the lip, on the walkway side.
      lip.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).addScaledVector(sideTangent(2), side * 0.09);
      lip.quaternion
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-d.z, d.x))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      root.add(lip);
    }

    // ------------------------------------------------------------ k = 3: low maintenance rail to vault
    {
      const k = 3;
      const u = uAt(10.7, 0.5);
      const center = sidePos(k, (HALL.aIn + HALL.aWall) / 2, u, T1 + 0.42);
      const q = sideQuat(k).clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      const railLen = HALL.aWall - HALL.aIn - 0.1;
      const c = physics.box(center, v3(railLen / 2, 0.42, 0.13), q, { blocksCamera: false });
      traversal.markVaultable(c);
      buildBarrierBeam(batch, m, new THREE.Matrix4().compose(center.clone().setY(T1), q, v3(1, 1, 1)), railLen, 0.84, 0.26, root);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.3),
        new THREE.MeshStandardMaterial({ map: paintedTextTexture('NO ACCESS', { w: 512, h: 160, color: 'rgba(30,24,20,0.95)', bg: 'rgba(214,180,90,1)', seed: 8 }), roughness: 0.8, side: THREE.DoubleSide }),
      );
      sign.position.copy(center).setY(T1 + 0.55);
      sign.quaternion.copy(q);
      sign.translateZ(0.14);
      root.add(sign);
    }

    // ------------------------------------------------------------ k = 4: spares rack + raised gantry (ledge catch)
    {
      const k = 4;
      const q = sideQuat(k);
      // A loaded spares rack blocks the hall side of the walkway; crates fill the space under the
      // gantry, so the only way past is to catch the gantry edge and climb. The rack fills its
      // collider exactly.
      const rackHalf = v3(halfSide(10) * 0.4 + 0.2, 1.6, (11.0 - HALL.aIn) / 2);
      const heap = sidePos(k, (HALL.aIn + 11.0) / 2, uAt(10, 0.5), T1 + 1.6);
      physics.box(heap, rackHalf, q);
      const rackFrame = new THREE.Matrix4().compose(heap.clone().setY(T1), q, v3(1, 1, 1));
      buildSparesRack(batch, m, rackFrame, rackHalf.clone().multiplyScalar(2), root);
      const under = sidePos(k, (11.0 + HALL.aWall) / 2, uAt(11.7, 0.5), T1 + 0.8);
      physics.box(under, v3(halfSide(11.7) * 0.4 + 0.2, 0.8, (HALL.aWall - 11.0) / 2), q);
      for (let i = 0; i < 4; i++) {
        const crate = new RoundedBoxGeometry(0.9, 0.8 + rng() * 0.6, 0.9, 1, 0.05);
        const p = sidePos(k, 11.7, uAt(11.7, 0.35 + i * 0.1), T1 + 0.5);
        batch.add(crate, m.wood, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng(), 0)), new THREE.Vector3(1, 1, 1)));
      }
      // Raised maintenance gantry along the wall: its edge is climbable (2.0 m above the walkway).
      const g0 = 0.12;
      const g1 = 0.88;
      const ua = uAt(11.7, g0);
      const ub = uAt(11.7, g1);
      const gCenter = sidePos(k, 11.7, (ua + ub) / 2, T1 + 2.0 - 0.15);
      const gc = solidBox(gCenter, v3(ub - ua, 0.3, 1.35), q, m.grate, { uv: 1.5 });
      traversal.markClimbable(gc);
      for (const u of [ua + 0.1, (ua + ub) / 2, ub - 0.1]) {
        const leg = sidePos(k, 11.15, u, T1 + 0.9);
        batch.add(new THREE.BoxGeometry(0.12, 1.8, 0.12), m.iron, new THREE.Matrix4().compose(leg, q, new THREE.Vector3(1, 1, 1)));
      }
      braceGantry(batch, m, new THREE.Matrix4().compose(sidePos(k, 11.7, (ua + ub) / 2, T1), q, v3(1, 1, 1)), ub - ua, 1.35, 2.0, 11.15 - 11.7);
      // Worn handhold paint on the catch edge.
      const edge = sidePos(k, 11.7, ua - 0.005, T1 + 1.96);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: '#d0a24a', roughness: 0.7 }));
      mark.position.copy(edge);
      mark.quaternion.copy(q);
      root.add(mark);
    }

    // ------------------------------------------------------------ k = 5..6: shuttle across a wide collapse
    walkwayPiece(5, 0, 0.3, T1);
    walkwayPiece(6, 0.7, 1, T1);
    {
      const a = 10.7;
      const start = sidePos(5, a, uAt(a, 0.3) + 1.15, T1);
      const end = sidePos(6, a, uAt(a, 0.7) - 1.15, T1);
      const travel = end.clone().sub(start);
      this.shuttle = new PistonPlatform(physics, m, start, 0, { w: 2.0, d: 2.0 }, { rest: 2.6, travel: 3.4, phase: 0 }, Math.atan2(travel.x, travel.z) + Math.PI / 2);
      this.shuttle.setTravel(travel);
      root.add(this.shuttle.group);
      for (const c of this.shuttle.colliders) player.platforms.set(c.handle, this.shuttle);
      // The horizontal piston housing it slides out of.
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 12), m.brass);
      housing.position.copy(sidePos(5, a, uAt(a, 0.3) - 0.3, T1 - 0.45));
      housing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), travel.clone().normalize());
      root.add(housing);
    }

    // ------------------------------------------------------------ k = 7: engine gantry, collar, levers
    const kE = 7;
    const thE = sideAngle(kE);
    const radial = v3(Math.sin(thE), 0, Math.cos(thE));
    const collarWidth = 1.85;
    const rCollar = HALL.columnR + collarWidth;
    {
      // Gantries sit 1.5 cm below the collar deck with a 3 cm gap: stepping off is a tiny step down.
      // (Coplanar or overlapping deck/gantry surfaces made the character controller stall.)
      const r0 = rCollar + 0.03;
      const r1 = HALL.aIn + 0.25;
      for (const y of [T1 - GANTRY_DROP, T3 - GANTRY_DROP]) {
        const center = radial.clone().multiplyScalar((r0 + r1) / 2).setY(y - 0.12);
        solidBox(center, v3(2.0, 0.24, r1 - r0), sideQuat(kE), m.grate, { uv: 1.5 });
        for (const s of [-1, 1]) {
          const side = sideTangent(kE).multiplyScalar(s * 0.95);
          const rail = center.clone().add(side).setY(y + 1.0);
          batch.add(new THREE.BoxGeometry(0.06, 0.06, r1 - r0), m.iron, new THREE.Matrix4().compose(rail, sideQuat(kE), new THREE.Vector3(1, 1, 1)));
          physics.box(rail.clone().setY(y + 1.2), v3(0.05, 1.2, (r1 - r0) / 2), sideQuat(kE), { blocksCamera: false });
        }
      }
    }
    this.collar = new EngineCollar(physics, m, HALL.columnR, collarWidth, thE, T1, T3, { centre: T1, amplitude: 2.6, period: 8.4 });
    scene.add(this.collar.group);
    for (const c of this.collar.colliders) player.platforms.set(c.handle, this.collar);
    // Don't close the boarding gap on someone standing in it.
    this.collar.canCloseGap = () => {
      const f = player.feet;
      const r = Math.hypot(f.x, f.z);
      const along = Math.abs(Math.atan2(f.x, f.z) - thE);
      return !(r > rCollar - 0.5 && r < rCollar + 0.6 && along < 0.55 && Math.abs(f.y - this.collar.deckY) < 2);
    };
    this.brakeLever = new Lever(ctx, 'BRAKE');
    this.brakeLever.group.position.copy(radial.clone().multiplyScalar(rCollar + 1.2)).add(sideTangent(kE).multiplyScalar(-0.98)).setY(T1);
    this.brakeLever.group.rotation.y = thE + Math.PI / 2;
    root.add(this.brakeLever.group);
    this.deckLever = new Lever(ctx, 'RIDE');
    this.deckLeverLocal = radial.clone().multiplyScalar(HALL.columnR + 0.12).add(sideTangent(kE).multiplyScalar(0.7));
    this.deckLever.group.position.copy(this.deckLeverLocal);
    this.deckLever.group.rotation.y = thE;
    this.collar.group.add(this.deckLever.group);

    // ------------------------------------------------------------ k = 8 (tier 3): steam curtain + redirect valve
    {
      const k = 8;
      const fCurtain = 0.55;
      for (let i = 0; i < 8; i++) {
        const a = HALL.aWall - 0.1;
        const p = sidePos(k, a, uAt(a, fCurtain) + ((i % 2) - 0.5) * 0.3, T3 + 0.25 + (i >> 1) * 0.6);
        const dir = v3(-Math.sin(sideAngle(k)), 0.12, -Math.cos(sideAngle(k)));
        // Cooler grey and thinner puffs: the curtain reads as a hazard without hiding the walkway.
        const e = new SteamEmitter(p, dir.multiplyScalar(4.5), 16, new THREE.Color('#a9b9be'));
        e.peakOpacity = 0.11;
        this.curtain.push(e);
        root.add(e.group);
      }
      const sheetGeo = new THREE.PlaneGeometry(HALL.aWall - HALL.aIn, 2.6);
      this.curtainSheet = new THREE.Mesh(
        sheetGeo,
        new THREE.MeshBasicMaterial({ color: '#b4c3c7', map: glowSprite(), transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.curtainSheet.position.copy(sidePos(k, (HALL.aIn + HALL.aWall) / 2, uAt(10.7, fCurtain), T3 + 1.3));
      this.curtainSheet.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      root.add(this.curtainSheet);
      // Cracked main along the wall that feeds the curtain.
      const main = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2 * halfSide(HALL.aWall), 12), m.brass);
      main.position.copy(sidePos(k, HALL.aWall - 0.25, 0, T3 + 2.7));
      main.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      root.add(main);
      // The junction before the curtain, in the cell's language (plates, pointer bar, gauges):
      // a RAM CATCH lever, two gauges, and the FEED diverter between VENT and RAM.
      const inward = sideAngle(k) + Math.PI;
      const faceQ = sideQuat(k).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      // Everything is mounted on a free-standing control board in front of the cell facade.
      const ja = HALL.aWall - 0.3;
      const boardU0 = uAt(ja, 0.02);
      const boardU1 = uAt(ja, 0.36);
      const boardCenter = sidePos(k, ja + 0.03, (boardU0 + boardU1) / 2, T3 + 1.3);
      batch.add(worldBox(boardU1 - boardU0, 2.1, 0.05, 2), m.ironDark, new THREE.Matrix4().compose(boardCenter, sideQuat(k), v3(1, 1, 1)));
      for (const u of [boardU0 + 0.06, boardU1 - 0.06]) {
        batch.add(new THREE.BoxGeometry(0.08, 2.4, 0.08), m.iron, new THREE.Matrix4().compose(sidePos(k, ja + 0.09, u, T3 + 1.2), sideQuat(k), v3(1, 1, 1)));
      }
      // A caged work lamp over the board so the plates and gauges read from the walkway.
      const boardLamp = new WorkLamp(m, sidePos(k, ja - 0.08, uAt(ja, 0.19), T3 + 2.45), v3(-Math.sin(sideAngle(k)), 0, -Math.cos(sideAngle(k))), { light: true, intensity: 3.2, distance: 4.5, pool: false, scale: 0.8 });
      root.add(boardLamp.group);
      this.boardLamp = boardLamp;
      // The feed main drops into the board from the line above.
      batch.add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10), m.brass, new THREE.Matrix4().compose(sidePos(k, ja + 0.12, uAt(ja, 0.25), T3 + 2.55), sideQuat(k), v3(1, 1, 1)));
      const wallPlate = (tex: THREE.Texture, f: number, y: number, w = 0.56, h = 0.28) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
        mesh.position.copy(sidePos(k, ja - 0.005, uAt(ja, f), y));
        mesh.quaternion.copy(faceQ);
        root.add(mesh);
      };
      const vp = sidePos(k, ja - 0.03, uAt(ja, 0.25), T3 + 1.15);
      wallPlate(feedPlateTexture(), 0.25, T3 + 1.6);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 24), m.ironDark);
      const bar = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.3, 0.04, 1, 0.015), m.ceramic);
      bar.position.z = 0.03;
      this.feedWheel.add(rim, bar);
      this.feedWheel.position.copy(vp);
      this.feedWheel.quaternion.copy(faceQ);
      root.add(this.feedWheel);
      this.steamValvePos = vp;
      this.catchLever = new Lever(ctx, 'CATCH');
      this.catchLever.group.position.copy(sidePos(k, ja - 0.05, uAt(ja, 0.09), T3));
      this.catchLever.group.rotation.y = inward;
      root.add(this.catchLever.group);
      wallPlate(catchPlateTexture(), 0.09, T3 + 1.62);
      this.catchPos = sidePos(k, ja - 0.05, uAt(ja, 0.09), T3 + 1.1);
      // Gauges: where the pressure is going.
      const gauge = (label: string, f: number, target: () => number) => {
        const g = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), new THREE.MeshStandardMaterial({ map: dialTexture(label), roughness: 0.5 }));
        const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 28), m.brass);
        const needle = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.006), new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 0.5 }));
        stick.position.y = 0.045;
        needle.add(stick);
        needle.position.z = 0.006;
        g.add(face, bezel, needle);
        g.position.copy(sidePos(k, ja - 0.01, uAt(ja, f), T3 + 2.08));
        g.quaternion.copy(faceQ);
        root.add(g);
        this.gauges.push({ needle, value: target(), target });
      };
      gauge('VENT', 0.19, () => (this.feed.route === 'vent' ? 0.72 : 0.06));
      gauge('RAM', 0.31, () => (this.feed.route === 'ram' ? (this.feed.straining ? 0.95 : 0.66) : 0.06));
      // Where the steam goes, readable along the pipework: chevrons light up and run toward the
      // cracked line (VENT) or along a feed pipe to the ram (RAM), whichever the diverter selects.
      // In a ring hall "toward the walkway" is toward the centre.
      const towardCentre = (_d: THREE.Vector3, mid: THREE.Vector3) => v3(-mid.x, 0, -mid.z).normalize();
      const mainFront = HALL.aWall - 0.47;
      this.ventStrip = new FlowStrip(
        [0.27, 0.53].map((f) => sidePos(k, mainFront, uAt(mainFront, f), T3 + 2.7)),
        towardCentre,
      );
      // The ram feed: from the board along the wall, round the corner to side 9, down to the ram.
      const pa = HALL.aWall - 0.2;
      const pipeY = T3 + 2.25;
      const ramFeed = [
        sidePos(k, ja + 0.1, uAt(ja, 0.31), T3 + 1.95),
        sidePos(k, pa, uAt(pa, 0.31), pipeY),
        sidePos(k, pa, uAt(pa, 1), pipeY),
        sidePos(9, pa, uAt(pa, 0.86), pipeY),
        sidePos(9, pa, uAt(pa, 0.86), T3 + 0.35),
        sidePos(9, 11.68, uAt(11.68, 0.86), T3 + 0.35),
      ];
      for (let i = 0; i < ramFeed.length - 1; i++) {
        const d = ramFeed[i + 1].clone().sub(ramFeed[i]);
        batch.add(
          new THREE.CylinderGeometry(0.075, 0.075, d.length() + 0.1, 10),
          m.brass,
          new THREE.Matrix4().compose(ramFeed[i].clone().add(ramFeed[i + 1]).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, 1, 1)),
        );
      }
      // On the pipe's walkway-facing side (the last, inward run is short and hidden by the ram).
      const stripPath = ramFeed.slice(1, 5).map((p) => p.clone().add(v3(-p.x, 0, -p.z).normalize().multiplyScalar(0.085)));
      this.ramStrip = new FlowStrip(stripPath, towardCentre, { width: 0.09 });
      root.add(this.ventStrip.group, this.ramStrip.group);
      // Hazard band on the deck where the steam starts to push.
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(HALL.aWall - HALL.aIn - 0.2, 0.22),
        new THREE.MeshStandardMaterial({ map: hazardStripeTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 }),
      );
      band.position.copy(sidePos(k, (HALL.aIn + HALL.aWall) / 2, uAt(10.7, fCurtain) - 0.55, T3 + 0.01));
      band.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)));
      root.add(band);
      // Linkage rod from the catch lever along the wall to the ram's rack post on side 9.
      const rodY = T3 + 0.32;
      const ra = HALL.aWall - 0.07;
      const rod = (p0: THREE.Vector3, p1: THREE.Vector3) => {
        const d = p1.clone().sub(p0);
        batch.add(
          new THREE.CylinderGeometry(0.016, 0.016, d.length(), 6),
          m.iron,
          new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, 1, 1)),
        );
      };
      const rodStart = sidePos(k, ra, uAt(ra, 0.09), rodY);
      const corner = sidePos(k, ra, uAt(ra, 1), rodY);
      const rackFoot = sidePos(9, ra, uAt(ra, 0.86), rodY);
      rod(sidePos(k, ja + 0.06, uAt(ja, 0.09), T3 + 0.95), sidePos(k, ja + 0.06, uAt(ja, 0.09), rodY));
      rod(sidePos(k, ja + 0.06, uAt(ja, 0.09), rodY), rodStart);
      rod(rodStart, corner);
      rod(corner, rackFoot);
      const brackets: Array<[number, number]> = [
        [8, 0.4],
        [8, 0.75],
        [9, 0.3],
        [9, 0.6],
      ];
      for (const [kk, f] of brackets)
        batch.add(new THREE.BoxGeometry(0.05, 0.06, 0.09), m.ironDark, new THREE.Matrix4().compose(sidePos(kk, HALL.aWall - 0.045, uAt(HALL.aWall, f), rodY), sideQuat(kk), v3(1, 1, 1)));
    }

    // ------------------------------------------------------------ k = 9 (tier 3): breach piston + exit gantry
    walkwayPiece(9, 0, 0.74, T3);
    {
      const k = 9;
      const a = 10.7;
      const base = sidePos(k, a, uAt(a, 0.86), T3);
      this.breachPiston = new PistonPlatform(physics, m, base, 2.4, { w: 1.8, d: 1.8 }, { rest: 2.8, travel: 2.4, phase: 0 }, sideAngle(k));
      this.breachPiston.heightOverride = 0;
      root.add(this.breachPiston.group);
      // Toothed rack post beside the ram, worked by the catch rod; the pawl rides on the deck.
      const rackA = 11.95;
      const post = sidePos(k, rackA, uAt(rackA, 0.86), T3 + 1.45);
      batch.add(new THREE.BoxGeometry(0.12, 2.9, 0.1), m.ironDark, new THREE.Matrix4().compose(post, sideQuat(k), v3(1, 1, 1)));
      for (let i = 0; i < 26; i++) {
        const tooth = sidePos(k, rackA - 0.06, uAt(rackA, 0.86), T3 + 0.15 + i * 0.1);
        batch.add(new THREE.BoxGeometry(0.1, 0.035, 0.04), m.iron, new THREE.Matrix4().compose(tooth, sideQuat(k), v3(1, 1, 1)));
      }
      batch.add(
        new THREE.CylinderGeometry(0.016, 0.016, HALL.aWall - 0.07 - rackA, 6),
        m.iron,
        new THREE.Matrix4().compose(sidePos(k, (HALL.aWall - 0.07 + rackA) / 2, uAt(rackA, 0.86), T3 + 0.32), sideQuat(k).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2)), v3(1, 1, 1)),
      );
      const pawlArm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.36), m.brass);
      pawlArm.position.z = 0.18;
      pawlArm.castShadow = true;
      this.pawl.add(pawlArm);
      this.pawl.position.set(0, -0.14, 0.9);
      this.breachPiston.group.add(this.pawl);
      this.releaseLever = new Lever(ctx, 'RELEASE');
      this.releaseLever.group.position.set(-0.6, 0, 0.72);
      this.releaseLever.group.rotation.y = Math.PI;
      this.breachPiston.group.add(this.releaseLever.group);
      this.reliefSteam = new SteamEmitter(base.clone().add(v3(0, 0.1, 0)), v3(0, 1.4, 0), 0, new THREE.Color('#aebcc0'));
      this.reliefSteam.peakOpacity = 0.14;
      root.add(this.reliefSteam.group);
      for (const c of this.breachPiston.colliders) player.platforms.set(c.handle, this.breachPiston);
      // Exit gantry bolted to the broken wall, jutting out through the breach over the sea.
      const k2 = 10;
      const eTop = T3 + 2.4;
      // Placed from the piston: a clean 1.9 m horizontal gap along side 10, at the piston's top
      // height, pushed outward so the far end juts through the breach over the sea.
      const t10 = sideTangent(k2);
      const n10 = v3(Math.sin(sideAngle(k2)), 0, Math.cos(sideAngle(k2)));
      const ex = base.clone().addScaledVector(t10, 4.0).addScaledVector(n10, 1.5).setY(eTop - 0.12);
      this.exitLanding.copy(base).addScaledVector(t10, 3.5).setY(eTop);
      this.exitTakeoff.copy(base).addScaledVector(t10, 0.6).setY(eTop);
      const exitQ = sideQuat(k2);
      solidBox(ex, v3(2.4, 0.24, 4.0), exitQ, m.wood, { uv: 1.5 });
      // Only the far long side is railed: the near side is where Mara lands from the piston.
      for (const s of [1]) {
        const rail = ex.clone().add(sideTangent(k2).multiplyScalar(s * 1.15)).setY(eTop + 1.0);
        batch.add(new THREE.BoxGeometry(0.06, 0.06, 4.0), m.iron, new THREE.Matrix4().compose(rail, exitQ, new THREE.Vector3(1, 1, 1)));
        physics.box(rail.clone().setY(eTop + 1.2), v3(0.05, 1.2, 2.0), exitQ, { blocksCamera: false });
      }
      const outer = ex.clone().add(v3(Math.sin(sideAngle(k2)), 0, Math.cos(sideAngle(k2))).multiplyScalar(1.95)).setY(eTop + 1.0);
      batch.add(new THREE.BoxGeometry(2.4, 0.06, 0.06), m.iron, new THREE.Matrix4().compose(outer, exitQ, new THREE.Vector3(1, 1, 1)));
      physics.box(outer.clone().setY(eTop + 1.2), v3(1.2, 1.2, 0.05), exitQ, { blocksCamera: false });
      this.exitCenter = ex.clone().setY(eTop);
    }

    batch.build(root);

    // ------------------------------------------------------------ service lights (checkpoints)
    const addLight = (id: string, k: number, a: number, f: number, y: number) => {
      const feet = sidePos(k, a, uAt(a, f), y);
      const light = new ServiceLight(m, feet, sideAngle(k) + Math.PI / 2);
      root.add(light.group);
      this.lights.push(light);
      this.lightById.set(id, light);
      return feet;
    };
    const cps: Array<{ id: string; order: number; label: string; k: number; f: number; y: number; light: [number, number] }> = [
      { id: 'route', order: 3, label: 'Tier one', k: 1, f: 0.35, y: T1, light: [12.0, 0.15] },
      { id: 'shuttle', order: 4, label: 'Collapse', k: 5, f: 0.12, y: T1, light: [12.0, 0.05] },
      { id: 'engine', order: 5, label: 'Engine gantry', k: 7, f: 0.3, y: T1, light: [12.0, 0.15] },
      { id: 'engine-top', order: 6, label: 'Upper gantry', k: 7, f: 0.3, y: T3, light: [12.0, 0.15] },
      { id: 'breach', order: 7, label: 'Breach', k: 9, f: 0.35, y: T3, light: [12.0, 0.2] },
    ];
    for (const c of cps) {
      addLight(c.id, c.k, c.light[0], c.light[1], c.y);
      const feet = sidePos(c.k, 10.6, uAt(10.6, c.f), c.y);
      // Face along the route, except at the engine gantry: face the collar.
      const facing = c.id === 'engine' ? sideAngle(c.k) + Math.PI : Math.atan2(sideTangent(c.k).x, sideTangent(c.k).z);
      ctx.checkpoints.register({ id: c.id, order: c.order, label: c.label, feet, facing, impliesFlags: ['kicker.taken'], recoverBelowY: c.y - 3 });
      ctx.triggers.add({
        id: `cp-${c.id}`,
        contains: (p) => p.distanceTo(feet) < 1.8 && Math.abs(p.y - c.y) < 1.2,
        onEnter: () => {
          if (ctx.checkpoints.reach(c.id)) {
            this.lightById.get(c.id)?.ignite();
            ctx.events.emit('sfx', { name: 'ignite', x: feet.x, y: feet.y + 1.5, z: feet.z });
          }
        },
      });
    }
    ctx.checkpoints.register({ id: 'exit', order: 8, label: 'Exit gantry', feet: this.exitCenter.clone(), facing: sideAngle(10), impliesFlags: ['kicker.taken'], recoverBelowY: this.exitCenter.y - 3 });

    this.registerInteractions();
    this.registerTriggers();
    ctx.camera.zones.push({ id: 'hall', contains: (p) => Math.hypot(p.x, p.z) < HALL.aWall + 0.2 && p.y < 14, distance: 5.6, height: 1.7, fov: 60, priority: 1 });
    // Tier three sits 4.6 m under the roof ring: a shorter arm keeps its dark underside out of the frame.
    ctx.camera.zones.push({ id: 'tier3', contains: (p) => Math.hypot(p.x, p.z) < HALL.aWall + 0.2 && p.y > T3 - 0.6 && p.y < 14, distance: 4.4, height: 1.6, fov: 62, priority: 2 });
    // On top of the raised gantry (side 4) there is about 2 m of headroom under tier two: a low
    // pivot and a short arm let the camera sit back over the open edge instead of in the ceiling.
    const th4 = sideAngle(4);
    ctx.camera.zones.push({
      id: 'gantry',
      contains: (p) => {
        const r = Math.hypot(p.x, p.z);
        const da = Math.atan2(Math.sin(Math.atan2(p.x, p.z) - th4), Math.cos(Math.atan2(p.x, p.z) - th4));
        return p.y > T1 + 1.4 && p.y < T1 + 3.6 && r > 10.4 && r < HALL.aWall + 0.2 && Math.abs(da) < Math.PI / HALL.sides;
      },
      distance: 3.0,
      height: 1.15,
      fov: 62,
      priority: 3,
    });
    // The camera assist never turns the camera near a jump, vault, ledge or moving platform.
    const near = (c: THREE.Vector3, r: number) => (p: THREE.Vector3) => Math.hypot(p.x - c.x, p.z - c.z) < r && Math.abs(p.y - c.y) < 3;
    const at = (k: number, a: number, f: number, y: number) => sidePos(k, a, uAt(a, f), y);
    ctx.camera.precision.push(
      near(at(2, 10.6, 0.58, T1), 3.2),
      near(at(3, 10.6, 0.5, T1), 2.8),
      near(at(4, 11.5, 0.12, T1), 3.0),
      near(this.shuttle.base.clone().setY(T1), 3.4),
      near(this.exitTakeoff, 3.6),
    );
    this.route = buildEngineRoute(this);
    const from = this.route.findIndex((st) => st.kind === 'interact' && st.id === 'ram-catch');
    this.feedRoute = [{ kind: 'move', to: this.debugPoint(8, 10.6, 0.05, T3) as [number, number, number], precise: true }, ...this.route.slice(from)];
  }

  private steamValvePos = new THREE.Vector3();
  private catchPos = new THREE.Vector3();

  /** The steam curtain is on while the feed vents. */
  get steamOn(): boolean {
    return this.feed.curtainOn;
  }

  /** After a fall past the curtain, the solved ram is waiting again (a missed jump never costs the puzzle). */
  onRespawn(checkpointId: string): void {
    if ((checkpointId === 'breach' || checkpointId === 'exit') && this.ctx.progression.has('ram.released') && !this.feed.primed) {
      this.feed.reset();
      this.feed.toggleCatch();
      this.feed.toggleRoute();
      this.catchLever.set(true);
    }
  }
  exitCenter = new THREE.Vector3();
  readonly exitLanding = new THREE.Vector3();
  readonly exitTakeoff = new THREE.Vector3();
  private ventStrip!: FlowStrip;
  private ramStrip!: FlowStrip;

  private registerInteractions(): void {
    const { interactions, dialogue, progression, events, player } = this.ctx;
    const brakePos = new THREE.Vector3();
    interactions.add({
      id: 'brake',
      get position() {
        return brakePos;
      },
      radius: 2.2,
      prompt: () => {
        const mode = this.collar.mode;
        if (mode === 'cycling') return 'Engage collar brake';
        if (mode === 'top') return 'Call the collar down';
        return null;
      },
      interact: () => {
        player.lockFor(0.5, brakePos);
        this.brakeLever.set(true);
        events.emit('sfx', { name: 'lever', x: brakePos.x, y: brakePos.y, z: brakePos.z });
        if (this.collar.mode === 'cycling') {
          this.collar.brake();
          dialogue.sayOnce('brake', 'Mara', 'Easy... Hold it there.');
        } else if (this.collar.mode === 'top') {
          this.collar.callDown();
        }
        progression.set('collar.braked');
      },
    });
    this.brakeLever.group.updateMatrixWorld(true);
    this.brakeLever.group.getWorldPosition(brakePos).add(v3(0, 1.2, 0));

    interactions.add({
      id: 'deck-lever',
      position: this.deckLeverAnchor,
      radius: 2.0,
      prompt: () => (this.collar.mode === 'held' ? 'Ride the collar up' : this.collar.mode === 'top' ? 'Ride the collar down' : null),
      interact: () => {
        player.lockFor(0.5, this.deckLeverAnchor);
        this.deckLever.set(true);
        events.emit('sfx', { name: 'lever', x: this.deckLeverAnchor.x, y: this.deckLeverAnchor.y, z: this.deckLeverAnchor.z });
        if (this.collar.mode === 'held') {
          this.collar.release();
          events.emit('sfx', { name: 'piston', x: this.deckLeverAnchor.x, y: this.deckLeverAnchor.y, z: this.deckLeverAnchor.z });
          dialogue.sayOnce('ride', 'Mara', "Up we go. Don't stop now.");
        } else if (this.collar.mode === 'top') {
          this.collar.callDown();
        }
        progression.set('collar.ridden');
      },
    });

    // The split feed (see SplitFeedLogic): a diverter, a catch, and a release on the ram deck.
    interactions.add({
      id: 'feed-diverter',
      position: this.steamValvePos,
      radius: 2.0,
      prompt: () => (this.feed.route === 'vent' ? 'Turn the feed to the ram' : 'Turn the feed to the vent'),
      interact: () => {
        player.lockFor(0.7, this.steamValvePos);
        const route = this.feed.toggleRoute();
        const at = this.steamValvePos;
        events.emit('sfx', { name: route === 'ram' ? 'valveClose' : 'valveOpen', x: at.x, y: at.y, z: at.z });
        progression.set(route === 'ram' ? 'feed.ram' : 'feed.vent');
        if (route === 'ram') {
          progression.set('steam.redirected');
          if (this.feed.caught && this.feed.ram === 0) {
            progression.set('ram.primed');
            dialogue.sayOnce('ram-primed', 'Mara', "The catch is holding it down. It'll go the moment I let it.", undefined, { story: true, maxWait: 6 });
            progression.setObjective('Stand on the ram and release the catch');
          } else {
            dialogue.sayOnce('feed-ram', 'Mara', "Steam's off the walkway. The feed is going to that ram now.", undefined, { story: true, maxWait: 6 });
            progression.setObjective('Get the ram to carry you up to the breach gantry');
          }
        } else {
          dialogue.sayOnce('feed-vent', 'Mara', 'Back to the vent. The ram comes down, the steam comes back.', undefined, { story: true, maxWait: 6 });
        }
      },
    });

    interactions.add({
      id: 'ram-catch',
      position: this.catchPos,
      radius: 2.0,
      prompt: () => (this.feed.caught ? 'Free the ram catch' : 'Set the ram catch'),
      interact: () => {
        player.lockFor(0.5, this.catchPos);
        const caught = this.feed.toggleCatch();
        this.catchLever.set(caught);
        events.emit('sfx', { name: 'lever', x: this.catchPos.x, y: this.catchPos.y, z: this.catchPos.z });
        if (caught) {
          progression.set('ram.caught');
          if (this.feed.ram === 0) dialogue.sayOnce('catch-down', 'Mara', 'Catch is on. That holds the ram right where it stands.', undefined, { story: true, maxWait: 6 });
          else dialogue.sayOnce('catch-up', 'Mara', "Caught it... up there. Where I can't reach it.", undefined, { story: true, maxWait: 6 });
          if (this.feed.primed) progression.set('ram.primed');
        }
      },
    });

    interactions.add({
      id: 'ram-release',
      position: this.releaseAnchor,
      radius: 1.6,
      prompt: () => (this.feed.caught && this.onRamDeck() ? 'Release the catch' : null),
      interact: () => {
        player.lockFor(0.4, this.releaseAnchor);
        this.releaseLever.set(true);
        if (this.feed.release()) {
          this.catchLever.set(false);
          events.emit('sfx', { name: 'lever', x: this.releaseAnchor.x, y: this.releaseAnchor.y, z: this.releaseAnchor.z });
          progression.set('ram.released');
          if (this.feed.route === 'ram') {
            events.emit('sfx', { name: 'piston', x: this.releaseAnchor.x, y: this.releaseAnchor.y, z: this.releaseAnchor.z });
            dialogue.sayOnce('ram-ride', 'Mara', 'Hold tight...');
            progression.setObjective('Jump to the gantry in the breach');
          }
        }
      },
    });
  }

  /** Is Mara standing on the breach ram's deck? */
  onRamDeck(): boolean {
    const g = this.breachPiston.group.position;
    const f = this.ctx.player.feet;
    const th = sideAngle(9);
    const dx = f.x - g.x;
    const dz = f.z - g.z;
    const lx = dx * Math.cos(th) - dz * Math.sin(th);
    const lz = dx * Math.sin(th) + dz * Math.cos(th);
    return Math.abs(lx) < 0.95 && Math.abs(lz) < 0.95 && Math.abs(f.y - g.y) < 0.4;
  }

  /** The split-feed puzzle is in play: Mara is up top and has not reached the exit yet. */
  get feedPuzzleActive(): boolean {
    return this.ctx.progression.has('engine.top') && !this.ctx.progression.has('exit.reached');
  }

  /** Graduated, optional hints for the split feed (requested from the pause menu). */
  hint(tier: 'reminder' | 'evidence' | 'explicit'): void {
    const { dialogue, hud, progression } = this.ctx;
    dialogue.interrupt();
    if (tier === 'reminder') {
      hud.tip(`Objective: ${progression.objective || 'Find a way past the steam'}.`);
      hud.pulseObjective();
      dialogue.say('Mara', 'The feed goes one way or the other: into the cracked line, or up to that ram.');
    } else if (tier === 'evidence') {
      dialogue.say('Mara', 'That catch holds the ram wherever it stands, even with the feed on it. And it lets go from the deck.');
    } else {
      dialogue.say('Mara', 'Feed to the vent so the ram comes down. Set the catch. Feed to the ram, walk over, and release it from the deck.', 6);
    }
  }

  private registerTriggers(): void {
    const { triggers, progression, dialogue, events, player } = this.ctx;
    // Steam curtain: a soft push back, never damage. Only while the bypass vents.
    const k = 8;
    const centre = sidePos(k, (HALL.aIn + HALL.aWall) / 2, uAt(10.7, 0.55), T3);
    const back = sideTangent(k).negate();
    triggers.add({
      id: 'steam-curtain',
      once: false,
      enabled: () => this.steamOn,
      contains: (p) => Math.abs(p.y - T3) < 2 && Math.hypot(p.x - centre.x, p.z - centre.z) < 1.9 && (p.x - centre.x) * -back.x + (p.z - centre.z) * -back.z > -0.4,
      onEnter: () => {
        player.knockback(back.clone().multiplyScalar(7).setY(3.5), 0.35);
        events.emit('sfx', { name: 'hiss', x: centre.x, y: centre.y + 1, z: centre.z });
        dialogue.sayOnce('steam', 'Mara', 'Too hot to push through. Something up here is feeding that line.', undefined, { story: true, maxWait: 6 });
      },
    });
    triggers.add({
      id: 'engine-arrive',
      contains: (p) => p.distanceTo(sidePos(7, 10.6, uAt(10.6, 0.3), T1)) < 2.4 && p.y < 2,
      onEnter: () => {
        progression.set('engine.reached');
        dialogue.say('Mara', "The collar breathes with the tide. If I can catch it at the gantry...");
        progression.setObjective('Stop the collar at the gantry and ride it up');
      },
    });
    triggers.add({
      id: 'top-arrive',
      contains: (p) => p.y > T3 - 0.5 && p.y < T3 + 1.5 && Math.hypot(p.x, p.z) > HALL.aIn - 0.5 && Math.abs(Math.atan2(p.x, p.z) - sideAngle(7)) < 0.4,
      onEnter: () => {
        progression.set('engine.top');
        progression.setObjective('Find a way past the steam');
      },
    });
    triggers.add({
      id: 'exit-arrive',
      contains: (p) => p.distanceTo(this.exitCenter) < 2.3 && p.y > this.exitCenter.y - 0.4,
      onEnter: () => {
        progression.set('exit.reached');
        this.ctx.checkpoints.reach('exit');
        this.onExit?.();
      },
    });
  }

  /** Test helper: a point before the steam curtain and a point just past it (tier 3, side 8). */
  curtainProbe(): { from: number[]; past: number[] } {
    const from = sidePos(8, 10.6, uAt(10.6, 0.3), T3);
    const past = sidePos(8, 10.6, uAt(10.6, 0.75), T3);
    return { from: from.toArray(), past: past.toArray() };
  }

  /** Dev/review helper: stand the player at a framed viewpoint of one route feature. */
  debugFrame(which: 'vault' | 'ledge' | 'steam' | 'junction' | 'ram'): void {
    const spots = {
      vault: { k: 3, a: 10.6, f: 0.2, y: T1 },
      ledge: { k: 3, a: 11.2, f: 0.85, y: T1 },
      steam: { k: 8, a: 10.6, f: 0.2, y: T3 },
      junction: { k: 8, a: 10.9, f: 0.2, y: T3, wall: true },
      ram: { k: 9, a: 10.0, f: 0.45, y: T3 },
    } as Record<string, { k: number; a: number; f: number; y: number; wall?: boolean }>;
    const s = spots[which];
    const feet = sidePos(s.k, s.a, uAt(s.a, s.f), s.y);
    const t = sideTangent(s.k);
    // Face along the route, or toward the wall for the junction.
    const facing = s.wall ? sideAngle(s.k) : Math.atan2(t.x, t.z);
    this.ctx.player.teleport(feet, facing);
    this.ctx.camera.snapBehind(feet, facing, 0.35);
  }

  /** Test helper: a world point on side k (apothem a, fraction f along the side, height y). */
  debugPoint(k: number, a: number, f: number, y: number): number[] {
    return sidePos(k, a, uAt(a, f), y).toArray();
  }

  /** Test helper: unit tangent of side k (toward increasing fraction). */
  debugTangent(k: number): number[] {
    return sideTangent(k).toArray();
  }

  /** Set by the level: the increment's ending beat. */
  onExit: (() => void) | null = null;

  /** Open the route down from the lookout (after the reveal). */
  openRoute(): void {
    if (this.routeOpen) return;
    this.routeOpen = true;
    if (this.gateCollider) {
      this.ctx.physics.remove(this.gateCollider);
      this.gateCollider = null;
    }
    this.gateMesh.visible = false;
  }

  /** Restore the initial state ("Restart section"). Recreates the lookout barrier. */
  reset(): void {
    this.feed.reset();
    this.lastEmptyRises = 0;
    this.catchLever.set(false);
    this.collar.setMode('cycling', 0);
    for (const l of this.lights) l.extinguish();
    if (this.routeOpen) {
      this.routeOpen = false;
      this.gateMesh.visible = true;
      this.gateCollider = this.ctx.physics.box(v3(1.4, 4.6 + 1.3, HALL.aWall - 0.12), v3(0.75, 1.3, 0.08), undefined, { blocksCamera: false });
    }
  }

  /** Make the world consistent with having reached checkpoint `id` (dev teleports). */
  applyCheckpointState(id: string): void {
    const order = ['route', 'shuttle', 'engine', 'engine-top', 'breach', 'exit'];
    const i = order.indexOf(id);
    if (i < 0) return;
    this.openRoute();
    for (let j = 0; j <= i; j++) this.lightById.get(order[j])?.ignite(true);
    if (i >= 3 && this.collar.mode !== 'top') this.collar.setMode('top');
    // Past the curtain: the ram waits primed at the bottom (or, at the exit, has carried her up).
    if (i >= 4) {
      this.feed.reset();
      this.feed.toggleCatch();
      this.feed.toggleRoute();
      if (id === 'exit') {
        this.feed.release();
        this.feed.ram = 1;
      }
      this.catchLever.set(this.feed.caught);
    }
  }

  get conditions(): Record<string, () => boolean> {
    return {
      collarHeld: () => this.collar.mode === 'held',
      collarTop: () => this.collar.mode === 'top',
      steamOff: () => !this.feed.curtainOn,
      ramPrimed: () => this.feed.primed,
      shuttleAtStart: () => this.shuttle.height === 0,
      shuttleAtEnd: () => this.shuttle.height === 1,
      pistonDown: () => this.feed.ram === 0,
      pistonUp: () => this.breachPiston.height === 1,
    };
  }

  /** Before the player moves: advance platform motion and publish each step's delta. */
  fixedUpdate(dt: number): void {
    this.time += dt;
    this.shuttle.fixedUpdate(dt);
    this.collar.fixedUpdate(dt);
    this.feed.step(dt, this.onRamDeck());
    this.breachPiston.heightOverride = this.feed.height;
    this.breachPiston.fixedUpdate(dt);
    if (this.feed.emptyRises > this.lastEmptyRises) {
      this.lastEmptyRises = this.feed.emptyRises;
      this.ctx.dialogue.sayOnce('ram-empty', 'Mara', '...and up it goes. Without me.', undefined, { story: true, maxWait: 6 });
    }
  }

  /** After the player moves: put platform colliders at this step's pose. */
  applyMotion(): void {
    this.shuttle.applyMotion();
    this.collar.applyMotion();
    this.breachPiston.applyMotion();
  }

  update(dt: number, time: number, alpha: number): void {
    this.shuttle.render(alpha);
    this.collar.render(alpha, time);
    this.breachPiston.render(alpha);
    // A caught ram strains against its pawl: a fine shudder and a relief valve hissing at the base.
    this.shudder = this.feed.straining ? Math.sin(time * 57) * 0.004 : 0;
    this.breachPiston.group.position.y += this.shudder;
    this.reliefSteam.rate = this.feed.straining ? 5 : 0;
    this.reliefSteam.update(dt);
    this.pawl.rotation.x += ((this.feed.caught ? 0 : -1.1) - this.pawl.rotation.x) * (1 - Math.exp(-dt * 12));
    this.catchLever.update(dt);
    this.releaseLever.update(dt);
    if (!this.feed.caught) this.releaseLever.set(false);
    this.breachPiston.group.updateMatrixWorld(true);
    this.releaseLever.group.getWorldPosition(this.releaseAnchor).add(v3(0, 1.1, 0));
    for (const gauge of this.gauges) {
      gauge.value += (gauge.target() - gauge.value) * (1 - Math.exp(-dt * 3));
      gauge.needle.rotation.z = -((-2 / 3) * Math.PI + (4 / 3) * Math.PI * gauge.value) + (this.feed.straining && gauge.value > 0.9 ? Math.sin(time * 40) * 0.03 : 0);
    }
    this.brakeLever.update(dt);
    if (this.collar.mode !== 'braking' && this.collar.mode !== 'cycling') this.brakeLever.set(false);
    this.deckLever.update(dt);
    if (this.collar.mode !== 'rising') this.deckLever.set(false);
    this.collar.group.updateMatrixWorld(true);
    this.deckLeverAnchor.copy(this.deckLeverLocal).setY(this.collar.group.position.y + 1.25);
    for (const l of this.lights) l.update(dt, time);
    this.boardLamp.update(dt, time);
    for (const e of this.curtain) {
      e.update(dt);
    }
    // Steam curtain fades out once redirected.
    const sheet = this.curtainSheet.material as THREE.MeshBasicMaterial;
    sheet.opacity += ((this.feed.curtainOn ? 0.05 : 0) - sheet.opacity) * (1 - Math.exp(-dt * 3));
    for (const e of this.curtain) e.rate = this.feed.curtainOn ? 16 : 0;
    this.ventStrip.set(this.feed.route === 'vent');
    this.ramStrip.set(this.feed.route === 'ram');
    this.ventStrip.update(dt);
    this.ramStrip.update(dt);
    // The pointer bar leans toward the plate's VENT (left) or RAM (right).
    this.feedWheelAngle += ((this.feed.route === 'vent' ? 0.6 : -0.6) - this.feedWheelAngle) * (1 - Math.exp(-dt * 7));
    this.feedWheel.rotation.z = this.feedWheelAngle;
  }
}

/** The increment's critical path, executable by the autopilot. Starts at the lookout after the reveal. */
function buildEngineRoute(r: EngineRoute): RouteStep[] {
  const p = (k: number, a: number, f: number, y: number): [number, number, number] => {
    const v = sidePos(k, a, uAt(a, f), y);
    return [v.x, v.y, v.z];
  };
  const T = T1;
  return [
    { kind: 'move', to: [1.4, 4.6, 12.75], precise: true },
    { kind: 'move', to: p(0, 11.3, 0.62, T + 2.55), radius: 0.5 },
    { kind: 'move', to: p(0, 10.2, 0.75, T), radius: 0.6 },
    { kind: 'move', to: p(1, 10.6, 0.5, T), radius: 0.6 },
    { kind: 'move', to: p(2, 10.6, 0.1, T), precise: true },
    { kind: 'jump', from: p(2, 10.6, 0.24, T), to: p(2, 10.6, 0.92, T) },
    { kind: 'move', to: p(3, 10.6, 0.2, T), precise: true },
    { kind: 'vault', from: p(3, 10.6, 0.42, T), to: p(3, 10.6, 0.7, T) },
    { kind: 'move', to: p(3, 11.3, 0.92, T), precise: true },
    { kind: 'climb', from: p(4, 11.4, 0.07, T), to: p(4, 11.6, 0.25, T + 2.0) },
    { kind: 'move', to: p(4, 11.7, 0.82, T + 2.0), precise: true },
    { kind: 'move', to: p(5, 11.0, 0.1, T), radius: 0.6 },
    { kind: 'move', to: p(5, 10.7, 0.2, T), precise: true },
    { kind: 'wait', until: 'shuttleAtStart', timeout: 14 },
    { kind: 'move', to: p(5, 10.7, 0.3, T).map((n, i) => n + (i === 1 ? 0 : 0)) as [number, number, number], precise: true },
    { kind: 'move', to: [r.shuttle.base.x, T, r.shuttle.base.z], precise: true },
    { kind: 'wait', until: 'shuttleAtEnd', timeout: 14 },
    { kind: 'move', to: p(6, 10.7, 0.85, T), precise: true },
    { kind: 'move', to: p(7, 10.6, 0.3, T), radius: 0.6 },
    { kind: 'move', to: p(7, 10.2, 0.5, T), precise: true },
    { kind: 'interact', id: 'brake', standAt: p(7, 7.6, 0.5, T), expectFlag: 'collar.braked' },
    { kind: 'wait', until: 'collarHeld', timeout: 12 },
    { kind: 'interact', id: 'deck-lever', standAt: p(7, 3.8, 0.5, T), expectFlag: 'collar.ridden' },
    { kind: 'wait', until: 'collarTop', timeout: 12 },
    { kind: 'move', to: p(7, 7.0, 0.5, T3), precise: true },
    { kind: 'move', to: p(7, 10.4, 0.5, T3), precise: true },
    { kind: 'move', to: p(8, 10.6, 0.15, T3), precise: true },
    { kind: 'interact', id: 'ram-catch', standAt: p(8, 11.4, 0.09, T3), expectFlag: 'ram.caught' },
    { kind: 'interact', id: 'feed-diverter', standAt: p(8, 11.4, 0.25, T3), expectFlag: 'ram.primed' },
    { kind: 'move', to: p(9, 10.6, 0.6, T3), precise: true },
    { kind: 'move', to: p(9, 10.7, 0.86, T3), precise: true },
    { kind: 'interact', id: 'ram-release', standAt: p(9, 10.7, 0.86, T3), expectFlag: 'ram.released' },
    { kind: 'wait', until: 'pistonUp', timeout: 10 },
    { kind: 'jump', from: [r.exitTakeoff.x, r.exitTakeoff.y, r.exitTakeoff.z], to: [r.exitLanding.x, r.exitLanding.y, r.exitLanding.z] },
    { kind: 'wait', until: 'complete', timeout: 30 },
  ];
}

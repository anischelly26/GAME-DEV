import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { LevelContext, RouteStep } from '../Level';
import { Batcher, prismGeometry, worldBox } from '../../world/geometry';
import { valvePlateTexture, paintedTextTexture } from '../../world/textures';
import { ServiceLight, glowSprite } from '../../world/props/Lanterns';
import { SteamEmitter } from '../../world/Atmosphere';
import { EngineCollar, PistonPlatform } from '../../world/props/EngineRides';
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
  private readonly steamValveWheel = new THREE.Group();
  private readonly curtain: SteamEmitter[] = [];
  private readonly curtainSheet: THREE.Mesh;
  private readonly lights: ServiceLight[] = [];
  private readonly lightById = new Map<string, ServiceLight>();
  steamOn = true;
  private pistonPowered = false;
  private steamWheelAngle = 0;
  private time = 0;
  readonly deckLeverAnchor = new THREE.Vector3();
  private readonly deckLeverLocal: THREE.Vector3;
  /** Railing barrier at the lookout's broken edge, removed once the route opens. */
  private gateCollider: import('@dimforge/rapier3d-compat').Collider | null = null;
  private readonly gateMesh: THREE.Group;
  routeOpen = false;
  readonly route: RouteStep[];

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

    // ------------------------------------------------------------ k = 3: low maintenance rail to vault
    {
      const k = 3;
      const u = uAt(10.7, 0.5);
      const center = sidePos(k, (HALL.aIn + HALL.aWall) / 2, u, T1 + 0.42);
      const q = sideQuat(k).clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      const c = solidBox(center, v3(HALL.aWall - HALL.aIn - 0.1, 0.84, 0.26), q, m.iron, { blocksCamera: false });
      traversal.markVaultable(c);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.3),
        new THREE.MeshStandardMaterial({ map: paintedTextTexture('NO ACCESS', { w: 512, h: 160, color: 'rgba(30,24,20,0.95)', bg: 'rgba(214,180,90,1)', seed: 8 }), roughness: 0.8, side: THREE.DoubleSide }),
      );
      sign.position.copy(center).setY(T1 + 0.55);
      sign.quaternion.copy(q);
      sign.translateZ(0.14);
      root.add(sign);
    }

    // ------------------------------------------------------------ k = 4: rubble + raised gantry (ledge catch)
    {
      const k = 4;
      const q = sideQuat(k);
      for (let i = 0; i < 9; i++) {
        const f = 0.3 + (i / 8) * 0.4;
        const a = HALL.aIn + 0.3 + rng() * 1.4;
        const h = 1.4 + rng() * 1.6;
        const p = sidePos(k, a, uAt(a, f), T1 + h / 2);
        const blk = new RoundedBoxGeometry(0.9 + rng() * 0.5, h, 0.9 + rng() * 0.4, 1, 0.1);
        batch.add(blk, m.stone, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.3, rng() * 3, rng() * 0.3)), new THREE.Vector3(1, 1, 1)), { damp: true });
      }
      // Blockers matching the rubble heap: tall on the hall side, and low under the gantry so the
      // only way past is over it.
      const heap = sidePos(k, (HALL.aIn + 11.0) / 2, uAt(10, 0.5), T1 + 1.6);
      physics.box(heap, v3(halfSide(10) * 0.4 + 0.2, 1.6, (11.0 - HALL.aIn) / 2), q);
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
        const e = new SteamEmitter(p, dir.multiplyScalar(4.5), 16, new THREE.Color('#e4ecee'));
        this.curtain.push(e);
        root.add(e.group);
      }
      const sheetGeo = new THREE.PlaneGeometry(HALL.aWall - HALL.aIn, 2.6);
      this.curtainSheet = new THREE.Mesh(
        sheetGeo,
        new THREE.MeshBasicMaterial({ color: '#cfdfe3', map: glowSprite(), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.curtainSheet.position.copy(sidePos(k, (HALL.aIn + HALL.aWall) / 2, uAt(10.7, fCurtain), T3 + 1.3));
      this.curtainSheet.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
      root.add(this.curtainSheet);
      // Cracked main along the wall that feeds the curtain.
      const main = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2 * halfSide(HALL.aWall), 12), m.brass);
      main.position.copy(sidePos(k, HALL.aWall - 0.25, 0, T3 + 2.7));
      main.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      root.add(main);
      // Redirect valve before the curtain: same language as the cell (plate + pointer bar).
      const vp = sidePos(k, HALL.aWall - 0.05, uAt(HALL.aWall, 0.25), T3 + 1.15);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: valvePlateTexture(), roughness: 0.8 }));
      plate.position.copy(vp).add(v3(0, 0.42, 0));
      plate.quaternion.copy(sideQuat(k)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      root.add(plate);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 24), m.ironDark);
      const bar = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.3, 0.04, 1, 0.015), m.ceramic);
      bar.position.z = 0.03;
      this.steamValveWheel.add(rim, bar);
      this.steamValveWheel.position.copy(vp);
      this.steamValveWheel.quaternion.copy(plate.quaternion);
      root.add(this.steamValveWheel);
      this.steamValvePos = vp;
    }

    // ------------------------------------------------------------ k = 9 (tier 3): breach piston + exit gantry
    walkwayPiece(9, 0, 0.74, T3);
    {
      const k = 9;
      const a = 10.7;
      const base = sidePos(k, a, uAt(a, 0.86), T3);
      this.breachPiston = new PistonPlatform(physics, m, base, 2.4, { w: 1.8, d: 1.8 }, { rest: 2.8, travel: 2.4, phase: 0 }, sideAngle(k));
      root.add(this.breachPiston.group);
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
      ctx.checkpoints.register({ id: c.id, order: c.order, label: c.label, feet, facing, impliesFlags: [], recoverBelowY: c.y - 3 });
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
    ctx.checkpoints.register({ id: 'exit', order: 8, label: 'Exit gantry', feet: this.exitCenter.clone(), facing: sideAngle(10), impliesFlags: [], recoverBelowY: this.exitCenter.y - 3 });

    this.registerInteractions();
    this.registerTriggers();
    ctx.camera.zones.push({ id: 'hall', contains: (p) => Math.hypot(p.x, p.z) < HALL.aWall + 0.2 && p.y < 14, distance: 6.2, height: 1.7, fov: 60, priority: 1 });
    this.route = buildEngineRoute(this);
  }

  private steamValvePos = new THREE.Vector3();
  exitCenter = new THREE.Vector3();
  readonly exitLanding = new THREE.Vector3();
  readonly exitTakeoff = new THREE.Vector3();

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

    interactions.add({
      id: 'steam-valve',
      position: this.steamValvePos,
      radius: 2.2,
      prompt: () => (this.steamOn ? 'Close the vent bypass' : null),
      interact: () => {
        player.lockFor(0.7, this.steamValvePos);
        this.steamOn = false;
        this.pistonPowered = true;
        events.emit('sfx', { name: 'valveClose', x: this.steamValvePos.x, y: this.steamValvePos.y, z: this.steamValvePos.z });
        progression.set('steam.redirected');
        dialogue.say('Mara', 'Same trick. Now the pressure goes to that piston instead.');
        progression.setObjective('Ride the piston up to the gantry in the breach');
      },
    });
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
        dialogue.sayOnce('steam', 'Mara', "Too hot to push through. There's a bypass on this line.");
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
  debugFrame(which: 'vault' | 'ledge' | 'steam'): void {
    const spots = {
      vault: { k: 3, a: 10.6, f: 0.2, y: T1 },
      ledge: { k: 3, a: 11.2, f: 0.85, y: T1 },
      steam: { k: 8, a: 10.6, f: 0.2, y: T3 },
    };
    const s = spots[which];
    const feet = sidePos(s.k, s.a, uAt(s.a, s.f), s.y);
    const t = sideTangent(s.k);
    const facing = Math.atan2(t.x, t.z);
    this.ctx.player.teleport(feet, facing);
    this.ctx.camera.snapBehind(feet, facing, 0.35);
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
    this.steamOn = true;
    this.pistonPowered = false;
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
    if (i >= 4) {
      this.steamOn = false;
      this.pistonPowered = true;
    }
  }

  get conditions(): Record<string, () => boolean> {
    return {
      collarHeld: () => this.collar.mode === 'held',
      collarTop: () => this.collar.mode === 'top',
      steamOff: () => !this.steamOn,
      shuttleAtStart: () => this.shuttle.height === 0,
      shuttleAtEnd: () => this.shuttle.height === 1,
      pistonDown: () => this.pistonPowered && this.breachPiston.height === 0,
      pistonUp: () => this.breachPiston.height === 1,
    };
  }

  /** Before the player moves: advance platform motion and publish each step's delta. */
  fixedUpdate(dt: number): void {
    this.time += dt;
    this.shuttle.fixedUpdate(dt);
    this.collar.fixedUpdate(dt);
    if (this.pistonPowered) this.breachPiston.fixedUpdate(dt);
    else this.breachPiston.stepDelta.set(0, 0, 0);
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
    this.breachPiston.render(this.pistonPowered ? alpha : 1);
    this.brakeLever.update(dt);
    if (this.collar.mode !== 'braking' && this.collar.mode !== 'cycling') this.brakeLever.set(false);
    this.deckLever.update(dt);
    if (this.collar.mode !== 'rising') this.deckLever.set(false);
    this.collar.group.updateMatrixWorld(true);
    this.deckLeverAnchor.copy(this.deckLeverLocal).setY(this.collar.group.position.y + 1.25);
    for (const l of this.lights) l.update(dt, time);
    for (const e of this.curtain) {
      e.update(dt);
    }
    // Steam curtain fades out once redirected.
    const sheet = this.curtainSheet.material as THREE.MeshBasicMaterial;
    sheet.opacity += ((this.steamOn ? 0.1 : 0) - sheet.opacity) * (1 - Math.exp(-dt * 3));
    for (const e of this.curtain) e.rate = this.steamOn ? 16 : 0;
    this.steamWheelAngle += ((this.steamOn ? 0 : Math.PI / 2) - this.steamWheelAngle) * (1 - Math.exp(-dt * 7));
    this.steamValveWheel.rotation.z = this.steamWheelAngle;
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
    { kind: 'interact', id: 'steam-valve', standAt: p(8, 11.5, 0.25, T3), expectFlag: 'steam.redirected' },
    { kind: 'move', to: p(9, 10.6, 0.6, T3), precise: true },
    { kind: 'wait', until: 'pistonDown', timeout: 14 },
    { kind: 'move', to: p(9, 10.7, 0.86, T3), precise: true },
    { kind: 'wait', until: 'pistonUp', timeout: 10 },
    { kind: 'jump', from: [r.exitTakeoff.x, r.exitTakeoff.y, r.exitTakeoff.z], to: [r.exitLanding.x, r.exitLanding.y, r.exitLanding.z] },
    { kind: 'wait', until: 'complete', timeout: 20 },
  ];
}

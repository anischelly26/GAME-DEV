import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Physics } from '../../physics/Physics';
import type { MaterialLibrary } from '../../world/materials';
import { Palette } from '../../world/materials';
import { Batcher, gearGeometry, prismGeometry, worldBox } from '../../world/geometry';
import { mulberry32 } from '../../core/math';
import { BEACON, BREACH_SIDES, HALL, halfSide, sideAngle, sideFraction } from './layout';
import { WorkLamp, glowSprite } from '../../world/props/Lanterns';
import { Chain } from '../../world/props/Mechanisms';
import { Water, LightShaft, Dust, SteamEmitter } from '../../world/Atmosphere';
import { enginePulse } from '../../gameplay/puzzles/PressureHatchLogic';

const rng = mulberry32(1234);
const tint = (base = 1, spread = 0.12) => {
  const t = base + (rng() - 0.5) * spread;
  return new THREE.Color(t, t * (1 + (rng() - 0.5) * 0.04), t * (1 + (rng() - 0.5) * 0.05));
};

/** Which walkway segments exist, per tier: false = collapsed. */
function walkwayPresent(tier: number, k: number): boolean {
  const kk = ((k % HALL.sides) + HALL.sides) % HALL.sides;
  if (tier === 1 && (kk === 17 || kk === 0 || kk === 1)) return false; // in front of the lookout
  if (tier >= 1 && BREACH_SIDES.includes(kk)) return false;
  return true;
}

function isBreach(tier: number, k: number): boolean {
  const kk = ((k % HALL.sides) + HALL.sides) % HALL.sides;
  return tier >= 1 && BREACH_SIDES.includes(kk);
}

export interface TurbineHall {
  /** Service lights that switch on in sequence at the lookout reveal. */
  routeLamps: WorkLamp[];
  update(dt: number, time: number, cameraPos: THREE.Vector3): void;
  /** Lamps that are always on. */
  lamps: WorkLamp[];
}

/**
 * The enormous turbine hall at the heart of Breakwater: three tiers of cells around the tide engine
 * column, a breach on the far side that opens to the sea and the harbour beacon. In this slice it is
 * the reveal seen from the lookout; the next increment makes it playable.
 */
export function buildTurbineHall(scene: THREE.Scene, physics: Physics, m: MaterialLibrary, moonDir: THREE.Vector3): TurbineHall {
  const batch = new Batcher();
  const root = new THREE.Group();
  root.name = 'turbine-hall';
  scene.add(root);
  const recessMat = m.stoneDark.clone();
  recessMat.side = THREE.BackSide;
  recessMat.color.set('#3a4446');

  const sideMatrix = (k: number, u: number, y: number, a: number) =>
    new THREE.Matrix4().makeRotationY(sideAngle(k)).multiply(new THREE.Matrix4().makeTranslation(u, y, a));

  const barPositions: THREE.Matrix4[] = [];
  const crossbarPositions: THREE.Matrix4[] = [];
  const candlePositions: THREE.Vector3[] = [];

  for (let k = 0; k < HALL.sides; k++) {
    const th = sideAngle(k);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th);
    const aMid = HALL.aWall + HALL.wallT / 2;
    const L = halfSide(HALL.aWall + HALL.wallT) + 0.05;
    const opening = HALL.cellOpeningW / 2;

    // ---- lower shaft wall (below tier 1), down into the water
    {
      const h = 11;
      const y = -HALL.floorT - h / 2;
      batch.add(worldBox(2 * L, h, HALL.wallT, 3), m.stoneDark, sideMatrix(k, 0, y, aMid), { tint: tint(0.92), damp: true });
      physics.box(new THREE.Vector3(...centerOf(k, 0, aMid)).setY(y), new THREE.Vector3(L, h / 2, HALL.wallT / 2), q);
      // Sluice arch outlines on alternate sides.
      if (k % 3 === 0) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.18, 6, 16, Math.PI), m.stone);
        arch.applyMatrix4(sideMatrix(k, 0, -6.5, HALL.aWall - 0.05));
        batch.add(arch.geometry.clone().applyMatrix4(arch.matrix), m.stone, undefined, { tint: tint(0.8), damp: true });
        batch.add(worldBox(2.4, 3.2, 0.1, 3), recessMat, sideMatrix(k, 0, -8.1, HALL.aWall - 0.02), { tint: tint(0.3) });
      }
    }

    for (let tier = 0; tier < 3; tier++) {
      const y0 = HALL.tierY[tier];
      const breach = isBreach(tier, k);
      const isLookout = tier === 1 && k === 0;

      // ---- walkway slab
      if (walkwayPresent(tier, k)) {
        const poly: Array<[number, number]> = [
          sideFraction(k, HALL.aIn, 0),
          sideFraction(k, HALL.aWall + 0.05, 0),
          sideFraction(k, HALL.aWall + 0.05, 1),
          sideFraction(k, HALL.aIn, 1),
        ];
        batch.add(prismGeometry(poly, y0 - HALL.floorT, y0, 3), m.floor, undefined, { tint: tint(0.95) });
        physics.prism(poly, y0 - HALL.floorT, y0);
        // Railing along the inner edge.
        const inner0 = sideFraction(k, HALL.aIn + 0.12, 0);
        const inner1 = sideFraction(k, HALL.aIn + 0.12, 1);
        const len = Math.hypot(inner1[0] - inner0[0], inner1[1] - inner0[1]);
        const mid: [number, number] = [(inner0[0] + inner1[0]) / 2, (inner0[1] + inner1[1]) / 2];
        const railM = new THREE.Matrix4().compose(new THREE.Vector3(mid[0], y0 + 1.0, mid[1]), q, new THREE.Vector3(1, 1, 1));
        batch.add(new THREE.BoxGeometry(len + 0.08, 0.07, 0.07), m.iron, railM);
        batch.add(new THREE.BoxGeometry(len + 0.08, 0.04, 0.04), m.iron, railM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)));
        for (const f of [0, 0.5]) {
          const p = sideFraction(k, HALL.aIn + 0.12, f);
          batch.add(new THREE.BoxGeometry(0.07, 1.0, 0.07), m.iron, new THREE.Matrix4().compose(new THREE.Vector3(p[0], y0 + 0.5, p[1]), q, new THREE.Vector3(1, 1, 1)));
        }
        physics.box(new THREE.Vector3(mid[0], y0 + 1.2, mid[1]), new THREE.Vector3(len / 2, 1.2, 0.06), q, { blocksCamera: false });
        // Corbel under the vertex.
        const v = sideFraction(k, HALL.aWall - 0.4, 1);
        batch.add(new RoundedBoxGeometry(0.5, 0.7, 0.9, 1, 0.08), m.stone, new THREE.Matrix4().compose(new THREE.Vector3(v[0], y0 - HALL.floorT - 0.35, v[1]), q, new THREE.Vector3(1, 1, 1)));
      } else if (!breach) {
        // Broken stub of the collapsed walkway, hugging the wall.
        const poly: Array<[number, number]> = [
          sideFraction(k, HALL.aWall - 0.7, 0.05),
          sideFraction(k, HALL.aWall + 0.05, 0),
          sideFraction(k, HALL.aWall + 0.05, 1),
          sideFraction(k, HALL.aWall - 0.5, 0.92),
        ];
        batch.add(prismGeometry(poly, y0 - HALL.floorT, y0 - 0.05, 3), m.floor, undefined, { tint: tint(0.85) });
      }

      if (breach) {
        // Jagged remains of the collapsed wall at floor level.
        for (let i = 0; i < 6; i++) {
          const f = (i + 0.5) / 6;
          const p = sideFraction(k, HALL.aWall + 0.25, f);
          const hgt = 0.4 + rng() * 1.4;
          const blk = new RoundedBoxGeometry(0.7 + rng() * 0.4, hgt, 0.6, 1, 0.08);
          batch.add(blk, m.stone, new THREE.Matrix4().compose(new THREE.Vector3(p[0], y0 - 0.2 + hgt / 2 - (tier === 2 ? 0 : 0.1), p[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.3, th + rng() * 0.4, rng() * 0.3)), new THREE.Vector3(1, 1, 1)), { tint: tint(0.85), damp: true });
        }
        continue;
      }

      // ---- facade with a cell opening
      const h = HALL.tierH;
      const yMid = y0 - HALL.floorT + h / 2;
      const pierW = L - opening;
      const fTint = tint(1);
      for (const s of [-1, 1]) {
        const u = s * (opening + pierW / 2);
        batch.add(worldBox(pierW, h, HALL.wallT, 3), m.stone, sideMatrix(k, u, yMid, aMid), { tint: fTint, damp: true });
        physics.box(new THREE.Vector3(...centerOf(k, u, aMid)).setY(yMid), new THREE.Vector3(pierW / 2, h / 2, HALL.wallT / 2), q);
      }
      const lintelH = h - HALL.floorT - HALL.cellOpeningH;
      const lintelY = y0 + HALL.cellOpeningH + lintelH / 2;
      batch.add(worldBox(2 * opening + 0.02, lintelH, HALL.wallT, 3), m.stone, sideMatrix(k, 0, lintelY, aMid), { tint: fTint, damp: true });
      physics.box(new THREE.Vector3(...centerOf(k, 0, aMid)).setY(lintelY), new THREE.Vector3(opening, lintelH / 2, HALL.wallT / 2), q);
      // Keystone over the opening.
      batch.add(new RoundedBoxGeometry(0.5, 0.55, 0.16, 1, 0.05), m.stone, sideMatrix(k, 0, y0 + HALL.cellOpeningH + 0.22, HALL.aWall - 0.06), { tint: tint(1.1) });

      if (isLookout) continue; // the lookout cell is built by the level itself

      // ---- dark cell recess and bars
      const recessDepth = HALL.recess;
      batch.add(new THREE.BoxGeometry(2 * opening, HALL.cellOpeningH, recessDepth), recessMat, sideMatrix(k, 0, y0 + HALL.cellOpeningH / 2, HALL.aWall + HALL.wallT + recessDepth / 2 - 0.02), { tint: tint(0.35, 0.2), castShadow: false });
      const bars = 13;
      const broken = rng() < 0.12;
      for (let b = 0; b < bars; b++) {
        if (broken && (b === 5 || b === 6 || b === 7)) continue;
        const u = -opening + 0.1 + (b * (2 * opening - 0.2)) / (bars - 1);
        barPositions.push(sideMatrix(k, u, y0 + HALL.cellOpeningH / 2, HALL.aWall + HALL.wallT * 0.5));
      }
      for (const yy of [0.25, 1.5, 2.6]) crossbarPositions.push(sideMatrix(k, 0, y0 + yy, HALL.aWall + HALL.wallT * 0.5));
      if (rng() < 0.22) candlePositions.push(new THREE.Vector3(...worldOf(k, (rng() - 0.5) * 1.6, HALL.aWall + HALL.wallT + recessDepth - 0.4)).setY(y0 + 0.6));
    }

    // ---- pilaster at the vertex between side k and k+1
    const vtx = sideFraction(k, HALL.aWall - 0.05, 1);
    const vq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th + Math.PI / HALL.sides);
    const pTop = BREACH_SIDES.includes(k) || BREACH_SIDES.includes(k + 1) ? HALL.tierY[1] + 1.5 : HALL.roofY;
    const pH = pTop + 11;
    batch.add(worldBox(0.75, pH, 0.75, 3), m.stone, new THREE.Matrix4().compose(new THREE.Vector3(vtx[0], pTop - pH / 2, vtx[1]), vq, new THREE.Vector3(1, 1, 1)), { tint: tint(1.05), damp: true });
    physics.box(new THREE.Vector3(vtx[0], pTop - pH / 2, vtx[1]), new THREE.Vector3(0.375, pH / 2, 0.375), vq);

    // ---- roof ring segment
    if (!BREACH_SIDES.includes(k)) {
      const poly: Array<[number, number]> = [
        sideFraction(k, HALL.oculusR, 0),
        sideFraction(k, HALL.aWall + 0.6, 0),
        sideFraction(k, HALL.aWall + 0.6, 1),
        sideFraction(k, HALL.oculusR, 1),
      ];
      batch.add(prismGeometry(poly, HALL.roofY, HALL.roofY + 0.7, 3), m.stoneDark, undefined, { tint: tint(0.7) });
      // Radial iron truss.
      const a = sideFraction(k, HALL.oculusR, 1);
      const b = sideFraction(k, HALL.aWall, 1);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      batch.add(new THREE.BoxGeometry(0.22, 0.5, len), m.ironDark, new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, HALL.roofY - 0.25, (a[1] + b[1]) / 2), vq, new THREE.Vector3(1, 1, 1)));
    }
  }

  // Lookout cell interior walls are built by the level; here we only leave its facade opening.

  // ---- bars (instanced: one draw call for every cell in the hall)
  {
    const barGeo = new THREE.CylinderGeometry(0.03, 0.03, HALL.cellOpeningH, 6);
    const bars = new THREE.InstancedMesh(barGeo, m.iron, barPositions.length);
    barPositions.forEach((mtx, i) => bars.setMatrixAt(i, mtx));
    bars.castShadow = true;
    root.add(bars);
    const cross = new THREE.InstancedMesh(new THREE.BoxGeometry(HALL.cellOpeningW, 0.06, 0.06), m.iron, crossbarPositions.length);
    crossbarPositions.forEach((mtx, i) => cross.setMatrixAt(i, mtx));
    cross.castShadow = true;
    root.add(cross);
  }

  // ---- candles in a few cells: signs of other prisoners
  for (const p of candlePositions) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffb46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    s.position.copy(p);
    s.scale.setScalar(0.45);
    root.add(s);
  }

  // ---- the tide engine column
  const engine = new THREE.Group();
  root.add(engine);
  {
    const colH = 36;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(HALL.columnR, HALL.columnR * 1.1, colH, 36, 1), m.iron);
    col.position.y = -13 + colH / 2;
    col.castShadow = col.receiveShadow = true;
    engine.add(col);
    physics.cylinder({ x: 0, y: -13 + colH / 2, z: 0 }, colH / 2, HALL.columnR);
    for (let y = -9; y < 22; y += 2.3) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(HALL.columnR + 0.04, 0.12, 6, 36), m.brass);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      engine.add(band);
    }
    // Vertical pressure mains running up the column.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 34, 12), m.brass);
      pipe.position.set(Math.sin(a) * (HALL.columnR + 0.35), 4, Math.cos(a) * (HALL.columnR + 0.35));
      pipe.castShadow = true;
      engine.add(pipe);
    }
    // Two great flywheels on the column, slowly turning.
    for (const [y, r] of [
      [2.2, 1.9],
      [7.4, 1.5],
    ]) {
      const fly = new THREE.Mesh(gearGeometry(r, 24, 0.18, 0.35, 0.35), m.brass);
      fly.position.set(0, y, HALL.columnR + 0.5);
      fly.castShadow = true;
      fly.name = 'flywheel';
      engine.add(fly);
    }
  }
  // The breathing collar: the visible piston head that rises and falls with the engine's cycle.
  const collar = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(HALL.columnR + 1.1, HALL.columnR + 1.1, 1.2, 36, 1, true), m.ironDark);
    ring.material = m.ironDark.clone();
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(HALL.columnR + 1.1, 0.16, 6, 36), m.brass);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.6;
    const deck = new THREE.Mesh(new THREE.RingGeometry(HALL.columnR + 0.1, HALL.columnR + 1.1, 36), m.ironDark);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.6;
    collar.add(ring, lip, deck);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), m.warningLamp.clone());
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5;
      lamp.position.set(Math.sin(a) * (HALL.columnR + 1.15), 0.2, Math.cos(a) * (HALL.columnR + 1.15));
      collar.add(lamp);
    }
    collar.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    root.add(collar);
  }
  const steam: SteamEmitter[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const e = new SteamEmitter(new THREE.Vector3(Math.sin(a) * (HALL.columnR + 0.8), -1.5, Math.cos(a) * (HALL.columnR + 0.8)), new THREE.Vector3(Math.sin(a), 0.8, Math.cos(a)), 0.6);
    steam.push(e);
    root.add(e.group);
  }

  // Hanging chains from the roof for scale and vertical rhythm.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = 5.2 + (i % 3) * 1.1;
    const top = new THREE.Vector3(Math.sin(a) * r, HALL.roofY, Math.cos(a) * r);
    const len = 6 + (i % 4) * 2.5;
    const c = new Chain(m.ironDark, top, top.clone().setY(HALL.roofY - len), 0.16);
    root.add(c.mesh);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 12, Math.PI * 1.4), m.ironDark);
    hook.position.copy(top).setY(HALL.roofY - len - 0.2);
    root.add(hook);
  }

  // ---- inner water
  const water = new Water({ radius: HALL.aWall + 0.4, y: HALL.waterY, deep: new THREE.Color('#06171c'), moonDir, fogDensity: 0.03, fogColor: Palette.fog, scale: 1.4, foamRadius: HALL.aWall - 0.2 });
  root.add(water.mesh);

  // ---- moonlight shaft through the oculus and dust in it
  const shaftFrom = new THREE.Vector3(0, HALL.roofY + 1, 0).addScaledVector(moonDir, 0).add(new THREE.Vector3(Math.sin(0.1) * 4.5, 0, Math.cos(0.1) * 4.5));
  const shaftTo = shaftFrom.clone().addScaledVector(moonDir, -26);
  const shaft = new LightShaft(shaftFrom, shaftTo, 2.4, 3.8, Palette.moon, 0.12);
  root.add(shaft.mesh);
  const dust = new Dust(700, new THREE.Vector3(0, 0, 0), HALL.aWall - 0.5, -8, HALL.roofY, shaftFrom, moonDir.clone().negate());
  root.add(dust.points);

  // ---- lamps: a few permanent ones, and the service-light route revealed from the lookout
  const lamps: WorkLamp[] = [];
  const routeLamps: WorkLamp[] = [];
  const wallLamp = (k: number, tier: number, u: number, opts: ConstructorParameters<typeof WorkLamp>[3]) => {
    const [x, z] = sidePointWorld(k, HALL.aWall - 0.02, u);
    const outward = new THREE.Vector3(-Math.sin(sideAngle(k)), 0, -Math.cos(sideAngle(k)));
    const lamp = new WorkLamp(m, new THREE.Vector3(x, HALL.tierY[tier] + 2.9, z), outward, opts);
    root.add(lamp.group);
    return lamp;
  };
  for (const [k, tier] of [
    [4, 0],
    [8, 2],
    [13, 1],
    [15, 0],
  ]) {
    lamps.push(wallLamp(k, tier, 1.75, { light: tier === 0, intensity: 4, distance: 10 }));
  }
  // Route: across tier 2 to the right of the lookout, then down to the engine gantry on tier 1.
  for (const [k, tier, light] of [
    [2, 1, true],
    [3, 1, false],
    [4, 1, false],
    [5, 1, true],
    [6, 0, false],
    [7, 0, true],
  ] as Array<[number, number, boolean]>) {
    routeLamps.push(wallLamp(k, tier, -1.75, { light, intensity: 6, distance: 11, on: false }));
  }
  // Maintenance gantry from tier 1 to the engine (destination of the next increment).
  {
    const a = sideAngle(7);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const r0 = HALL.columnR + 1.2;
    const r1 = HALL.aIn + 0.2;
    const mid = (r0 + r1) / 2;
    const center = new THREE.Vector3(Math.sin(a) * mid, -0.15, Math.cos(a) * mid);
    batch.add(new THREE.BoxGeometry(1.8, 0.2, r1 - r0), m.grate, new THREE.Matrix4().compose(center, q, new THREE.Vector3(1, 1, 1)));
    for (const s of [-1, 1]) {
      const railC = center.clone().add(new THREE.Vector3(Math.cos(a) * 0.9 * s, 1.05, -Math.sin(a) * 0.9 * s));
      batch.add(new THREE.BoxGeometry(0.06, 0.06, r1 - r0), m.iron, new THREE.Matrix4().compose(railC, q, new THREE.Vector3(1, 1, 1)));
    }
  }

  batch.build(root);

  // ---- exterior beyond the breach: the sea, the headland and the harbour beacon
  const exterior = buildExterior(moonDir);
  scene.add(exterior.group);

  let time0 = 0;
  return {
    routeLamps,
    lamps,
    update(dt, time, cameraPos) {
      time0 += dt;
      const pulse = enginePulse(time);
      // The collar heaves with each engine breath.
      collar.position.y = -1.2 + Math.sin((time / 8.4) * Math.PI * 2) * 2.2;
      for (const child of engine.children) if (child.name === 'flywheel') child.rotation.z += dt * 0.25;
      steam.forEach((s) => {
        s.burst = Math.max(s.burst, pulse > 0.6 ? 0.4 : 0);
        s.update(dt);
      });
      for (const l of lamps) l.update(dt, time);
      for (const l of routeLamps) l.update(dt, time);
      water.update(time);
      shaft.update(time);
      dust.update(time);
      exterior.update(time, cameraPos);
    },
  };
}

function centerOf(k: number, u: number, a: number): [number, number, number] {
  const [x, z] = sidePointWorld(k, a, u);
  return [x, 0, z];
}

function worldOf(k: number, u: number, a: number): [number, number, number] {
  return centerOf(k, u, a);
}

function sidePointWorld(k: number, a: number, u: number): [number, number] {
  const th = sideAngle(k);
  return [Math.sin(th) * a + Math.cos(th) * u, Math.cos(th) * a - Math.sin(th) * u];
}

// ---------------------------------------------------------------- exterior

function buildExterior(moonDir: THREE.Vector3): { group: THREE.Group; update(time: number, cameraPos: THREE.Vector3): void } {
  const group = new THREE.Group();
  group.name = 'exterior';
  const sea = new Water({ radius: 1200, y: -12, deep: new THREE.Color('#061820'), moonDir, fogDensity: 0, fogColor: Palette.fog, scale: 6, horizonFade: 900 });
  group.add(sea.mesh);

  // Distant landforms: flat-shaded, unfogged silhouettes with aerial-perspective tint.
  const farMat = new THREE.MeshStandardMaterial({ color: '#1a2b33', roughness: 1, flatShading: true, fog: false, emissive: '#0a1418', emissiveIntensity: 0.6 });
  const rock = (x: number, z: number, r: number, h: number, seed: number) => {
    const g = new THREE.ConeGeometry(r, h, 9, 3);
    const pos = g.getAttribute('position');
    const rr = mulberry32(seed);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < h / 2 - 0.01) {
        pos.setX(i, pos.getX(i) * (0.75 + rr() * 0.5));
        pos.setZ(i, pos.getZ(i) * (0.75 + rr() * 0.5));
        pos.setY(i, y + (rr() - 0.5) * h * 0.15);
      }
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, farMat);
    mesh.position.set(x, -12 + h / 2 - 2, z);
    group.add(mesh);
    return mesh;
  };
  rock(BEACON.x, BEACON.z, 40, 26, 1);
  rock(BEACON.x - 60, BEACON.z + 20, 55, 18, 2);
  rock(BEACON.x + 70, BEACON.z - 30, 70, 34, 3);
  rock(BEACON.x + 160, BEACON.z - 10, 45, 14, 4);
  rock(BEACON.x - 160, BEACON.z - 60, 90, 40, 5);

  // Harbour crane silhouette beside the beacon.
  const craneMat = new THREE.MeshStandardMaterial({ color: '#0e1a20', roughness: 1, fog: false });
  const crane = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 30, 3), craneMat);
  tower.position.y = 15;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 2), craneMat);
  jib.position.set(10, 30, 0);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.3, 14, 0.3), craneMat);
  cable.position.set(24, 23, 0);
  crane.add(tower, jib, cable);
  crane.position.set(BEACON.x + 55, -1, BEACON.z + 15);
  crane.rotation.y = 0.5;
  group.add(crane);

  // The beacon: a tower with a lantern room and a slow searchlight sweep.
  const beacon = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: '#4a5357', roughness: 0.9, fog: false, emissive: '#151d21', emissiveIntensity: 0.6 });
  const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.5, BEACON.height, 12), towerMat);
  shaftMesh.position.y = BEACON.height / 2;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 1, 12), towerMat);
  gallery.position.y = BEACON.height;
  const lampMat = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffe2b0', emissiveIntensity: 8, fog: false });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 12), lampMat);
  lantern.position.y = BEACON.height + 2.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3, 12), towerMat);
  cap.position.y = BEACON.height + 6;
  beacon.add(shaftMesh, gallery, lantern, cap);
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }));
  glare.position.y = BEACON.height + 2.5;
  glare.scale.setScalar(40);
  beacon.add(glare);
  // Sweeping searchlight beam.
  const beamGeo = new THREE.ConeGeometry(14, 220, 24, 1, true);
  beamGeo.translate(0, -110, 0);
  beamGeo.rotateX(-Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { color: { value: new THREE.Color('#ffe2b0') } },
    vertexShader: /* glsl */ `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 color; varying vec3 vPos; void main(){ float t = clamp(vPos.z / 220.0, 0.0, 1.0); float a = (1.0 - t) * (1.0 - t) * 0.22; gl_FragColor = vec4(color * a, 1.0); }`,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = BEACON.height + 2.5;
  beacon.add(beam);
  beacon.position.set(BEACON.x, 10, BEACON.z);
  group.add(beacon);

  return {
    group,
    update(time) {
      sea.update(time);
      beam.rotation.y = time * 0.35;
      // The beam faces the viewer once per sweep: brighten the glare then.
      const facing = Math.max(0, Math.cos(time * 0.35 - Math.atan2(-BEACON.x, -BEACON.z)));
      (glare.material as THREE.SpriteMaterial).opacity = 0.35 + 0.65 * Math.pow(facing, 8);
      glare.scale.setScalar(30 + 40 * Math.pow(facing, 8));
    },
  };
}

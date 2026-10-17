import * as THREE from 'three';
import type { Level, LevelContext, RouteStep } from '../Level';
import type { Surface } from '../../physics/Physics';
import { worldBox } from '../../world/geometry';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/**
 * The movement lab's layout (metres). Mara starts at `start` facing +z; the stations are lanes
 * running +z from z = 0, the material pads a row across the start. docs/MOVEMENT_2_0.md, B7.
 */
export const LAB = {
  start: v3(0, 0, -16),
  /** Lane A: raised walkways (top `gapTop`) separated by gaps of these widths. */
  gapX: -12,
  gapTop: 0.75,
  gapWalk: 4,
  gaps: [1.5, 2.0, 2.8, 3.3],
  /** Lane B: walls with these top heights, to catch and climb. */
  ledgeX: -5,
  ledges: [1.2, 1.8, 2.2, 2.6],
  ledgeZ: [3, 11, 19, 27],
  /** Lane C: blocks with these heights, to vault (1.2 m is a climb, not a vault). */
  vaultX: 2,
  vaults: [0.5, 0.9, 1.2],
  vaultZ: [4, 11, 18],
  /** The pound plate. */
  plate: v3(2, 0, 26),
  /** A low beam overhead (its underside this high): jump under it to bump her head. */
  beam: { x: 5.5, z: -4.5, bottom: 2.1 },
  /** Lane D: a tower of 34° ramps to landings at these heights; drop off the east side. */
  towerX: 10,
  rampDeg: 34,
  landings: [3, 6, 10],
  landingLen: 4,
  /** The material pads: a row across the start, west to east. */
  pads: ['stone', 'metal', 'wood', 'grass', 'gravel', 'sand', 'water'] as Array<Surface>,
  padZ: [-13, -10] as [number, number],
  padSpacing: 4,
  /** Shallow water on the water pad. */
  wadeLevel: 0.25,
  /** The pool: deep enough to swim, walls to climb out. */
  pool: { x0: -6, x1: 6, z0: 36, z1: 46, floorY: -2.2, level: -0.25 },
  recoverY: -6,
};

/** Each walkway of lane A, [z0, z1]. */
export function gapWalkways(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let z = 0;
  out.push([z, z + LAB.gapWalk + 1]);
  z += LAB.gapWalk + 1;
  for (const g of LAB.gaps) {
    z += g;
    out.push([z, z + LAB.gapWalk]);
    z += LAB.gapWalk;
  }
  return out;
}

/** Each part of the ramp tower: ramps [zLow, zHigh, yLow, yHigh] and landings [z0, z1, y]. */
export function towerParts(): { ramps: Array<[number, number, number, number]>; landings: Array<[number, number, number]> } {
  const ramps: Array<[number, number, number, number]> = [];
  const landings: Array<[number, number, number]> = [];
  let z = 0;
  let y = 0;
  for (const top of LAB.landings) {
    const run = (top - y) / Math.tan(LAB.rampDeg * DEG);
    ramps.push([z, z + run, y, top]);
    z += run;
    landings.push([z, z + LAB.landingLen, top]);
    z += LAB.landingLen;
    y = top;
  }
  return { ramps, landings };
}

/** Centre x of material pad `i`. */
export const padX = (i: number) => (i - (LAB.pads.length - 1) / 2) * LAB.padSpacing;

/** A sign: dark text on a pale board, drawn once. */
function signTexture(lines: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#3b3328';
  g.lineWidth = 10;
  g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.fillStyle = '#2b251d';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = lines.length > 1 ? 64 : 84;
  g.font = `bold ${size}px system-ui, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * The movement lab (`?lab=1`): a plain, well-lit yard of stations for tuning and testing movement
 * on its own, outside any chapter. No story, no Watch. Each station is sized against the measured
 * reach (docs/GAME_DESIGN.md "Movement capabilities"): gaps, ledges, vaults, drops of 3, 6 and 10 m,
 * a 34° ramp, footstep pads for every material, a pound plate and a pool.
 */
export class MovementLab implements Level {
  readonly name = 'Movement Lab';
  readonly checkpointIds = ['start'];
  readonly conditions: Record<string, () => boolean>;
  readonly route: RouteStep[];
  readonly routeParts: Record<string, RouteStep[]>;
  /** Pound plate: lit when a ground pound lands on it. */
  plateHits = 0;
  /** The largest landing impact (m/s) since the last reset (tests read it). */
  maxImpact = 0;
  private readonly plateLamp: THREE.MeshStandardMaterial;
  private plateGlow = 0;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly ctx: LevelContext) {
    const { scene, physics, materials: m, traversal, player, events, checkpoints, progression } = ctx;
    player.steam = true;
    const own = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const solid = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      mat: THREE.Material,
      opts: { surface?: Surface; climb?: boolean; vault?: boolean; collide?: boolean } = {},
    ) => {
      const mesh = new THREE.Mesh(own(worldBox(x1 - x0, y1 - y0, z1 - z0, 2)), mat);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (opts.collide === false) return null;
      const col = physics.box(mesh.position, v3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2));
      if (opts.surface) physics.setSurface(col, opts.surface);
      if (opts.climb) traversal.markClimbable(col);
      if (opts.vault) traversal.markVaultable(col);
      return col;
    };
    /** A sign on a post, facing back toward the start (readable on the way in). */
    const sign = (x: number, z: number, lines: string[]) => {
      const mat = own(new THREE.MeshStandardMaterial({ map: own(signTexture(lines)), roughness: 0.9 }));
      const board = new THREE.Mesh(own(new THREE.PlaneGeometry(1.6, 0.8)), mat);
      board.position.set(x, 2.0, z);
      board.rotation.y = Math.PI;
      scene.add(board);
      const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8)), m.ironDark);
      post.position.set(x, 0.8, z);
      scene.add(post);
    };

    // ------------------------------------------------------------ the yard
    const P = LAB.pool;
    // The floor, in four slabs round the pool (stone: the default surface).
    solid(-24, 24, -1, 0, -24, P.z0, m.floor);
    solid(-24, P.x0, -1, 0, P.z0, P.z1, m.floor);
    solid(P.x1, 24, -1, 0, P.z0, P.z1, m.floor);
    solid(-24, 24, -1, 0, P.z1, 56, m.floor);
    // Low walls round the yard (the camera sees over them).
    for (const [x0, x1, z0, z1] of [
      [-24.5, -24, -24, 56],
      [24, 24.5, -24, 56],
      [-24, 24, -24.5, -24],
      [-24, 24, 56, 56.5],
    ]) solid(x0, x1, 0, 1.2, z0, z1, m.stone);

    // ------------------------------------------------------------ material pads
    const padMat: Record<Surface, THREE.Material> = {
      stone: m.stone,
      metal: m.grate,
      wood: m.wood,
      grass: m.grass,
      gravel: m.gravel,
      sand: m.sand,
      water: m.sand,
    };
    LAB.pads.forEach((s, i) => {
      const x = padX(i);
      solid(x - 1.5, x + 1.5, -0.02, 0.02, LAB.padZ[0], LAB.padZ[1], padMat[s], { surface: s === 'water' ? 'sand' : s });
      sign(x, LAB.padZ[0] - 0.3, [s]);
    });
    {
      const i = LAB.pads.indexOf('water');
      const x = padX(i);
      const water = new THREE.Mesh(
        own(new THREE.PlaneGeometry(3, LAB.padZ[1] - LAB.padZ[0])),
        own(new THREE.MeshStandardMaterial({ color: '#4f8ea0', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55 })),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, LAB.wadeLevel, (LAB.padZ[0] + LAB.padZ[1]) / 2);
      scene.add(water);
    }

    // ------------------------------------------------------------ lane A: gaps
    {
      const x0 = LAB.gapX - 1.5;
      const x1 = LAB.gapX + 1.5;
      // Steps up to the first walkway (auto-step height).
      for (let k = 0; k < 3; k++) solid(x0, x1, 0, (k + 1) * 0.25, -1.5 + k * 0.5, 0, m.stone);
      for (const [z0, z1] of gapWalkways()) solid(x0, x1, 0, LAB.gapTop, z0, z1, m.stone);
      let z = LAB.gapWalk + 1;
      for (const g of LAB.gaps) {
        sign(x0 - 1.0, z + g / 2, g > 3 ? [`gap ${g.toFixed(1)} m`, 'the limit'] : [`gap ${g.toFixed(1)} m`]);
        z += g + LAB.gapWalk;
      }
    }

    // ------------------------------------------------------------ lane B: ledges
    LAB.ledges.forEach((h, i) => {
      const z = LAB.ledgeZ[i];
      solid(LAB.ledgeX - 1.5, LAB.ledgeX + 1.5, 0, h, z - 0.75, z + 0.75, m.stoneDark, { climb: true });
      sign(LAB.ledgeX - 2.4, z - 1.2, h > 2.2 ? [`ledge ${h.toFixed(1)} m`, 'double jump'] : [`ledge ${h.toFixed(1)} m`]);
    });

    // ------------------------------------------------------------ lane C: vaults and the pound plate
    LAB.vaults.forEach((h, i) => {
      const z = LAB.vaultZ[i];
      solid(LAB.vaultX - 1.5, LAB.vaultX + 1.5, 0, h, z - 0.3, z + 0.3, m.wood, { vault: h <= 1.15, climb: h > 1.15, surface: 'wood' });
      sign(LAB.vaultX + 2.4, z - 1.2, [h > 1.15 ? `climb ${h.toFixed(1)} m` : `vault ${h.toFixed(1)} m`]);
    });
    const plateCollider = (() => {
      const p = LAB.plate;
      this.plateLamp = own(new THREE.MeshStandardMaterial({ color: '#b08a3c', metalness: 0.8, roughness: 0.35, emissive: new THREE.Color('#ffb648'), emissiveIntensity: 0 }));
      const plate = new THREE.Mesh(own(new THREE.CylinderGeometry(1.2, 1.2, 0.06, 32)), this.plateLamp);
      plate.position.set(p.x, 0.03, p.z);
      plate.receiveShadow = true;
      scene.add(plate);
      const col = physics.box(v3(p.x, 0.03, p.z), v3(1.1, 0.03, 1.1));
      physics.setSurface(col, 'metal');
      sign(p.x + 2.4, p.z - 1.6, ['pound plate']);
      return col.handle;
    })();
    events.on('groundPound', (e) => {
      const p = LAB.plate;
      if (e.collider === plateCollider || (Math.hypot(e.x - p.x, e.z - p.z) < 1.1 && Math.abs(e.y - p.y) < 0.3)) {
        this.plateHits++;
        this.plateGlow = 1;
        progression.set('lab.plate');
      }
    });
    events.on('land', ({ impact }) => {
      this.maxImpact = Math.max(this.maxImpact, impact);
    });

    // ------------------------------------------------------------ the low beam
    {
      const b = LAB.beam;
      solid(b.x - 1.5, b.x + 1.5, b.bottom, b.bottom + 0.3, b.z - 1.5, b.z + 1.5, m.wood, { surface: 'wood' });
      for (const [dx, dz] of [
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ]) solid(b.x + dx - 0.1, b.x + dx + 0.1, 0, b.bottom, b.z + dz - 0.1, b.z + dz + 0.1, m.iron);
      sign(b.x + 2.4, b.z - 1.6, ['low beam']);
    }

    // ------------------------------------------------------------ lane D: the ramp tower
    {
      const x0 = LAB.towerX - 1.5;
      const x1 = LAB.towerX + 1.5;
      const { ramps, landings } = towerParts();
      for (const [zLow, zHigh, yLow, yHigh] of ramps) {
        const len = Math.hypot(zHigh - zLow, yHigh - yLow);
        const pitch = Math.atan2(yHigh - yLow, zHigh - zLow);
        const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -pitch);
        // Run a little into the landings (no lip to catch on).
        const half = v3(1.5, 0.15, len / 2 + 0.25);
        const c = v3(LAB.towerX, (yLow + yHigh) / 2 - 0.15 * Math.cos(pitch), (zLow + zHigh) / 2);
        const mesh = new THREE.Mesh(own(worldBox(3, 0.3, len + 0.5, 2)), m.stone);
        mesh.position.copy(c);
        mesh.quaternion.copy(q);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        physics.box(c, half, q);
        // A rail on the west side; the east side is open to drop off.
        physics.box(v3(x0 - 0.05, c.y + 0.7, c.z), v3(0.04, 0.6, len / 2), q, { blocksCamera: false });
      }
      landings.forEach(([z0, z1, y]) => {
        solid(x0, x1, y - 0.4, y, z0, z1, m.stone);
        // Legs under it (visual and solid).
        solid(x0, x0 + 0.4, 0, y - 0.4, (z0 + z1) / 2 - 0.2, (z0 + z1) / 2 + 0.2, m.iron);
        physics.box(v3(x0 - 0.05, y + 0.7, (z0 + z1) / 2), v3(0.04, 0.6, (z1 - z0) / 2), undefined, { blocksCamera: false });
        sign(x1 + 1.2, z0 + 0.5, [`drop ${y} m`]);
      });
      sign(x0 - 1.0, -1.0, [`ramp ${LAB.rampDeg}°`]);
    }

    // ------------------------------------------------------------ the pool
    {
      // Walls (climbable: swim into them to climb out) and the floor.
      solid(P.x0, P.x1, P.floorY - 0.5, P.floorY, P.z0, P.z1, m.stoneDark);
      solid(P.x0 - 0.4, P.x0, P.floorY, 0, P.z0, P.z1, m.stone, { climb: true });
      solid(P.x1, P.x1 + 0.4, P.floorY, 0, P.z0, P.z1, m.stone, { climb: true });
      solid(P.x0, P.x1, P.floorY, 0, P.z0 - 0.4, P.z0, m.stone, { climb: true });
      solid(P.x0, P.x1, P.floorY, 0, P.z1, P.z1 + 0.4, m.stone, { climb: true });
      const water = new THREE.Mesh(
        own(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0)),
        own(new THREE.MeshStandardMaterial({ color: '#2f6f80', roughness: 0.06, transparent: true, opacity: 0.7 })),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set((P.x0 + P.x1) / 2, P.level, (P.z0 + P.z1) / 2);
      scene.add(water);
      sign(P.x1 + 1.2, P.z0 - 1, ['pool']);
    }
    const wade = LAB.pads.indexOf('water');
    player.water = {
      level: (x, z) => {
        if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) return P.level;
        const wx = padX(wade);
        if (Math.abs(x - wx) < 1.5 && z > LAB.padZ[0] && z < LAB.padZ[1]) return LAB.wadeLevel;
        return null;
      },
    };

    // ------------------------------------------------------------ checkpoint, route
    checkpoints.register({ id: 'start', order: 1, label: 'The lab', feet: LAB.start.clone(), facing: 0, impliesFlags: ['kicker.taken'], recoverBelowY: LAB.recoverY });
    progression.setObjective('Movement lab: try every station');

    const walks = gapWalkways();
    const gx = LAB.gapX;
    const gapRoute: RouteStep[] = [{ kind: 'move', to: [gx, 0, -3] }, { kind: 'move', to: [gx, LAB.gapTop, 1] }];
    walks.slice(0, 4).forEach(([, z1], i) => {
      const next = walks[i + 1];
      gapRoute.push({ kind: 'move', to: [gx, LAB.gapTop, z1 - 2.6], precise: true });
      // The last gap is at the running jump's limit: the route takes it with the double jump.
      gapRoute.push({ kind: 'jump', from: [gx, LAB.gapTop, z1 - 0.15], to: [gx, LAB.gapTop, next[0] + 1.2], double: LAB.gaps[i] > 3 });
    });
    const lx = LAB.ledgeX;
    const ledgeRoute: RouteStep[] = [
      { kind: 'move', to: [lx, 0, LAB.ledgeZ[0] - 3] },
      { kind: 'climb', from: [lx, 0, LAB.ledgeZ[0] - 1.1], to: [lx, LAB.ledges[0], LAB.ledgeZ[0]] },
      { kind: 'move', to: [lx, 0, LAB.ledgeZ[1] - 3] },
      { kind: 'climb', from: [lx, 0, LAB.ledgeZ[1] - 1.1], to: [lx, LAB.ledges[1], LAB.ledgeZ[1]] },
      { kind: 'move', to: [lx, 0, LAB.ledgeZ[2] - 3] },
      { kind: 'climb', from: [lx, 0, LAB.ledgeZ[2] - 1.1], to: [lx, LAB.ledges[2], LAB.ledgeZ[2]] },
    ];
    const vx = LAB.vaultX;
    const vaultRoute: RouteStep[] = [
      { kind: 'move', to: [vx, 0, LAB.vaultZ[0] - 3] },
      { kind: 'vault', from: [vx, 0, LAB.vaultZ[0] - 0.75], to: [vx, 0, LAB.vaultZ[0] + 1.5] },
      { kind: 'move', to: [vx, 0, LAB.vaultZ[1] - 3] },
      { kind: 'vault', from: [vx, 0, LAB.vaultZ[1] - 0.75], to: [vx, 0, LAB.vaultZ[1] + 1.5] },
    ];
    const { landings } = towerParts();
    const tx = LAB.towerX;
    const towerRoute: RouteStep[] = [
      { kind: 'move', to: [6, 0, -2] },
      { kind: 'move', to: [tx, 0, -2] },
      { kind: 'move', to: [tx, LAB.landings[0], landings[0][0] + 1.5] },
      { kind: 'move', to: [tx, LAB.landings[1], landings[1][0] + 1.5] },
      { kind: 'move', to: [tx, LAB.landings[2], landings[2][0] + 2] },
      // Off the east side: a 10 m drop.
      { kind: 'move', to: [tx + 3.5, 0, landings[2][0] + 2], radius: 0.8 },
    ];
    this.routeParts = { gaps: gapRoute, ledges: ledgeRoute, vaults: vaultRoute, tower: towerRoute };
    // Between the lanes: off the last walkway, then down the open corridor between the ledges and
    // the vaults (x -1.5) to the vault lane.
    const toVaults: RouteStep[] = [
      { kind: 'move', to: [gx + 3.5, 0, walks[4][1] - 1], radius: 0.8 },
      { kind: 'move', to: [-1.5, 0, walks[4][1] - 1] },
      { kind: 'move', to: [-1.5, 0, 0] },
    ];
    this.route = [...gapRoute, ...toVaults, ...vaultRoute, ...towerRoute];
    this.conditions = {
      plate: () => this.plateHits > 0,
    };
  }

  fixedUpdate(): void {
    const { player } = this.ctx;
    player.steam = true;
    if (player.feet.y < -30) this.ctx.respawn('fall');
  }

  update(dt: number): void {
    this.plateGlow = Math.max(0, this.plateGlow - dt * 0.8);
    this.plateLamp.emissiveIntensity = this.plateGlow * 2.2;
    // The sun's shadows follow Mara.
    const key = this.ctx.keyLight;
    const f = this.ctx.player.feet;
    key.target.position.set(Math.round(f.x), 0, Math.round(f.z));
    key.position.copy(key.target.position).addScaledVector(this.ctx.moonDir, 60);
    key.target.updateMatrixWorld();
  }

  reset(): void {
    this.plateHits = 0;
    this.maxImpact = 0;
    this.plateGlow = 0;
  }

  applyCheckpointState(): void {}

  hint(): void {
    this.ctx.dialogue.say('Tip', 'Each sign names its station. Fall anywhere and you come back here.', 4);
  }

  debugInfo(): Record<string, unknown> {
    return { plateHits: this.plateHits, maxImpact: +this.maxImpact.toFixed(1) };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}

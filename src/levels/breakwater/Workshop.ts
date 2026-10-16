import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '../../world/materials';
import type { Physics } from '../../physics/Physics';
import { glowSprite } from '../../world/props/Lanterns';
import { Batcher, boxProjectUVs, trs, worldBox } from '../../world/geometry';
import { mulberry32 } from '../../core/math';

/**
 * Mara's workshop in Saltmere, the night before: the set for the opening (an in-engine scene, not
 * a movie file). A small closed room built away from the prison and shown only during the opening:
 * plank floor, brick walls, a rain-streaked window over the harbour, the diversion plans on the
 * bench (stamped, crossed out in red), a model tide engine, tools, a clock, an oil lamp, a stool.
 *
 * It has no lights of its own (adding a light recompiles every material in the game): the level
 * lends it two of the cell's lights for the scene, one for the oil lamp and one for the window.
 */
export const WORKSHOP_ORIGIN = new THREE.Vector3(0, 40, 400);

/** Room size (metres) and the bench top height. */
const W = 5.2;
const D = 4.4;
const H = 3.0;
const TOP = 0.78;
/** Height of the passing figure's centre: head and shoulders cross the street lamp outside. */
const FIGURE_Y = 1.38;

export class Workshop {
  readonly group = new THREE.Group();
  /** Where Mara sits (feet), facing the bench (+Z). */
  readonly seat: THREE.Vector3;
  readonly seatFacing = 0;
  /** Where the lent lights go: the oil lamp's flame and just inside the window. */
  readonly lampLight: THREE.Vector3;
  readonly windowLight: THREE.Vector3;
  /** Points for the opening's camera (world space). */
  readonly at: (x: number, y: number, z: number) => THREE.Vector3;
  readonly benchZ = D / 2 - 0.55;
  private readonly lampGlow: THREE.Sprite;
  private readonly lampFlame: THREE.MeshStandardMaterial;
  private readonly poolMat: THREE.MeshBasicMaterial;
  private readonly rain: THREE.CanvasTexture;
  private readonly figure: THREE.Mesh;
  private readonly hand: THREE.Mesh;
  private lamp = 1;
  private lampTarget = 1;
  private brightness = 1;
  private figureT = -1;
  private time = 0;

  constructor(m: MaterialLibrary, physics: Physics) {
    const g = this.group;
    g.name = 'workshop';
    g.position.copy(WORKSHOP_ORIGIN);
    const o = WORKSHOP_ORIGIN;
    const rng = mulberry32(77);
    const benchZ = this.benchZ;
    const batch = new Batcher();
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) =>
      batch.add(worldBox(w, h, d, 2), mat, trs(x, y, z, ry));
    const piece = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) =>
      batch.add(geo, mat, trs(x, y, z, ry, rx, rz));
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const me = new THREE.Mesh(geo, mat);
      me.position.set(x, y, z);
      me.receiveShadow = true;
      g.add(me);
      return me;
    };

    // Room: plank floor, brick walls, a beamed ceiling; the window is in the bench wall (+Z).
    box(W, 0.1, D, m.wood, 0, -0.05, 0);
    box(W, 0.1, D, m.wood, 0, H + 0.05, 0);
    for (let i = -2; i <= 2; i++) box(0.16, 0.18, D, m.wood, i * 1.1, H - 0.09, 0);
    batch.add(boxProjectUVs(new THREE.BoxGeometry(0.2, H, D), 1.6), m.stone, trs(-W / 2 - 0.1, H / 2, 0));
    batch.add(boxProjectUVs(new THREE.BoxGeometry(0.2, H, D), 1.6), m.stone, trs(W / 2 + 0.1, H / 2, 0));
    batch.add(boxProjectUVs(new THREE.BoxGeometry(W, H, 0.2), 1.6), m.stone, trs(0, H / 2, -D / 2 - 0.1));
    // Front wall around the window opening (x -0.7..0.7, y 1.2..2.4).
    const side = W / 2 - 0.7;
    batch.add(boxProjectUVs(new THREE.BoxGeometry(side, H, 0.2), 1.6), m.stone, trs(-(0.7 + side / 2), H / 2, D / 2 + 0.1));
    batch.add(boxProjectUVs(new THREE.BoxGeometry(side, H, 0.2), 1.6), m.stone, trs(0.7 + side / 2, H / 2, D / 2 + 0.1));
    batch.add(boxProjectUVs(new THREE.BoxGeometry(1.4, 1.2, 0.2), 1.6), m.stone, trs(0, 0.6, D / 2 + 0.1));
    batch.add(boxProjectUVs(new THREE.BoxGeometry(1.4, H - 2.4, 0.2), 1.6), m.stone, trs(0, 2.4 + (H - 2.4) / 2, D / 2 + 0.1));
    // Window frame, sill and mullion.
    for (const x of [-0.72, 0.72]) box(0.08, 1.32, 0.14, m.wood, x, 1.8, D / 2 - 0.02);
    box(1.6, 0.07, 0.24, m.wood, 0, 1.17, D / 2 - 0.06);
    box(1.52, 0.07, 0.14, m.wood, 0, 2.43, D / 2 - 0.02);
    box(0.05, 1.2, 0.06, m.wood, 0, 1.8, D / 2 - 0.02);
    box(1.4, 0.05, 0.06, m.wood, 0, 1.8, D / 2 - 0.02);

    // The harbour at night beyond the glass (a street lamp just outside), and rain on the glass.
    const harbour = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshBasicMaterial({ map: harbourTexture(), fog: false }));
    harbour.position.set(0, 1.85, D / 2 + 1.6);
    harbour.rotation.y = Math.PI;
    g.add(harbour);
    this.rain = rainTexture();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ map: this.rain, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    glass.position.set(0, 1.8, D / 2 + 0.01);
    glass.rotation.y = Math.PI;
    g.add(glass);
    // A figure in a long coat and a cap will pass behind the glass.
    this.figure = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 2.0),
      new THREE.MeshBasicMaterial({ map: silhouetteTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0 }),
    );
    this.figure.position.set(-1.6, FIGURE_Y, D / 2 + 0.7);
    this.figure.rotation.y = Math.PI;
    g.add(this.figure);

    // The bench under the window: the plans, loose sheets, a model tide engine, a mug and a pencil.
    piece(new RoundedBoxGeometry(2.4, 0.07, 0.9, 2, 0.02), m.wood, 0, TOP - 0.035, benchZ);
    for (const [x, z] of [[-1.1, benchZ - 0.38], [1.1, benchZ - 0.38], [-1.1, benchZ + 0.38], [1.1, benchZ + 0.38]]) box(0.07, TOP - 0.07, 0.07, m.wood, x, (TOP - 0.07) / 2, z);
    box(2.2, 0.04, 0.6, m.wood, 0, 0.18, benchZ + 0.1);
    const plans = mesh(new THREE.PlaneGeometry(0.95, 0.66), new THREE.MeshStandardMaterial({ map: plansTexture(), roughness: 0.95 }), -0.12, TOP + 0.004, benchZ - 0.08);
    plans.rotation.set(-Math.PI / 2, 0, Math.PI + 0.08);
    const sheetMat = new THREE.MeshStandardMaterial({ map: notesTexture(), color: '#d9cdb0', roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const sheet = mesh(new THREE.PlaneGeometry(0.42, 0.3), sheetMat, 0.6 + rng() * 0.35, TOP + 0.002 + i * 0.002, benchZ + rng() * 0.3 - 0.12);
      sheet.rotation.set(-Math.PI / 2, 0, rng() * 0.8 - 0.4);
    }
    // Model tide engine: a brass column with a collar on a dark base, and a small flywheel.
    const mx = 0.85;
    const mz = benchZ + 0.22;
    piece(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24), m.ironDark, mx, TOP + 0.015, mz);
    piece(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 16), m.brass, mx, TOP + 0.2, mz);
    piece(new THREE.TorusGeometry(0.095, 0.016, 8, 24), m.brass, mx, TOP + 0.12, mz, 0, Math.PI / 2);
    piece(new THREE.TorusGeometry(0.075, 0.012, 6, 18), m.brass, mx + 0.13, TOP + 0.24, mz, Math.PI / 2);
    piece(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), m.iron, mx + 0.065, TOP + 0.24, mz, 0, 0, Math.PI / 2);
    piece(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), m.ceramic, -0.9, TOP + 0.05, benchZ - 0.22);
    piece(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), m.wood, 0.28, TOP + 0.008, benchZ - 0.22, 0.6, 0, Math.PI / 2);
    // Tools on the left wall, a shelf of jars, a coil of rope; a clock and a coat on the right wall.
    for (let i = 0; i < 6; i++) box(0.04, 0.28 + rng() * 0.22, 0.05, m.iron, -W / 2 + 0.03, 1.5 + rng() * 0.15, -1.2 + i * 0.3);
    box(0.3, 0.04, 1.6, m.wood, -W / 2 + 0.15, 2.05, 0.6);
    for (let i = 0; i < 5; i++) piece(new THREE.CylinderGeometry(0.06, 0.06, 0.14 + rng() * 0.08, 10), i % 2 ? m.ceramic : m.brass, -W / 2 + 0.15, 2.15, 0.05 + i * 0.28);
    piece(new THREE.TorusGeometry(0.22, 0.05, 8, 20), m.rope, -W / 2 + 0.35, 0.05, -1.5, 0, Math.PI / 2);
    piece(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), m.wood, W / 2 - 0.03, 2.1, 0.4, 0, 0, Math.PI / 2);
    const face = mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ color: '#e7dcc2', roughness: 0.9 }), W / 2 - 0.06, 2.1, 0.4);
    face.rotation.y = -Math.PI / 2;
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.13, 0.008), m.ironDark);
    this.hand.geometry.translate(0, 0.06, 0);
    this.hand.position.set(W / 2 - 0.07, 2.1, 0.4);
    this.hand.rotation.y = -Math.PI / 2;
    g.add(this.hand);
    mesh(new THREE.BoxGeometry(0.08, 1.15, 0.5), new THREE.MeshStandardMaterial({ color: '#6e4526', roughness: 1 }), W / 2 - 0.08, 1.45, -1.3);
    // The stool she sits on.
    const seatZ = benchZ - 0.98;
    // A low stool, sized for the toy-proportioned Mara (her hips sit about 0.33 m up).
    piece(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 16), m.wood, 0, 0.255, seatZ);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      piece(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 6), m.wood, Math.sin(a) * 0.13, 0.12, seatZ + Math.cos(a) * 0.13);
    }

    // The oil lamp: brass base, a glass chimney, an emissive flame, a glow and warm pools of light.
    const lx = -0.55;
    const lz = benchZ + 0.15;
    piece(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 14), m.brass, lx, TOP + 0.025, lz);
    piece(new THREE.SphereGeometry(0.06, 14, 10), m.brass, lx, TOP + 0.08, lz);
    const chimney = mesh(
      new THREE.CylinderGeometry(0.04, 0.055, 0.2, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: '#f6e7c8', transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      lx,
      TOP + 0.22,
      lz,
    );
    chimney.receiveShadow = false;
    this.lampFlame = new THREE.MeshStandardMaterial({ color: '#331a05', emissive: '#ffb050', emissiveIntensity: 6 });
    const flame = mesh(new THREE.SphereGeometry(0.018, 10, 8), this.lampFlame, lx, TOP + 0.17, lz);
    flame.scale.set(1, 1.9, 1);
    this.lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffbe6e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    this.lampGlow.scale.setScalar(0.8);
    this.lampGlow.position.set(lx, TOP + 0.18, lz);
    g.add(this.lampGlow);
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowSprite(), color: '#ff9a3c', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const [x, y, z, s, rx, ry] of [
      [lx + 0.1, TOP + 0.006, benchZ, 1.6, -Math.PI / 2, 0],
      [lx + 0.3, 0.012, benchZ - 0.9, 3.2, -Math.PI / 2, 0],
      [lx, 1.35, D / 2 - 0.005, 1.5, 0, Math.PI],
    ] as Array<[number, number, number, number, number, number]>) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(s, s), this.poolMat);
      pool.position.set(x, y, z);
      pool.rotation.set(rx, ry, 0);
      g.add(pool);
    }

    batch.build(g);
    // Floor collider so Mara can stand (sit) here: the level moves her in for the scene.
    physics.box(new THREE.Vector3(o.x, o.y - 0.05, o.z), new THREE.Vector3(W / 2, 0.05, D / 2));

    this.at = (x, y, z) => new THREE.Vector3(o.x + x, o.y + y, o.z + z);
    this.seat = this.at(0, 0, seatZ);
    this.lampLight = this.at(lx, TOP + 0.4, lz - 0.3);
    this.windowLight = this.at(0.35, 1.55, D / 2 - 0.3);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  /** Lamp level target, 0..1 (going out it gutters on the way down). */
  setLamp(on: number, instant = false): void {
    this.lampTarget = on;
    if (instant) this.lamp = on;
  }

  /** The lamp's brightness now, flicker included (the level scales the lent light by it). */
  get lampBrightness(): number {
    return this.brightness;
  }

  /** The figure walks up to the glass, stops to look in, and walks on (about 3.8 s). */
  passFigure(): void {
    this.figureT = 0;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    this.rain.offset.y -= dt * 0.3;
    // A ticking second hand.
    this.hand.rotation.x = -Math.floor(this.time) * ((Math.PI * 2) / 60);
    const out = this.lampTarget < this.lamp;
    this.lamp += (this.lampTarget - this.lamp) * (1 - Math.exp(-dt * (out ? 1.6 : 4)));
    const flicker = out && this.lamp > 0.04 ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 23) * Math.sin(this.time * 7.3)) : 0.94 + 0.06 * Math.sin(this.time * 9) * Math.sin(this.time * 3.1);
    const k = this.lamp * flicker;
    this.brightness = k;
    this.lampFlame.emissiveIntensity = 6 * k;
    (this.lampGlow.material as THREE.SpriteMaterial).opacity = 0.8 * k;
    this.poolMat.opacity = 0.16 * k;
    if (this.figureT >= 0) {
      this.figureT += dt;
      const t = this.figureT;
      // In from the left (1.3 s), a still beat in front of the street lamp (1.2 s), then away.
      const x = t < 1.3 ? -1.7 + (t / 1.3) * 1.55 : t < 2.5 ? -0.15 : -0.15 + ((t - 2.5) / 1.3) * 1.85;
      const walking = t < 1.3 || t > 2.5;
      this.figure.position.x = x;
      this.figure.position.y = FIGURE_Y + (walking ? Math.abs(Math.sin(t * Math.PI * 3.2)) * 0.03 : 0);
      const fade = Math.min(1, t / 0.3, Math.max(0, (3.8 - t) / 0.3));
      (this.figure.material as THREE.MeshBasicMaterial).opacity = 0.94 * fade;
      if (t >= 3.8) this.figureT = -1;
    }
  }
}

function harbourTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#0b1420');
  sky.addColorStop(0.52, '#1c2a38');
  sky.addColorStop(0.53, '#0a1118');
  sky.addColorStop(1, '#05080b');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 320);
  const rng = mulberry32(5);
  // Rooftops and a crane against the sky, lit windows, and the lamps' streaks on the water.
  g.fillStyle = '#070b10';
  for (let x = 0; x < 512; x += 30 + rng() * 40) {
    const h = 30 + rng() * 60;
    g.fillRect(x, 168 - h, 26 + rng() * 30, h);
  }
  g.fillRect(380, 60, 6, 110);
  g.fillRect(330, 60, 110, 5);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(255, ${170 + rng() * 60}, 90, ${0.5 + rng() * 0.5})`;
    g.fillRect(rng() * 512, 100 + rng() * 62, 3, 4);
  }
  for (let i = 0; i < 14; i++) {
    const x = rng() * 512;
    const grd = g.createLinearGradient(x, 172, x, 320);
    grd.addColorStop(0, 'rgba(255,190,110,0.5)');
    grd.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = grd;
    g.fillRect(x - 1, 172, 3, 148);
  }
  // A street lamp just outside: the figure passing in front of it is what the eye catches.
  const lamp = g.createRadialGradient(256, 150, 4, 256, 150, 150);
  lamp.addColorStop(0, 'rgba(255, 214, 150, 0.95)');
  lamp.addColorStop(0.15, 'rgba(255, 180, 100, 0.45)');
  lamp.addColorStop(1, 'rgba(255, 160, 80, 0)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, 512, 320);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  const rng = mulberry32(9);
  // Runs: a thin wavering trail, brightest at the bead that leads it down the glass.
  for (let i = 0; i < 70; i++) {
    const x0 = rng() * 256;
    const y0 = rng() * 512;
    const len = 20 + rng() * 90;
    const trail = g.createLinearGradient(0, y0, 0, y0 + len);
    trail.addColorStop(0, 'rgba(205, 222, 235, 0)');
    trail.addColorStop(1, `rgba(205, 222, 235, ${0.1 + rng() * 0.16})`);
    g.strokeStyle = trail;
    g.lineWidth = 0.7 + rng() * 0.8;
    g.beginPath();
    g.moveTo(x0, y0);
    let x = x0;
    for (let k = 1; k <= 6; k++) {
      x += rng() * 2.4 - 1.2;
      g.lineTo(x, y0 + (len * k) / 6);
    }
    g.stroke();
    g.fillStyle = `rgba(225, 236, 245, ${0.25 + rng() * 0.25})`;
    g.beginPath();
    g.ellipse(x, y0 + len, 1.3 + rng(), 1.8 + rng(), 0, 0, Math.PI * 2);
    g.fill();
  }
  // Still beads.
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(215, 230, 240, ${0.08 + rng() * 0.2})`;
    g.beginPath();
    g.arc(rng() * 256, rng() * 512, 0.6 + rng() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.2, 0.9);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Mara's working notes on the loose sheets: lines of pencil, a sum and a sketch. */
function notesTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 192);
  const rng = mulberry32(31);
  g.strokeStyle = 'rgba(40, 40, 50, 0.55)';
  g.lineWidth = 1.2;
  for (let line = 0; line < 9; line++) {
    const y = 22 + line * 17;
    let x = 16;
    const end = 150 + rng() * 90;
    g.beginPath();
    g.moveTo(x, y);
    while (x < end) {
      x += 3 + rng() * 5;
      g.lineTo(x, y + rng() * 3 - 1.5);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(40, 40, 50, 0.6)';
  g.beginPath();
  g.arc(200, 150, 22, 0, Math.PI * 2);
  g.moveTo(178, 150);
  g.lineTo(222, 150);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function silhouetteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 270;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(2, 3, 5)';
  // A cap, the head, the shoulders and a long coat.
  g.beginPath();
  g.ellipse(64, 42, 19, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(64, 24, 30, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(24, 82);
  g.quadraticCurveTo(64, 58, 104, 82);
  g.lineTo(114, 266);
  g.lineTo(14, 266);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plansTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 360;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a4a6b';
  g.fillRect(0, 0, 512, 360);
  g.strokeStyle = 'rgba(220, 235, 250, 0.75)';
  g.lineWidth = 2;
  // The coast, the low quarter's streets, and the diversion channel cutting through them.
  g.beginPath();
  g.moveTo(10, 250);
  g.bezierCurveTo(120, 230, 200, 280, 300, 250);
  g.bezierCurveTo(380, 225, 440, 260, 502, 240);
  g.stroke();
  for (let i = 0; i < 18; i++) g.strokeRect(140 + (i % 6) * 26, 120 + Math.floor(i / 6) * 26, 20, 20);
  g.setLineDash([8, 6]);
  g.beginPath();
  g.moveTo(60, 60);
  g.lineTo(190, 150);
  g.lineTo(250, 250);
  g.stroke();
  g.setLineDash([]);
  g.font = 'bold 22px "Courier New", monospace';
  g.fillStyle = 'rgba(220, 235, 250, 0.85)';
  g.fillText('DIVERSION No. 7', 300, 50);
  g.font = '15px "Courier New", monospace';
  g.fillText('LOW QUARTER', 150, 110);
  g.fillText('CERTIFY: ______', 320, 330);
  // Mara's red pencil: the district circled, the plan crossed out, a note.
  g.strokeStyle = 'rgba(210, 40, 30, 0.9)';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(210, 160, 95, 70, -0.1, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(40, 40);
  g.lineTo(470, 320);
  g.moveTo(470, 40);
  g.lineTo(40, 320);
  g.stroke();
  g.font = 'italic bold 26px Georgia, serif';
  g.fillStyle = 'rgba(210, 40, 30, 0.95)';
  g.fillText('floods at high tide!', 250, 200);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

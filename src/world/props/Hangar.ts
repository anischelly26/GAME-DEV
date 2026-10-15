import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { glowSprite } from './Lanterns';

/**
 * The old seaplane hangar on a rock spur of Breakwater, seen from the breach at the end of Chapter
 * One: an arched shed with its doors half open, an old floatplane inside, a slipway down to the
 * water, a windsock and a red roof light. Everything is procedural and original.
 *
 * It is a distant set piece (40-90 m from the player), so its materials ignore the fog and carry
 * their own aerial-perspective tint, like the harbour beyond. `setLit(true)` brings up the work
 * lights inside, which silhouette the aircraft, as the intercom points it out.
 */
export class Hangar {
  readonly group = new THREE.Group();
  /** Where a camera should look to frame the aircraft in its doorway (world space). */
  readonly focus = new THREE.Vector3();
  private readonly interior: THREE.MeshStandardMaterial;
  private readonly lampMat: THREE.MeshStandardMaterial;
  private readonly glows: THREE.Sprite[] = [];
  private readonly roofLight: THREE.MeshStandardMaterial;
  private readonly windsock: THREE.Group;
  private lit = 0;
  private litTarget = 0;
  private time = 0;

  constructor(position: THREE.Vector3, facing: number) {
    const g = this.group;
    g.name = 'hangar';
    g.position.copy(position);
    g.rotation.y = facing;
    const rng = mulberry32(31);
    const mat = (color: string, emissive = '#0a1216', ei = 0.5, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, fog: false, emissive, emissiveIntensity: ei, flatShading: true, ...extra });

    // Rock spur rising from the sea (y -12) to the apron (y 0).
    const rockGeo = new THREE.CylinderGeometry(15, 22, 15, 11, 3);
    const pos = rockGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 7.4) {
        const k = 0.82 + rng() * 0.36;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
        pos.setY(i, y + (rng() - 0.5) * 2);
      }
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(rockGeo, mat('#1f2c31', '#0b1519', 0.6));
    rock.position.y = -7.6;
    g.add(rock);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 30), mat('#3d4549', '#121a1e', 0.5));
    apron.position.set(0, -0.3, 1);
    g.add(apron);

    // The shed: an arched roof on low side walls, open toward +z (the sea).
    const shedMat = mat('#59605f', '#151d20', 0.55);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 20, 18, 1, true, -Math.PI / 2, Math.PI), shedMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, 3, -2);
    roof.material = shedMat.clone();
    (roof.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(roof);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 20), shedMat);
      wall.position.set(s * 8.4, 1.5, -2);
      g.add(wall);
    }
    // Ribs over the arch.
    const ribMat = mat('#2a3134', '#0d1416', 0.5);
    for (let i = 0; i <= 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.18, 4, 18, Math.PI), ribMat);
      rib.position.set(0, 3, -12 + i * 4);
      g.add(rib);
    }
    // Back wall (a half disc) with the warm interior glow that silhouettes the aircraft.
    this.interior = mat('#2b2219', '#ffb866', 0.05);
    const back = new THREE.Mesh(new THREE.CircleGeometry(8.3, 18, 0, Math.PI), this.interior);
    back.position.set(0, 3, -11.8);
    g.add(back);
    const backLow = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 3), this.interior);
    backLow.position.set(0, 1.5, -11.8);
    g.add(backLow);
    // Doors: two leaves rolled half open, painted with a faded number.
    const doorMat = mat('#4d4a43', '#13191b', 0.5);
    for (const s of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(4.0, 9.5, 0.3), doorMat);
      door.position.set(s * 7.0, 4.2, 8.2);
      g.add(door);
    }
    const number = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: numberTexture('3'), transparent: true, fog: false }));
    number.position.set(-7.0, 6.4, 8.37);
    g.add(number);

    // Work lamps along the inside of the arch (glows; no real lights at this distance).
    this.lampMat = mat('#2a2622', '#ffd49a', 0.1);
    for (const z of [-8, -3, 2]) {
      for (const s of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), this.lampMat);
        lamp.position.set(s * 6.2, 7.2, z);
        g.add(lamp);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: '#ffcf8f', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
        glow.position.copy(lamp.position);
        glow.scale.setScalar(4.5);
        g.add(glow);
        this.glows.push(glow);
      }
    }

    // The aircraft: an old two-seat floatplane, nose toward the doors.
    const plane = buildFloatplane(mat);
    plane.position.set(0, 2.9, -0.5);
    plane.rotation.y = 0.12;
    plane.scale.setScalar(1.35);
    g.add(plane);

    // Slipway from the apron down into the sea.
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 22), mat('#353b3c', '#0e1517', 0.5));
    ramp.position.set(0, -5.6, 20.5);
    ramp.rotation.x = 0.5;
    g.add(ramp);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 22), ribMat);
      rail.position.set(s * 2.6, -5.25, 20.5);
      rail.rotation.x = 0.5;
      g.add(rail);
    }

    // Red roof light and a windsock on a mast.
    this.roofLight = mat('#401010', '#ff3a2a', 2, { flatShading: false });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), this.roofLight);
    beacon.position.set(0, 11.9, 6);
    g.add(beacon);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 9, 6), ribMat);
    mast.position.set(10.5, 4.5, 10);
    g.add(mast);
    this.windsock = new THREE.Group();
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 10, 1, true), mat('#c4652c', '#3a1608', 0.6, { side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2;
    sock.position.x = 1.6;
    this.windsock.add(sock);
    this.windsock.position.set(10.5, 8.7, 10);
    g.add(this.windsock);

    g.updateMatrixWorld(true);
    this.focus.set(0, 3.2, 4).applyMatrix4(g.matrixWorld);
  }

  /** Bring the work lights up (over about two seconds) or down. */
  setLit(on: boolean, instant = false): void {
    this.litTarget = on ? 1 : 0;
    if (instant) this.lit = this.litTarget;
  }

  get isLit(): boolean {
    return this.litTarget > 0;
  }

  update(dt: number): void {
    this.time += dt;
    // Lamps come on one after another with a flicker, like old ballast warming up.
    this.lit += (this.litTarget - this.lit) * (1 - Math.exp(-dt * 1.6));
    const flicker = this.lit > 0.05 && this.lit < 0.8 ? 0.6 + 0.4 * Math.sin(this.time * 37) * Math.sin(this.time * 11) : 1;
    this.interior.emissiveIntensity = 0.05 + this.lit * 0.75 * flicker;
    this.lampMat.emissiveIntensity = 0.1 + this.lit * 5 * flicker;
    this.glows.forEach((glow, i) => {
      const k = THREE.MathUtils.clamp(this.lit * 1.6 - i * 0.1, 0, 1);
      (glow.material as THREE.SpriteMaterial).opacity = k * 0.85 * flicker;
    });
    this.roofLight.emissiveIntensity = Math.sin(this.time * 2.4) > 0.7 ? 4 : 0.4;
    this.windsock.rotation.y = 0.4 + Math.sin(this.time * 0.7) * 0.15;
    this.windsock.rotation.z = -0.15 + Math.sin(this.time * 1.9) * 0.05;
  }
}

function buildFloatplane(mat: (color: string, emissive?: string, ei?: number, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial): THREE.Group {
  const plane = new THREE.Group();
  const body = mat('#b9ab8e', '#2a2216', 0.35);
  const wingMat = mat('#8c3b2c', '#2a0e09', 0.4);
  const dark = mat('#26292a', '#0a0c0d', 0.4);
  // Fuselage, tapering to the tail (along -z).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.25, 7.4, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = -1.7;
  plane.add(fuselage);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.78, 1.2, 14), dark);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = 2.4;
  plane.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 10), dark);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 3.25;
  plane.add(spinner);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 0.06), dark);
    blade.rotation.z = a + 0.3;
    blade.position.z = 3.05;
    plane.add(blade);
  }
  // Cockpit cut-outs and a windscreen.
  for (const z of [0.6, -0.9]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), dark);
    seat.position.set(0, 0.7, z);
    plane.add(seat);
  }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45), new THREE.MeshStandardMaterial({ color: '#9fb8c4', roughness: 0.1, metalness: 0.4, fog: false, transparent: true, opacity: 0.6 }));
  screen.position.set(0, 0.95, 1.15);
  screen.rotation.x = -0.4;
  plane.add(screen);
  // Biplane wings with struts.
  const upper = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.14, 1.7), wingMat);
  upper.position.set(0, 1.55, 0.8);
  plane.add(upper);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.14, 1.55), wingMat);
  lower.position.set(0, -0.35, 0.95);
  plane.add(lower);
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), dark);
    strut.position.set(x, 0.6, 0.85);
    strut.rotation.z = x * 0.02;
    plane.add(strut);
  }
  // Tail.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 1.2), wingMat);
  fin.position.set(0, 0.75, -5.1);
  plane.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.0), wingMat);
  stab.position.set(0, 0.15, -5.0);
  plane.add(stab);
  // Floats on struts.
  for (const s of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 4.6, 4, 10), body);
    float.rotation.x = Math.PI / 2;
    float.position.set(s * 1.5, -1.75, 0.5);
    plane.add(float);
    for (const z of [1.6, -0.6]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5), dark);
      leg.position.set(s * 1.1, -1.05, z);
      leg.rotation.z = s * 0.35;
      plane.add(leg);
    }
  }
  return plane;
}

function numberTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(225, 205, 160, 0.75)';
  g.font = 'bold 110px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

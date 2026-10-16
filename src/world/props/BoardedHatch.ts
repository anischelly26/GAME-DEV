import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MaterialLibrary } from '../materials';
import type { Physics } from '../../physics/Physics';

/**
 * Old planks nailed over a floor hatch. Walking or jumping on them does nothing; a ground pound
 * (the steam kicker's slam) splinters them and shows what was underneath. They tumble away and
 * fade; "Restart section" nails them back down.
 */
export class BoardedHatch {
  readonly group = new THREE.Group();
  readonly collider: RAPIER.Collider;
  /** Centre of the boards, on the floor. */
  readonly centre: THREE.Vector3;
  private readonly boards = new THREE.Group();
  private readonly pieces: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; home: THREE.Matrix4 }> = [];
  private readonly hole: THREE.Mesh;
  private brokenT = -1;
  broken = false;

  constructor(physics: Physics, m: MaterialLibrary, centre: THREE.Vector3, yaw: number) {
    this.centre = centre.clone();
    this.group.position.copy(centre);
    this.group.rotation.y = yaw;
    // The hatch underneath: a dark square with an iron rim (the chalk mark is drawn on its floor).
    this.hole = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), new THREE.MeshStandardMaterial({ color: '#0b0d0e', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.hole.rotation.x = -Math.PI / 2;
    this.hole.position.y = 0.004;
    this.group.add(this.hole);
    for (const [x, z, w, d] of [
      [0, -0.5, 1.08, 0.06],
      [0, 0.5, 1.08, 0.06],
      [-0.5, 0, 0.06, 1.0],
      [0.5, 0, 0.06, 1.0],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), m.ironDark);
      rim.position.set(x, 0.015, z);
      this.group.add(rim);
    }
    // Four planks and two battens, nailed slightly askew.
    const plank = new THREE.BoxGeometry(0.24, 0.05, 1.08);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(plank, m.wood);
      p.position.set(-0.39 + i * 0.26, 0.055, (i % 2 ? 0.02 : -0.02));
      p.rotation.y = (i - 1.5) * 0.02;
      p.castShadow = p.receiveShadow = true;
      this.boards.add(p);
    }
    for (const z of [-0.32, 0.32]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.04, 0.12), m.wood);
      b.position.set(0, 0.1, z);
      b.rotation.y = z * 0.08;
      b.castShadow = true;
      this.boards.add(b);
    }
    this.group.add(this.boards);
    this.group.updateMatrixWorld(true);
    for (const child of this.boards.children) {
      const mesh = child as THREE.Mesh;
      this.pieces.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), home: mesh.matrix.clone() });
    }
    this.collider = physics.box(centre.clone().setY(centre.y + 0.06), new THREE.Vector3(0.54, 0.06, 0.54), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    physics.setSurface(this.collider, 'wood');
  }

  /** Splinter the boards (a ground pound landed on them). */
  smash(): void {
    if (this.broken) return;
    this.broken = true;
    this.brokenT = 0;
    this.collider.setEnabled(false);
    this.pieces.forEach((p, i) => {
      const a = (i / this.pieces.length) * Math.PI * 2 + 0.4;
      p.vel.set(Math.cos(a) * (1.6 + Math.random()), 2.6 + Math.random() * 1.6, Math.sin(a) * (1.6 + Math.random()));
      p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
    });
  }

  update(dt: number): void {
    if (this.brokenT < 0) return;
    this.brokenT += dt;
    const fade = Math.max(0, 1 - Math.max(0, this.brokenT - 0.9) / 0.5);
    for (const p of this.pieces) {
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // Planks settle on the walkway around the hatch rather than falling through it.
      if (p.mesh.position.y < 0.03 && p.vel.y < 0) {
        p.mesh.position.y = 0.03;
        p.vel.multiplyScalar(0.35);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.spin.multiplyScalar(0.5);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      p.mesh.scale.setScalar(Math.max(0.001, fade));
    }
    if (fade <= 0) {
      this.boards.visible = false;
      this.brokenT = -1;
    }
  }

  reset(): void {
    this.broken = false;
    this.brokenT = -1;
    this.collider.setEnabled(true);
    this.boards.visible = true;
    for (const p of this.pieces) {
      p.home.decompose(p.mesh.position, p.mesh.quaternion, p.mesh.scale);
      p.vel.set(0, 0, 0);
    }
  }
}

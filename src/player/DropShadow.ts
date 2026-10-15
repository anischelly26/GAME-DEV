import * as THREE from 'three';
import type { RAPIER } from '../physics/Physics';
import { Layer, groups, type Physics } from '../physics/Physics';
import { clamp } from '../core/math';

/** Solid ground only: railings and bars (NOCAM) would put the shadow in mid-air. */
const SHADOW_QUERY = groups(Layer.PLAYER, Layer.WORLD | Layer.PROP);
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A soft shadow straight below Mara. In the air it marks exactly where she will come down, which
 * the moonlight's slanted shadow does not; on the ground it is a faint contact shadow.
 */
export class DropShadow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly origin = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      color: '#000000',
      transparent: true,
      depthWrite: false,
      opacity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Height of the ground below the last update, or null when nothing is within range. */
  groundY: number | null = null;

  update(physics: Physics, feet: THREE.Vector3, grounded: boolean, exclude: RAPIER.Collider, visible: boolean): void {
    this.origin.copy(feet).y += 0.1;
    const hit = visible ? physics.raycast(this.origin, DOWN, 14, SHADOW_QUERY, exclude) : null;
    if (!hit) {
      this.mesh.visible = false;
      this.groundY = null;
      return;
    }
    const height = Math.max(0, hit.distance - 0.1);
    this.groundY = feet.y - height;
    this.mesh.visible = true;
    this.mesh.position.set(feet.x, this.groundY + 0.015, feet.z);
    this.mesh.quaternion.setFromUnitVectors(UP, hit.normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    // Strongest while airborne within jumping height; faint as a contact shadow; fades with height.
    const air = grounded ? 0 : 1;
    this.material.opacity = grounded ? 0.32 : 0.55 * (1 - clamp((height - 2.5) / 6, 0, 1));
    this.mesh.scale.setScalar(1 - 0.35 * clamp(height / 4, 0, 1) * air);
  }
}

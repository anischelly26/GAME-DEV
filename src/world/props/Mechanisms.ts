import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Chain of alternating links along -Y, `length` metres long. */
export function chainGeometry(length: number, linkSize = 0.09): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const step = linkSize * 1.45;
  const n = Math.max(1, Math.floor(length / step));
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(linkSize * 0.5, linkSize * 0.13, 4, 8);
    g.scale(0.75, 1.25, 1);
    if (i % 2) g.rotateY(Math.PI / 2);
    g.translate(0, -i * step - linkSize * 0.6, 0);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/** A chain mesh hung from `top`, re-aimable at a moving `bottom`. */
export class Chain {
  readonly mesh: THREE.Mesh;
  private readonly baseLength: number;
  private static readonly DOWN = new THREE.Vector3(0, -1, 0);

  constructor(material: THREE.Material, private readonly top: THREE.Vector3, bottom: THREE.Vector3, linkSize = 0.09) {
    this.baseLength = top.distanceTo(bottom);
    this.mesh = new THREE.Mesh(chainGeometry(this.baseLength, linkSize), material);
    this.mesh.castShadow = true;
    this.mesh.position.copy(top);
    this.aim(bottom);
  }

  aim(bottom: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(bottom, this.top);
    const len = dir.length();
    this.mesh.quaternion.setFromUnitVectors(Chain.DOWN, dir.normalize());
    this.mesh.scale.set(1, len / this.baseLength, 1);
  }
}

/** Pipe along a smooth curve through `points`, with flanges at both ends. */
export function pipeAlong(points: THREE.Vector3[], radius: number, material: THREE.Material, flangeMaterial?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 10), radius, 12, false), material);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);
  if (flangeMaterial) {
    for (const t of [0, 1]) {
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, 0.05, 12), flangeMaterial);
      flange.position.copy(p);
      flange.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      flange.castShadow = true;
      g.add(flange);
    }
  }
  return g;
}

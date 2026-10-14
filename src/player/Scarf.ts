import * as THREE from 'three';

const SEG_LEN = 0.075;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const right = new THREE.Vector3();
const anchorPos = new THREE.Vector3();
const bodyCenter = new THREE.Vector3();

/**
 * A trailing end of Mara's scarf: a short Verlet chain rendered as a tapered ribbon.
 * Purely cosmetic, but it makes speed, direction changes and jumps readable at a glance.
 */
export class Scarf {
  readonly mesh: THREE.Mesh;
  private readonly points: THREE.Vector3[] = [];
  private readonly prev: THREE.Vector3[] = [];
  private readonly positions: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private initialised = false;
  private time = 0;

  private readonly segments: number;
  private readonly width: number;

  constructor(material: THREE.Material, segments = 7, width = 0.085) {
    this.segments = segments;
    this.width = width;
    const SEGMENTS = segments;
    for (let i = 0; i <= SEGMENTS; i++) {
      this.points.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
    const index: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      uvs.set([0, i / SEGMENTS, 1, i / SEGMENTS], i * 4);
      if (i < SEGMENTS) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(index);
    const mat = (material as THREE.MeshStandardMaterial).clone();
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(this.geometry, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  update(dt: number, anchor: THREE.Object3D, body: THREE.Object3D, speed: number): void {
    const SEGMENTS = this.segments;
    const WIDTH = this.width;
    this.time += dt;
    anchor.getWorldPosition(anchorPos);
    if (!this.initialised || anchorPos.distanceTo(this.points[0]) > 2) {
      for (let i = 0; i <= SEGMENTS; i++) {
        this.points[i].set(anchorPos.x, anchorPos.y - i * SEG_LEN, anchorPos.z);
        this.prev[i].copy(this.points[i]);
      }
      this.initialised = true;
    }
    const step = Math.min(dt, 1 / 30);
    // Gentle draught in the Well plus flutter that grows with speed.
    const flutter = 0.6 + speed * 0.25;
    const wind = tmp2.set(Math.sin(this.time * 1.7) * 0.4, Math.sin(this.time * 7.3) * 0.15 * flutter, Math.cos(this.time * 1.3) * 0.3);
    body.getWorldPosition(bodyCenter);
    bodyCenter.y += 1.12;

    this.points[0].copy(anchorPos);
    for (let i = 1; i <= SEGMENTS; i++) {
      const p = this.points[i];
      const pr = this.prev[i];
      tmp.subVectors(p, pr).multiplyScalar(0.92);
      pr.copy(p);
      p.add(tmp);
      p.addScaledVector(wind, step * step * 0.6);
      p.y -= 5.5 * step * step;
    }
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 1; i <= SEGMENTS; i++) {
        const a = this.points[i - 1];
        const b = this.points[i];
        tmp.subVectors(b, a);
        const len = tmp.length() || 1e-6;
        const diff = (len - SEG_LEN) / len;
        if (i === 1) b.addScaledVector(tmp, -diff);
        else {
          a.addScaledVector(tmp, diff * 0.5);
          b.addScaledVector(tmp, -diff * 0.5);
        }
      }
      this.points[0].copy(anchorPos);
      // Keep the scarf outside the torso.
      for (let i = 1; i <= SEGMENTS; i++) {
        const p = this.points[i];
        tmp.subVectors(p, bodyCenter);
        tmp.y *= 0.45;
        const d = tmp.length();
        if (d < 0.24) p.addScaledVector(tmp.normalize(), 0.24 - d);
      }
    }

    // Ribbon width along the body's right axis.
    right.set(1, 0, 0).applyQuaternion(body.quaternion);
    for (let i = 0; i <= SEGMENTS; i++) {
      const w = WIDTH * (1 - (i / SEGMENTS) * 0.35);
      const p = this.points[i];
      const offset = i === 0 ? 0 : Math.sin(this.time * 9 + i) * 0.006 * flutter;
      this.positions.set([p.x - right.x * w * 0.5, p.y - right.y * w * 0.5 + offset, p.z - right.z * w * 0.5], i * 6);
      this.positions.set([p.x + right.x * w * 0.5, p.y + right.y * w * 0.5 + offset, p.z + right.z * w * 0.5], i * 6 + 3);
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

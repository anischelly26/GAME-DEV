import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Layer, groups, type Physics } from '../physics/Physics';
import type { MaterialLibrary } from '../world/materials';
import { glowSprite } from '../world/props/Lanterns';

/**
 * A Watch automaton: Breakwater's steam-driven sentry. It rolls round a circular patrol (the
 * engine collar's deck) sweeping a searchlight, stops now and then to look back, and fills a
 * suspicion meter while it can see Mara: inside its cone, in range, nothing solid in between. Full,
 * it raises the alarm and gives chase round the ring; if it reaches her she is caught (returned to
 * the checkpoint). Out of sight for a while, it gives up and goes back to its round. A ground pound
 * beside it knocks it out for a few seconds. It never hurts her.
 *
 * Pure rules live in `step()` (deterministic, fixed step); `update()` animates.
 */
export type SentryState = 'patrol' | 'look' | 'alert' | 'search' | 'stunned';

export interface SentryRing {
  /** The group the sentry rides on (its local frame is centred on the ring). */
  parent: THREE.Object3D;
  /** World height of the deck now. */
  deckY: () => number;
  radius: number;
}

const SPEED = 1.25;
const CHASE = 3.1;
const RANGE = 7.5;
const HALF_ANGLE = 0.44;
/** Close up it notices her in a much wider arc (no walking into someone it missed with the lamp). */
const NEAR = 1.9;
const NEAR_HALF_ANGLE = 1.25;
/** The "!" shows this long before it can grab her. */
const GRAB_AFTER = 0.35;
const EYE_HEIGHT = 1.42;
const LOOK_EVERY = 6.5;
const LOOK_FOR = 2.2;
const STUN_FOR = 6;
const GIVE_UP = 2.6;

/** The searchlight cone: additive, strongest at the lamp, fading along its length and at its rim. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#ffcf7a') }, opacity: { value: 0.22 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float a = opacity * pow(vAlong, 1.6) * pow(facing, 1.4);
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export class WatchSentry {
  readonly group = new THREE.Group();
  readonly collider: RAPIER.Collider;
  state: SentryState = 'patrol';
  /** 0..1: how sure it is that it saw someone. */
  suspicion = 0;
  /** Angle round the ring (radians, atan2(x, z)) and direction of travel (+1 / -1). */
  angle: number;
  dir = 1;
  /** Times caught and stunned (tests). */
  catches = 0;
  stuns = 0;
  /** Sentries can be switched off (automated route tests). */
  enabled = true;
  private readonly head = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly pool: THREE.Mesh;
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private readonly icon: THREE.Sprite;
  private readonly iconTex: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; shown: string };
  private patrolT = 0;
  private stateT = 0;
  private lookYaw = 0;
  private headYaw = 0;
  private unseenT = 0;
  private graceT = 0;
  private time = 0;
  private readonly home: number;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    m: MaterialLibrary,
    private readonly ring: SentryRing,
    startAngle: number,
  ) {
    this.angle = this.home = startAngle;
    const g = this.group;
    g.name = 'watch-sentry';
    // A drum on a single broad wheel, a riveted brass boiler, a domed iron head with one big lamp.
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const wheel = add(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24), m.ironDark, 0, 0.22, 0);
    wheel.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 24), m.ironDark, 0, 0.42, 0);
    add(new THREE.CylinderGeometry(0.31, 0.33, 0.62, 24), m.brass, 0, 0.84, 0);
    for (const y of [0.6, 0.84, 1.08]) add(new THREE.TorusGeometry(0.325, 0.022, 6, 28), m.ironDark, 0, y, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10), m.ironDark, 0, 1.15, -0.28);
    for (const s of [-1, 1]) {
      const arm = add(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 10), m.iron, s * 0.38, 0.92, 0.06);
      arm.rotation.z = s * 0.5;
      add(new THREE.SphereGeometry(0.07, 12, 10), m.ironDark, s * 0.36, 1.08, 0.04);
      add(new THREE.SphereGeometry(0.06, 12, 10), m.brass, s * 0.47, 0.74, 0.1);
    }
    this.head.position.set(0, 1.2, 0);
    g.add(this.head);
    add(new THREE.SphereGeometry(0.25, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.ironDark, 0, 0, 0, this.head);
    add(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24), m.iron, 0, -0.05, 0, this.head);
    const capMat = new THREE.MeshStandardMaterial({ color: '#1f2c3a', roughness: 0.7 });
    add(new THREE.CylinderGeometry(0.3, 0.24, 0.13, 28), capMat, 0, 0.27, -0.02, this.head);
    add(new THREE.TorusGeometry(0.245, 0.018, 6, 28), m.brass, 0, 0.22, -0.02, this.head).rotation.x = Math.PI / 2;
    const visor = add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24, 1, false, -Math.PI / 2, Math.PI), m.ironDark, 0, 0.21, 0.08, this.head);
    visor.rotation.x = 0.18;
    visor.scale.set(1, 1, 0.8);
    add(new THREE.CircleGeometry(0.045, 12), m.brass, 0, 0.29, 0.255, this.head).rotation.x = -0.25;
    // Chest badge and a ring of cell keys on its belt.
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 6), m.brass, 0.12, 1.0, 0.31).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.07, 0.012, 6, 16), m.iron, -0.24, 0.55, 0.26).rotation.y = 0.6;
    for (const a of [-0.5, 0, 0.5]) {
      const key = add(new THREE.BoxGeometry(0.018, 0.11, 0.006), m.brass, -0.24 + Math.sin(a) * 0.05, 0.46, 0.27 + Math.cos(a) * 0.01);
      key.rotation.z = a;
    }
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#2a1a08', emissive: '#ffb347', emissiveIntensity: 2.4, roughness: 0.2 });
    add(new THREE.CylinderGeometry(0.11, 0.12, 0.08, 20), m.brass, 0, 0.06, 0.22, this.head).rotation.x = Math.PI / 2;
    add(new THREE.CircleGeometry(0.095, 20), this.eyeMat, 0, 0.06, 0.262, this.head);
    // The searchlight: a soft cone and a pool where it meets the deck.
    this.beamMat = beamMaterial();
    const cone = new THREE.ConeGeometry(Math.tan(HALF_ANGLE) * 5, 5, 24, 1, true);
    cone.translate(0, -2.5, 0);
    cone.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(cone, this.beamMat);
    this.beam.position.set(0, 0.06, 0.26);
    this.beam.rotation.x = -0.18;
    this.head.add(this.beam);
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ map: glowSprite(), color: '#ffcf7a', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pool.rotation.x = -Math.PI / 2;
    g.add(this.pool);
    // "?" and "!" above its head.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.iconTex = { canvas, texture, shown: '' };
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.icon.position.set(0, 1.85, 0);
    this.icon.scale.setScalar(0.42);
    this.icon.visible = false;
    this.icon.renderOrder = 5;
    g.add(this.icon);
    ring.parent.add(g);
    this.collider = physics.cylinder({ x: 0, y: 0, z: 0 }, 0.75, 0.36);
    // Solid to Mara only: the camera passes through it, and so does its own sight ray.
    this.collider.setCollisionGroups(groups(Layer.WORLD, Layer.PLAYER));
    this.place();
  }

  /** Back to its round, far from where Mara comes back (after a catch, a respawn or a restart). */
  reset(angle = this.home): void {
    this.angle = angle;
    this.state = 'patrol';
    this.suspicion = 0;
    this.patrolT = 0;
    this.stateT = 0;
    this.unseenT = 0;
    this.headYaw = 0;
    this.graceT = 3;
    this.dir = 1;
    this.place();
  }

  /** A ground pound landed at `at`: knocked out if it was close. */
  pound(at: THREE.Vector3Like): boolean {
    const p = this.position();
    if (Math.hypot(at.x - p.x, at.z - p.z) > 1.7 || Math.abs(at.y - p.y) > 1.6 || this.state === 'stunned') return false;
    this.state = 'stunned';
    this.stateT = 0;
    this.suspicion = 0;
    this.stuns++;
    return true;
  }

  position(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.angle) * this.ring.radius, this.ring.deckY(), Math.cos(this.angle) * this.ring.radius);
  }

  /** Where it is looking (unit vector, world). */
  facing(out = new THREE.Vector3()): THREE.Vector3 {
    const travel = Math.atan2(Math.cos(this.angle) * this.dir, -Math.sin(this.angle) * this.dir);
    const yaw = travel + this.headYaw;
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }

  /**
   * One fixed step. `chest`: Mara's chest; `inZone`: whether she is where this sentry can act (on
   * its deck or at its boarding gap). Returns 'alert' the step it raises the alarm, 'caught' the
   * step it reaches her.
   */
  step(dt: number, chest: THREE.Vector3, inZone: boolean, exclude: RAPIER.Collider): 'alert' | 'caught' | null {
    this.time += dt;
    this.stateT += dt;
    this.graceT = Math.max(0, this.graceT - dt);
    let event: 'alert' | 'caught' | null = null;
    if (!this.enabled) {
      this.place();
      return null;
    }
    if (this.state === 'stunned') {
      if (this.stateT > STUN_FOR) {
        this.state = 'patrol';
        this.stateT = 0;
      }
      this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 2);
      this.place();
      return null;
    }
    const sees = inZone && this.graceT <= 0 && this.canSee(chest, exclude);
    // Suspicion: rises fast when close, drains when she is out of sight.
    if (sees) {
      const d = this.tmp.copy(chest).sub(this.eye()).length();
      this.suspicion = Math.min(1, this.suspicion + dt * (0.35 + 1.0 * (1 - d / RANGE)));
      this.unseenT = 0;
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'alert' ? 0.15 : 0.45));
      this.unseenT += dt;
    }
    if (this.suspicion >= 1 && this.state !== 'alert') {
      this.state = 'alert';
      this.stateT = 0;
      event = 'alert';
    }
    if (this.state === 'alert') {
      // Chase round the ring toward her (the shorter way), faster than she walks the curve.
      const target = Math.atan2(chest.x, chest.z);
      const diff = Math.atan2(Math.sin(target - this.angle), Math.cos(target - this.angle));
      this.dir = diff >= 0 ? 1 : -1;
      if (inZone) this.angle += this.dir * Math.min(Math.abs(diff), (CHASE / this.ring.radius) * dt);
      this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 6);
      const p = this.position(this.tmp);
      if (inZone && this.stateT > GRAB_AFTER && Math.hypot(chest.x - p.x, chest.z - p.z) < 1.15 && Math.abs(chest.y - (p.y + 1)) < 1.4) {
        this.catches++;
        event = 'caught';
      } else if (!sees && this.unseenT > GIVE_UP) {
        this.state = 'search';
        this.stateT = 0;
      }
    } else if (this.state === 'search') {
      this.headYaw = Math.sin(this.stateT * 2.4) * 1.1;
      if (this.stateT > 2.4) {
        this.state = 'patrol';
        this.stateT = 0;
        this.suspicion = 0;
      }
    } else {
      // Patrol, stopping every few seconds to look back the way it came.
      this.patrolT += dt;
      if (this.state === 'patrol' && this.patrolT > LOOK_EVERY) {
        this.state = 'look';
        this.stateT = 0;
        this.patrolT = 0;
      }
      if (this.state === 'look') {
        const k = Math.min(1, this.stateT / 0.5) * Math.min(1, Math.max(0, (LOOK_FOR - this.stateT) / 0.5));
        this.lookYaw = Math.PI * k;
        this.headYaw = this.lookYaw;
        if (this.stateT > LOOK_FOR) {
          this.state = 'patrol';
          this.stateT = 0;
        }
      } else if (this.suspicion > 0.05) {
        // Something caught its eye: it stops and stares.
        this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 4);
      } else {
        this.angle += this.dir * (SPEED / this.ring.radius) * dt;
        this.headYaw = Math.sin(this.time * 0.8) * 0.3;
      }
    }
    this.place();
    return event;
  }

  private eye(out = new THREE.Vector3()): THREE.Vector3 {
    return this.position(out).setY(this.ring.deckY() + EYE_HEIGHT);
  }

  private canSee(chest: THREE.Vector3, exclude: RAPIER.Collider): boolean {
    const eye = this.eye(new THREE.Vector3());
    const to = chest.clone().sub(eye);
    const d = to.length();
    if (d > RANGE || d < 0.05) return false;
    to.divideScalar(d);
    const f = this.facing(new THREE.Vector3());
    const flat = Math.hypot(to.x, to.z);
    if (flat < 1e-3) return false;
    const cos = (to.x * f.x + to.z * f.z) / flat;
    if (cos < Math.cos(d * flat < NEAR ? NEAR_HALF_ANGLE : HALF_ANGLE)) return false;
    // Solid things (the column, walls) block its sight; railings and bars do not. The ray starts
    // just outside its own body.
    const start = eye.clone().addScaledVector(to, 0.45);
    if (d < 0.8) return true;
    const hit = this.physics.raycast(start, to, d - 0.75, groups(Layer.CAMERA_QUERY, Layer.WORLD), exclude);
    return !hit;
  }

  private place(): void {
    const r = this.ring.radius;
    const x = Math.sin(this.angle) * r;
    const z = Math.cos(this.angle) * r;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.atan2(Math.cos(this.angle) * this.dir, -Math.sin(this.angle) * this.dir);
    this.collider.setTranslation({ x, y: this.ring.deckY() + 0.76, z });
  }

  /** Animate (render rate): head, lamp colour, beam, pool, the "?" / "!". */
  update(): void {
    const stunned = this.state === 'stunned';
    const alert = this.state === 'alert';
    const visible = this.enabled;
    this.group.visible = visible;
    if (!visible) return;
    this.head.rotation.y = this.headYaw + (stunned ? Math.sin(this.time * 9) * 0.1 : 0);
    this.head.rotation.x = stunned ? 0.45 : 0;
    const color = alert ? '#ff3a24' : this.suspicion > 0.05 ? '#ffd24a' : '#ffb347';
    this.eyeMat.emissive.set(color);
    this.eyeMat.emissiveIntensity = stunned ? 0.15 + Math.abs(Math.sin(this.time * 13)) * 0.4 : alert ? 3.2 : 2.4;
    this.beamMat.uniforms.color.value.set(alert ? '#ff6a4a' : '#ffcf7a');
    this.beamMat.uniforms.opacity.value = stunned ? 0 : alert ? 0.34 : 0.22;
    this.beam.visible = !stunned;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = stunned ? 0 : 0.22;
    (this.pool.material as THREE.MeshBasicMaterial).color.set(alert ? '#ff6a4a' : '#ffcf7a');
    const ahead = 2.6;
    this.pool.position.set(Math.sin(this.headYaw) * ahead, 0.02, Math.cos(this.headYaw) * ahead);
    const mark = stunned ? 'z' : alert ? '!' : this.suspicion > 0.05 ? '?' : '';
    this.icon.visible = mark !== '';
    if (mark !== this.iconTex.shown) this.drawIcon(mark);
    this.icon.material.opacity = mark === '?' ? 0.35 + this.suspicion * 0.65 : 1;
    this.icon.scale.setScalar(mark === '!' ? 0.5 + Math.sin(this.time * 14) * 0.03 : 0.42);
  }

  private drawIcon(mark: string): void {
    const { canvas, texture } = this.iconTex;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    if (mark) {
      g.fillStyle = mark === '!' ? '#ff3a24' : mark === 'z' ? '#9fc4e6' : '#ffc24a';
      g.beginPath();
      g.arc(64, 64, 52, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#1a0d06';
      g.stroke();
      g.fillStyle = '#1a0d06';
      g.font = 'bold 76px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(mark, 64, 70);
    }
    texture.needsUpdate = true;
    this.iconTex.shown = mark;
  }
}

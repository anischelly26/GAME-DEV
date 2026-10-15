import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RAPIER, type Physics } from '../../physics/Physics';
import type { MaterialLibrary } from '../materials';
import { gaugeAngle, gaugeFaceTexture, paintedTextTexture, pressureDiagramTexture, valvePlateTexture } from '../textures';
import { LIFT_THRESHOLD } from '../../gameplay/puzzles/PressureHatchLogic';
import { clamp, damp, smoothstep } from '../../core/math';
import { pipeAlong } from './Mechanisms';
import { SteamEmitter } from '../Atmosphere';
import { FlowStrip } from './FlowStrip';

/**
 * Layout of the hatch wall in its local frame: the wall's inner face is the XY plane at z = 0,
 * +Z points into the cell, y = 0 is the floor. The level builds the wall with an opening at
 * [OPENING.x0, OPENING.x1] x [0, OPENING.height].
 */
export const OPENING = { x0: 0.35, x1: 1.75, height: 1.95 };
export const HATCH_LIFT = 1.95;
const SLAB = { w: 1.56, h: 2.06, t: 0.12, z: 0.1 };
const PIPE_Z = 0.17;
const VALVE = new THREE.Vector3(-1.75, 0.82, PIPE_Z + 0.13);
const GAUGE = new THREE.Vector3(-0.72, 1.42, PIPE_Z + 0.06);
const BARREL = { x: 0.1, y0: 0.08, y1: 2.15, r: 0.1 };
const LEVER = new THREE.Vector3(2.07, 1.18, 0.1);
export const DIAGRAM = { x: -0.62, y: 2.2, w: 1.16, h: 0.87 };

/**
 * Visual and physical side of the cell's pressure hatch puzzle. Purely a "view": it is driven
 * each frame from `PressureHatchLogic` state, never owns puzzle rules itself.
 */
export class PressureHatch {
  readonly group = new THREE.Group();
  /** World anchors for interaction prompts and Mara's glances. */
  readonly anchors = {
    valve: new THREE.Vector3(),
    lever: new THREE.Vector3(),
    gauge: new THREE.Vector3(),
    diagram: new THREE.Vector3(),
    vent: new THREE.Vector3(),
    pistonSeal: new THREE.Vector3(),
    hatch: new THREE.Vector3(),
    drip: new THREE.Vector3(),
  };
  readonly ventSteam: SteamEmitter;
  readonly sealSteam: SteamEmitter;
  readonly slabBody: RAPIER.RigidBody;
  private readonly slab = new THREE.Group();
  private readonly wheel = new THREE.Group();
  private readonly needle: THREE.Mesh;
  private readonly rod: THREE.Mesh;
  private readonly crossbar = new THREE.Group();
  private readonly leverArm = new THREE.Group();
  private readonly pawls: THREE.Group[] = [];
  private readonly slabClosed: THREE.Vector3;
  private wheelAngle = 0;
  private wheelTarget = 0;
  private needleValue = 0.1;
  private leverAngle = 0;
  private leverHold = 0;
  private leverLocked = false;
  private failKick = 0;
  private rattle = 0;
  private pawlKick = 0;
  private lift = 0;
  private readonly diagramMesh: THREE.Mesh;
  private highlight = 0;

  constructor(physics: Physics, m: MaterialLibrary, origin: THREE.Vector3, rotY: number) {
    this.group.position.copy(origin);
    this.group.rotation.y = rotY;

    // --- supply main from the ceiling, with a freshly repaired copper section
    const supply = pipeAlong([new THREE.Vector3(-1.75, 4.45, PIPE_Z), new THREE.Vector3(-1.75, 3.25, PIPE_Z)], 0.075, m.brass, m.brass);
    const repair = pipeAlong([new THREE.Vector3(-1.75, 3.25, PIPE_Z), new THREE.Vector3(-1.75, 2.55, PIPE_Z)], 0.078, m.copper);
    const supplyLow = pipeAlong([new THREE.Vector3(-1.75, 2.55, PIPE_Z), new THREE.Vector3(-1.75, 1.3, PIPE_Z)], 0.075, m.brass, m.brass);
    for (const y of [3.18, 2.62]) {
      const clampBand = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 16), m.ironDark);
      clampBand.rotation.x = Math.PI / 2;
      clampBand.position.set(-1.75, y, PIPE_Z);
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), m.ironDark);
      bolt.position.set(-1.65, y, PIPE_Z + 0.06);
      this.group.add(clampBand, bolt);
    }
    // Ivo's repair mark, chalked beside the new copper.
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.2),
      new THREE.MeshStandardMaterial({ map: paintedTextTexture('IV', { w: 256, h: 150, color: 'rgba(236,232,220,0.9)', font: 'bold 110px "Segoe Print", "Comic Sans MS", cursive', seed: 21 }), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    mark.position.set(-1.42, 2.95, 0.012);
    this.group.add(supply, repair, supplyLow, mark);

    // --- tee, vent branch with the bypass valve, floor grate
    const tee = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.22, 0.22, 2, 0.05), m.brass);
    tee.position.set(-1.75, 1.25, PIPE_Z);
    const vent = pipeAlong([new THREE.Vector3(-1.75, 1.2, PIPE_Z), new THREE.Vector3(-1.75, 0.4, PIPE_Z), new THREE.Vector3(-1.75, 0.18, PIPE_Z + 0.2), new THREE.Vector3(-1.75, 0.12, PIPE_Z + 0.42)], 0.065, m.brass, m.brass);
    const valveBody = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.24, 0.2, 2, 0.04), m.brass);
    valveBody.position.set(-1.75, VALVE.y, PIPE_Z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), m.iron);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(-1.75, VALVE.y, PIPE_Z + 0.08);
    this.group.add(tee, vent, valveBody, stem);
    // Handwheel with a pointer bar: bar along the pipe = OPEN, across = SHUT (shape, not colour).
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 24), m.ironDark);
    this.wheel.add(rim);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.022, 0.022), m.ironDark);
      spoke.rotation.z = (i * Math.PI) / 4 + Math.PI / 8;
      this.wheel.add(spoke);
    }
    const pointer = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.3, 0.04, 1, 0.015), m.ceramic);
    pointer.position.z = 0.03;
    this.wheel.add(pointer);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m.ceramic);
    knob.position.set(0.17, 0, 0.04);
    this.wheel.add(knob);
    this.wheel.position.copy(VALVE);
    this.group.add(this.wheel);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: valvePlateTexture(), roughness: 0.8 }));
    plate.position.set(-1.22, 0.85, 0.012);
    this.group.add(plate);
    const grate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.5), m.grate);
    grate.position.set(-1.75, 0.025, 0.62);
    this.group.add(grate);
    for (let i = 0; i < 5; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.052, 0.42), m.cellShadow);
      slot.position.set(-1.95 + i * 0.1, 0.026, 0.62);
      this.group.add(slot);
    }

    // --- hatch branch: curved pipe from the tee to the piston, with the gauge on a stalk
    const branch = pipeAlong(
      [
        new THREE.Vector3(-1.64, 1.25, PIPE_Z),
        new THREE.Vector3(-1.45, 1.2, PIPE_Z),
        new THREE.Vector3(-1.32, 0.95, PIPE_Z),
        new THREE.Vector3(-1.2, 0.6, PIPE_Z),
        new THREE.Vector3(-0.95, 0.42, PIPE_Z),
        new THREE.Vector3(-0.4, 0.4, PIPE_Z),
        new THREE.Vector3(BARREL.x - 0.1, 0.4, PIPE_Z),
      ],
      0.06,
      m.brass,
      m.brass,
    );
    const stalk = pipeAlong([new THREE.Vector3(GAUGE.x, 0.4, PIPE_Z), new THREE.Vector3(GAUGE.x, GAUGE.y - 0.18, PIPE_Z)], 0.03, m.brass);
    const dialCase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), m.brass);
    dialCase.rotation.x = Math.PI / 2;
    dialCase.position.copy(GAUGE).setZ(GAUGE.z - 0.03);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.175, 32), new THREE.MeshStandardMaterial({ map: gaugeFaceTexture(LIFT_THRESHOLD), roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.06 }));
    face.position.copy(GAUGE).setZ(GAUGE.z + 0.012);
    const needleGeo = new THREE.BoxGeometry(0.014, 0.15, 0.008);
    needleGeo.translate(0, 0.06, 0);
    this.needle = new THREE.Mesh(needleGeo, m.ironDark);
    this.needle.position.copy(GAUGE).setZ(GAUGE.z + 0.02);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), m.brass);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(this.needle.position).setZ(GAUGE.z + 0.025);
    const glassCover = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 32),
      new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    );
    glassCover.position.copy(GAUGE).setZ(GAUGE.z + 0.04);
    this.group.add(branch, stalk, dialCase, face, this.needle, hub, glassCover);
    // Where the pressure goes, painted on the pipes: down the vent branch while the bypass is open,
    // along the branch and up into the piston once it is shut (same language as the engine's feed).
    const front = (_d: THREE.Vector3) => new THREE.Vector3(0, 0, 1);
    const zf = PIPE_Z + 0.068;
    this.ventFlow = new FlowStrip([new THREE.Vector3(-1.75, 1.12, zf), new THREE.Vector3(-1.75, 0.36, zf)], front, { width: 0.07 });
    this.pistonFlow = new FlowStrip(
      [
        new THREE.Vector3(-1.45, 1.2, zf - 0.005),
        new THREE.Vector3(-1.32, 0.95, zf - 0.005),
        new THREE.Vector3(-1.2, 0.6, zf - 0.005),
        new THREE.Vector3(-0.95, 0.42, zf - 0.005),
        new THREE.Vector3(BARREL.x - 0.13, 0.4, zf - 0.005),
        new THREE.Vector3(BARREL.x, 0.55, PIPE_Z + BARREL.r + 0.012),
        new THREE.Vector3(BARREL.x, 1.95, PIPE_Z + BARREL.r + 0.012),
      ],
      front,
      { width: 0.07 },
    );
    this.group.add(this.ventFlow.group, this.pistonFlow.group);
    this.ventFlow.set(true, true);

    // --- piston barrel, telescoping rod and crossbar to the hatch
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(BARREL.r, BARREL.r, BARREL.y1 - BARREL.y0, 18), m.brass);
    barrel.position.set(BARREL.x, (BARREL.y0 + BARREL.y1) / 2, PIPE_Z);
    const sealRing = new THREE.Mesh(new THREE.TorusGeometry(BARREL.r, 0.022, 6, 18), m.ironDark);
    sealRing.rotation.x = Math.PI / 2;
    sealRing.position.set(BARREL.x, BARREL.y1, PIPE_Z);
    const footRing = sealRing.clone();
    footRing.position.y = BARREL.y0 + 0.05;
    for (const y of [0.5, 1.6]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.2), m.ironDark);
      strap.position.set(BARREL.x, y, PIPE_Z - 0.08);
      this.group.add(strap);
    }
    const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
    rodGeo.translate(0, 0.5, 0);
    this.rod = new THREE.Mesh(rodGeo, new THREE.MeshStandardMaterial({ color: '#cfd6da', roughness: 0.15, metalness: 1 }));
    this.rod.position.set(BARREL.x, BARREL.y1, PIPE_Z);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(OPENING.x0 + SLAB.w * 0.5 - BARREL.x + 0.2, 0.08, 0.08), m.ironDark);
    bar.position.set((OPENING.x0 + SLAB.w * 0.5 - BARREL.x) / 2, 0, PIPE_Z - SLAB.z + 0.02);
    this.crossbar.add(bar);
    this.crossbar.position.set(BARREL.x, OPENING.height + 0.12, SLAB.z);
    this.group.add(barrel, sealRing, footRing, this.rod, this.crossbar);

    // --- hatch slab on guide rails, with spring pawls that latch it open
    const slabMesh = new THREE.Mesh(new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.t, 3, 0.035), m.iron);
    slabMesh.position.set(0, SLAB.h / 2, 0);
    slabMesh.castShadow = slabMesh.receiveShadow = true;
    this.slab.add(slabMesh);
    const ribGeo = new RoundedBoxGeometry(SLAB.w - 0.08, 0.09, 0.05, 1, 0.015);
    for (const y of [0.32, 1.03, 1.74]) {
      const rib = new THREE.Mesh(ribGeo, m.ironDark);
      rib.position.set(0, y, SLAB.t / 2 + 0.02);
      rib.castShadow = true;
      this.slab.add(rib);
    }
    // Rivet rows along the edges and ribs.
    const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 6, 4), m.brass, 64);
    const mtx = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const t = (i + 0.5) / 10;
      for (const [x, y] of [
        [-SLAB.w / 2 + 0.06, 0.08 + t * (SLAB.h - 0.16)],
        [SLAB.w / 2 - 0.06, 0.08 + t * (SLAB.h - 0.16)],
      ]) {
        mtx.makeTranslation(x, y, SLAB.t / 2 + 0.005);
        rivets.setMatrixAt(n++, mtx);
      }
    }
    for (const y of [0.32, 1.03, 1.74]) {
      for (let i = 0; i < 7; i++) {
        mtx.makeTranslation(-SLAB.w / 2 + 0.2 + i * ((SLAB.w - 0.4) / 6), y, SLAB.t / 2 + 0.05);
        rivets.setMatrixAt(n++, mtx);
      }
    }
    rivets.count = n;
    this.slab.add(rivets);
    const stencil = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.3),
      new THREE.MeshStandardMaterial({ map: paintedTextTexture('SERVICE', { w: 512, h: 128, color: 'rgba(214,180,90,0.92)', seed: 12 }), transparent: true, roughness: 0.8 }),
    );
    stencil.position.set(0, 1.37, SLAB.t / 2 + 0.003);
    this.slab.add(stencil);
    this.slabClosed = new THREE.Vector3((OPENING.x0 + OPENING.x1) / 2, 0, SLAB.z);
    this.slab.position.copy(this.slabClosed);
    this.group.add(this.slab);
    for (const x of [OPENING.x0 - 0.08, OPENING.x1 + 0.08]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.1), m.iron);
      rail.position.set(x, 2.2, SLAB.z);
      rail.castShadow = true;
      this.group.add(rail);
      const pawl = new THREE.Group();
      const dog = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), m.brass);
      dog.position.y = -0.09;
      pawl.add(dog);
      pawl.position.set(x + (x < 1 ? 0.08 : -0.08), OPENING.height - 0.02, SLAB.z + 0.07);
      pawl.rotation.z = x < 1 ? -0.9 : 0.9;
      this.pawls.push(pawl);
      this.group.add(pawl);
    }

    // --- lever
    const leverBase = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.42, 0.06, 2, 0.02), m.ironDark);
    leverBase.position.set(LEVER.x, LEVER.y, 0.03);
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10), m.brass);
    pivot.rotation.z = Math.PI / 2;
    pivot.position.copy(LEVER);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.55, 0.045), m.iron);
    arm.position.y = 0.27;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), m.ceramic);
    grip.position.y = 0.6;
    this.leverArm.add(arm, grip);
    this.leverArm.position.copy(LEVER);
    this.leverArm.rotation.x = -0.35;
    const leverSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.12),
      new THREE.MeshStandardMaterial({ map: paintedTextTexture('LIFT', { w: 256, h: 96, color: 'rgba(30,24,20,0.95)', bg: 'rgba(217,207,182,1)', seed: 6 }), roughness: 0.8 }),
    );
    leverSign.position.set(LEVER.x, LEVER.y - 0.3, 0.012);
    this.group.add(leverBase, pivot, this.leverArm, leverSign);

    // --- scratched diagram
    const diagramTex = pressureDiagramTexture();
    this.diagramTexture = diagramTex;
    this.diagramMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(DIAGRAM.w, DIAGRAM.h),
      new THREE.MeshStandardMaterial({ map: diagramTex, transparent: true, roughness: 1, emissive: '#ffffff', emissiveMap: diagramTex, emissiveIntensity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.diagramMesh.position.set(DIAGRAM.x, DIAGRAM.y, 0.013);
    this.group.add(this.diagramMesh);

    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh.material as THREE.Material).transparent) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.group.updateMatrixWorld(true);
    const toWorld = (v: THREE.Vector3, out: THREE.Vector3) => out.copy(v).applyMatrix4(this.group.matrixWorld);
    toWorld(VALVE, this.anchors.valve);
    toWorld(new THREE.Vector3(LEVER.x, LEVER.y + 0.25, LEVER.z + 0.15), this.anchors.lever);
    toWorld(GAUGE, this.anchors.gauge);
    toWorld(new THREE.Vector3(DIAGRAM.x, DIAGRAM.y, 0.05), this.anchors.diagram);
    toWorld(new THREE.Vector3(-1.75, 0.1, 0.62), this.anchors.vent);
    toWorld(new THREE.Vector3(BARREL.x, BARREL.y1 + 0.05, PIPE_Z), this.anchors.pistonSeal);
    toWorld(new THREE.Vector3((OPENING.x0 + OPENING.x1) / 2, 1.0, 0.2), this.anchors.hatch);
    toWorld(new THREE.Vector3(-1.45, 1.22, PIPE_Z + 0.02), this.anchors.drip);

    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.ventSteam = new SteamEmitter(this.anchors.vent.clone(), new THREE.Vector3(0, 1, 0).addScaledVector(outward, 0.3), 0);
    this.sealSteam = new SteamEmitter(this.anchors.pistonSeal.clone(), new THREE.Vector3(0, 0.6, 0).addScaledVector(outward, 0.6), 0);

    // --- physics: slab (kinematic), piston barrel and vent elbow so the player can't walk through them
    const slabWorld = this.slabClosed.clone().add(new THREE.Vector3(0, SLAB.h / 2, 0)).applyMatrix4(this.group.matrixWorld);
    this.slabBody = physics.kinematic(slabWorld);
    this.slabBody.setRotation(this.group.quaternion, true);
    physics.attach(this.slabBody, RAPIER.ColliderDesc.cuboid(SLAB.w / 2, SLAB.h / 2, SLAB.t / 2 + 0.05));
    const q = this.group.quaternion;
    const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(this.group.matrixWorld);
    physics.box(local(BARREL.x, (BARREL.y0 + BARREL.y1) / 2, PIPE_Z), new THREE.Vector3(0.13, (BARREL.y1 - BARREL.y0) / 2, 0.13), q);
    physics.box(local(-1.75, 0.7, PIPE_Z + 0.1), new THREE.Vector3(0.16, 0.7, 0.2), q);
    physics.box(local(-0.7, 0.42, PIPE_Z), new THREE.Vector3(1.05, 0.1, 0.1), q, { blocksCamera: false });
  }

  private readonly diagramTexture: THREE.CanvasTexture;

  /** Data URL of the diagram, for the full-screen inspection view. */
  diagramImage(): string {
    return (this.diagramTexture.image as HTMLCanvasElement).toDataURL();
  }

  /** Make the diagram glow briefly (second-tier hint). */
  pulseHighlight(): void {
    this.highlight = 3;
  }

  setValve(open: boolean, instant = false): void {
    this.wheelTarget = open ? 0 : Math.PI / 2;
    if (instant) this.wheelAngle = this.wheelTarget;
    this.ventFlow.set(open, instant);
    this.pistonFlow.set(!open, instant);
  }

  private readonly ventFlow: FlowStrip;
  private readonly pistonFlow: FlowStrip;

  /** Lever animation. `success` keeps it down; otherwise it springs back. */
  pullLever(success: boolean): void {
    this.leverHold = 0.35;
    this.leverLocked = success;
    if (!success) this.failKick = 0.6;
  }

  /** Engine pulse arriving while the bypass vents: the hatch rattles in its rails. */
  rattleHatch(strength: number): void {
    this.rattle = Math.max(this.rattle, strength);
  }

  reset(): void {
    this.setValve(true, true);
    this.leverLocked = false;
    this.leverAngle = 0;
    this.leverHold = 0;
    this.failKick = 0;
    this.lift = 0;
    this.pawlKick = 0;
    this.needleValue = 0.1;
    this.applySlab(0);
  }

  private applySlab(offset: number): void {
    const p = this.slabClosed.clone();
    p.y += offset;
    this.slab.position.copy(p);
    const world = p.add(new THREE.Vector3(0, SLAB.h / 2, 0)).applyMatrix4(this.group.matrixWorld);
    this.slabBody.setNextKinematicTranslation(world);
    this.crossbar.position.y = OPENING.height + 0.12 + offset;
    this.rod.scale.y = Math.max(0.01, this.crossbar.position.y - BARREL.y1);
  }

  /** Physics-side update (fixed step): moves the slab collider. `lift` is 0..1. */
  fixedUpdate(dt: number, lift: number, latched: boolean, time: number): void {
    this.lift = lift;
    let offset = smoothstep(0, 1, lift) * HATCH_LIFT;
    if (!latched && lift === 0) {
      if (this.failKick > 0) {
        this.failKick = Math.max(0, this.failKick - dt);
        offset += Math.sin((1 - this.failKick / 0.6) * Math.PI) * 0.05;
      }
      if (this.rattle > 0) {
        this.rattle = Math.max(0, this.rattle - dt * 2.5);
        offset += Math.abs(Math.sin(time * 41)) * 0.012 * this.rattle;
      }
    }
    if (latched && this.pawlKick === 0) this.pawlKick = 0.001;
    this.applySlab(offset);
  }

  /** Visual update (render frame). */
  update(dt: number, time: number, pressure: number): void {
    this.ventFlow.update(dt);
    this.pistonFlow.update(dt);
    this.wheelAngle = damp(this.wheelAngle, this.wheelTarget, 7, dt);
    this.wheel.rotation.z = this.wheelAngle;
    // Needle settles with a little overshoot and buzz under pressure.
    this.needleValue = damp(this.needleValue, pressure, 5, dt);
    const buzz = Math.sin(time * 37) * 0.006 * pressure;
    this.needle.rotation.z = -gaugeAngle(this.needleValue + buzz);
    // Lever.
    if (this.leverHold > 0) this.leverHold -= dt;
    const leverTarget = this.leverLocked || this.leverHold > 0 ? 1 : 0;
    this.leverAngle = damp(this.leverAngle, leverTarget, leverTarget ? 18 : 6, dt);
    this.leverArm.rotation.x = -0.35 - this.leverAngle * 2.1;
    // Latch pawls kick inward once the hatch has passed them.
    if (this.pawlKick > 0) this.pawlKick = Math.min(1, this.pawlKick + dt * 10);
    const kick = this.lift >= 1 ? this.pawlKick : 0;
    this.pawls[0].rotation.z = -0.9 + 0.9 * kick;
    this.pawls[1].rotation.z = 0.9 - 0.9 * kick;
    // Diagram hint glow.
    if (this.highlight > 0) this.highlight = Math.max(0, this.highlight - dt);
    const glow = this.highlight > 0 ? 0.12 + 0.45 * (0.5 + 0.5 * Math.sin(time * 6)) * clamp(this.highlight, 0, 1) : 0.12;
    (this.diagramMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    this.ventSteam.update(dt);
    this.sealSteam.update(dt);
  }
}

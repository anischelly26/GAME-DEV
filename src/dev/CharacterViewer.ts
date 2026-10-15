import * as THREE from 'three';
import { ARM_BIND_ANGLE, buildMara } from '../character/MaraModel';

/**
 * Dev-only turntable for inspecting the character model: `/?viewer=mara`.
 * Exposes `window.__VIEWER` ({ ready, stats, view(angle, dist, camY, lookY), pose(name) }) for
 * scripted screenshots.
 */
export async function startCharacterViewer(container: HTMLElement): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a3036');
  const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.05, 50);

  scene.add(new THREE.HemisphereLight('#c9d6e2', '#3b3328', 0.9));
  const key = new THREE.DirectionalLight('#ffe2c4', 2.4);
  key.position.set(1.6, 3, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
  key.shadow.camera.right = key.shadow.camera.top = 1.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#8fb4d9', 0.7);
  fill.position.set(-2, 1.5, -1.5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.MeshStandardMaterial({ color: '#4a4f52', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rig = await buildMara({ workers: new URLSearchParams(location.search).get('workers') !== '0' });
  scene.add(rig.root);

  const bone = (n: string) => rig.bones.get(n)!;
  // Arm rotations use the animation convention: (0, 0, 0) is an arm hanging straight down.
  const poses: Record<string, () => void> = {
    bind: () => {
      rig.bones.forEach((b) => b.rotation.set(0, 0, 0));
      bone('upperArmR').rotation.z = -ARM_BIND_ANGLE;
      bone('upperArmL').rotation.z = ARM_BIND_ANGLE;
    },
    relaxed: () => {
      rig.bones.forEach((b) => b.rotation.set(0, 0, 0));
      for (const [n, s] of [
        ['R', -1],
        ['L', 1],
      ] as const) {
        bone(`upperArm${n}`).rotation.set(0.05, 0, s * 0.1);
        bone(`forearm${n}`).rotation.set(-0.25, 0, 0);
      }
    },
    stride: () => {
      poses.relaxed();
      bone('thighR').rotation.x = -0.55;
      bone('shinR').rotation.x = 0.35;
      bone('thighL').rotation.x = 0.35;
      bone('shinL').rotation.x = 0.7;
      bone('footL').rotation.x = -0.2;
      bone('upperArmR').rotation.x = 0.5;
      bone('upperArmL').rotation.x = -0.5;
      bone('forearmL').rotation.x = -0.7;
      bone('spine').rotation.y = 0.12;
    },
    hang: () => {
      poses.relaxed();
      for (const [n, s] of [
        ['R', -1],
        ['L', 1],
      ] as const) {
        bone(`upperArm${n}`).rotation.set(-2.9, 0, s * 0.2);
        bone(`forearm${n}`).rotation.set(-0.2, 0, 0);
      }
      bone('thighR').rotation.x = 0.1;
      bone('shinR').rotation.x = 0.25;
      bone('thighL').rotation.x = 0.1;
      bone('shinL').rotation.x = 0.25;
    },
    blink: () => rig.setBlink(1),
    open: () => rig.setBlink(0),
  };

  let angle = 0.5;
  let dist = 3.6;
  let camY = 1.1;
  let lookY = 0.88;
  let spin = true;
  const place = () => {
    camera.position.set(Math.sin(angle) * dist, camY, Math.cos(angle) * dist);
    camera.lookAt(0, lookY, 0);
  };

  (window as any).__VIEWER = {
    ready: true,
    stats: rig.stats,
    view: (a: number, d: number, cy: number, ly: number) => {
      spin = false;
      angle = a;
      dist = d;
      camY = cy;
      lookY = ly;
      place();
      renderer.render(scene, camera);
    },
    detail: (level: 'high' | 'low') => {
      rig.setDetail(level);
      renderer.render(scene, camera);
    },
    pose: (name: string) => {
      poses[name]?.();
      renderer.render(scene, camera);
    },
    rig,
  };

  addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  });
  let dragging = false;
  renderer.domElement.addEventListener('pointerdown', () => ((dragging = true), (spin = false)));
  addEventListener('pointerup', () => (dragging = false));
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    angle -= e.movementX * 0.01;
    camY = Math.max(0.1, Math.min(2.5, camY + e.movementY * 0.005));
  });
  addEventListener('wheel', (e) => (dist = Math.max(0.4, Math.min(6, dist * (1 + Math.sign(e.deltaY) * 0.1)))));
  addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') poses.bind();
    if (e.code === 'Digit2') poses.relaxed();
    if (e.code === 'Digit3') poses.stride();
    if (e.code === 'Digit4') rig.setDetail('high');
    if (e.code === 'Digit5') rig.setDetail('low');
  });
  poses.relaxed();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (spin) angle += dt * 0.4;
    place();
    renderer.render(scene, camera);
  });
  console.info(`Mara: ${rig.stats.triangles} triangles (Low: ${rig.stats.lowTriangles}), ${rig.stats.source}, ready in ${rig.stats.millis} ms`);
}

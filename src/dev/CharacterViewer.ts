import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Dev-only turntable for the character (public/assets/mara/mara.glb): `/?viewer=mara`.
 * Drag to orbit, wheel to zoom, number keys cycle clips. Exposes `window.__VIEWER`
 * ({ ready, clips, view(angle, dist, camY, lookY), play(name, time?) }) for scripted screenshots.
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
  scene.add(new THREE.HemisphereLight('#c9d6e2', '#3b3328', 1.1));
  const key = new THREE.DirectionalLight('#ffe2c4', 2.6);
  key.position.set(1.6, 3, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
  key.shadow.camera.right = key.shadow.camera.top = 1.5;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#8fb4d9', 0.8);
  fill.position.set(-2, 1.5, -1.5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.MeshStandardMaterial({ color: '#4a4f52', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/mara/mara.glb`);
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const s = 1.7 / (box.max.y - box.min.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  model.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true), (o.frustumCulled = false)) : null));
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = gltf.animations;
  let current: THREE.AnimationAction | null = null;
  const play = (name: string, time?: number) => {
    const clip = clips.find((c) => c.name === name);
    if (!clip) return;
    current?.stop();
    current = mixer.clipAction(clip);
    current.reset().play();
    if (time !== undefined) {
      current.paused = true;
      current.time = time;
      mixer.update(0);
    }
    renderer.render(scene, camera);
  };
  play('idle');

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
    clips: clips.map((c) => c.name),
    view: (a: number, d: number, cy: number, ly: number) => {
      spin = false;
      angle = a;
      dist = d;
      camY = cy;
      lookY = ly;
      place();
      renderer.render(scene, camera);
    },
    play,
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
  let clipIndex = 0;
  addEventListener('keydown', (e) => {
    if (!/^Digit\d$/.test(e.code)) return;
    clipIndex = (clipIndex + 1) % clips.length;
    play(clips[clipIndex].name);
  });
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    mixer.update(dt);
    if (spin) angle += dt * 0.4;
    place();
    renderer.render(scene, camera);
  });
}

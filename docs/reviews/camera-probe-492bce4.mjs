// Isolated camera-policy comparison; deliberately not a gameplay or performance test.
import { createServer } from 'vite';
import { Vector3 } from 'three';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const results = [];
for (const [label, root] of [['latest', process.cwd()], ['baseline', resolve('artifacts/review-492bce4/baseline')]]) {
  const server = await createServer({root, configFile:false, server:{middlewareMode:true}});
  try {
    const {ThirdPersonCamera} = await server.ssrLoadModule('/src/camera/ThirdPersonCamera.ts');
    const {MOVEMENT} = await server.ssrLoadModule('/src/player/movement.ts');
    const camera = new ThirdPersonCamera({sphereCastDistance:()=>100}, null);
    const feet = new Vector3();
    // Baseline used a different public signature: raw dx/dy plus sensitivity.
    const tick = (grounded,speed) => label === 'latest'
      ? camera.update(1/60,{yaw:0,pitch:0},feet,grounded,speed)
      : camera.update(1/60,{dx:0,dy:0},1,feet,grounded,speed);
    tick(true,0);
    const before = camera.yaw;
    for (let i=1;i<=30;i++) {
      feet.set(i*4/60, Math.sin(i*Math.PI/30), 0);
      tick(false,4);
    }
    results.push({label, fixture:'half-second lateral airborne trajectory, 4 m/s, no look input, initial yaw 0; unobstructed mock camera cast', yawDelta:camera.yaw-before, degrees:(camera.yaw-before)*180/Math.PI, movement:MOVEMENT});
  } finally {await server.close();}
}
writeFileSync('artifacts/review-492bce4/camera-policy.json', JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

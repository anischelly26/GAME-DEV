import { describe, expect, it } from 'vitest';
import { decodeBake, encodeBake } from '../../src/character/bakeFormat';
import { meshShape } from '../../src/character/mesher';
import { capsule, sphere } from '../../src/character/sdf';

describe("Mara's bake format", () => {
  it('round-trips a skinned mesh within quantisation error, weights still summing to one', () => {
    const shape = {
      prims: [
        { dist: sphere([0, 0, 0], 0.1), bone: 'a', blend: 0 },
        { dist: capsule([0, 0, 0], [0, 0.2, 0], 0.05), bone: 'b', blend: 0.04 },
      ],
    };
    const mesh = meshShape(shape, { min: [-0.15, -0.15, -0.15], max: [0.15, 0.3, 0.15], voxel: 0.02, bones: new Map([['a', 0], ['b', 1]]) });
    const bytes = encodeBake('abc123', [{ name: 'blob', material: 'skin', mesh, low: mesh }]);
    const copy = new Uint8Array(bytes).buffer;
    const bake = decodeBake(copy)!;
    expect(bake.hash).toBe('abc123');
    // Both levels of detail are stored.
    expect(bake.parts.map((x) => x.lod)).toEqual([0, 1]);
    const p = bake.parts[0];
    expect(p.name).toBe('blob');
    expect(p.material).toBe('skin');
    expect(Array.from(p.mesh.position)).toEqual(Array.from(mesh.position));
    expect(Array.from(p.mesh.index)).toEqual(Array.from(mesh.index));
    const v = mesh.position.length / 3;
    for (let i = 0; i < v; i++) {
      for (let k = 0; k < 3; k++) expect(Math.abs(p.mesh.normal[i * 3 + k] / 127 - mesh.normal[i * 3 + k])).toBeLessThan(0.01);
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += p.mesh.skinWeight[i * 4 + k];
        expect(p.mesh.skinIndex[i * 4 + k]).toBe(mesh.skinIndex[i * 4 + k]);
      }
      expect(sum).toBe(255);
    }
  });

  it('rejects data that is not a bake', () => {
    expect(decodeBake(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toBeNull();
  });
});

import * as THREE from 'three';
import type { TextureLibrary } from './textures';

/**
 * Art direction palette for Breakwater: cold ocean blue and oxidised teal for the fortress, amber
 * for practical work lights, verdigris brass for the tide machinery. Mara's warm coral scarf is the
 * only other saturated warm colour, which keeps the player readable against the environment.
 */
export const Palette = {
  fog: new THREE.Color('#14303a'),
  moon: new THREE.Color('#a9c8ff'),
  lantern: new THREE.Color('#ffae5a'),
  lanternHot: new THREE.Color('#ffd49a'),
  pilot: new THREE.Color('#5fb7d9'),
  skyTop: new THREE.Color('#050a12'),
  skyHorizon: new THREE.Color('#1d3644'),
  water: new THREE.Color('#0a2a33'),
  scarf: new THREE.Color('#e06a4a'),
};

export interface MaterialLibrary {
  stone: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  ironDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  wool: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  glassWarm: THREE.MeshStandardMaterial;
  glassCold: THREE.MeshStandardMaterial;
  cellShadow: THREE.MeshBasicMaterial;
  tin: THREE.MeshStandardMaterial;
  waterInside: THREE.MeshStandardMaterial;
  warningLamp: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  grate: THREE.MeshStandardMaterial;
}

export function createMaterials(tex: TextureLibrary): MaterialLibrary {
  const textured = (set: { map: THREE.Texture; normalMap: THREE.Texture }, params: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, vertexColors: true, ...params });

  return {
    stone: textured(tex.stone, { roughness: 0.92, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1) }),
    stoneDark: textured(tex.stone, { roughness: 0.95, metalness: 0, color: new THREE.Color('#7f8a8a'), normalScale: new THREE.Vector2(1.1, 1.1) }),
    floor: textured(tex.floor, { roughness: 0.82, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9) }),
    iron: textured(tex.iron, { roughness: 0.55, metalness: 0.75, color: new THREE.Color('#c9ced2') }),
    ironDark: textured(tex.iron, { roughness: 0.6, metalness: 0.6, color: new THREE.Color('#7d8389') }),
    brass: textured(tex.brass, { roughness: 0.38, metalness: 0.85 }),
    wood: textured(tex.wood, { roughness: 0.85, metalness: 0 }),
    wool: textured(tex.wool, { roughness: 1, metalness: 0 }),
    rope: new THREE.MeshStandardMaterial({ color: '#8f7a55', roughness: 1 }),
    glassWarm: new THREE.MeshStandardMaterial({
      color: '#2a1a08',
      emissive: Palette.lantern,
      emissiveIntensity: 3.2,
      roughness: 0.3,
    }),
    glassCold: new THREE.MeshStandardMaterial({ color: '#0d1a20', emissive: Palette.pilot, emissiveIntensity: 0.35, roughness: 0.2 }),
    cellShadow: new THREE.MeshBasicMaterial({ color: '#030608' }),
    tin: new THREE.MeshStandardMaterial({ color: '#9aa3a6', roughness: 0.42, metalness: 0.85, map: tex.iron.map }),
    waterInside: new THREE.MeshStandardMaterial({ color: '#2b6f7a', roughness: 0.08, metalness: 0.1, emissive: '#0d3a42', emissiveIntensity: 0.6 }),
    warningLamp: new THREE.MeshStandardMaterial({ color: '#300806', emissive: '#ff3a1c', emissiveIntensity: 0 }),
    // Fresh repair copper: brighter and less corroded than the old brass, so the new part stands out.
    copper: new THREE.MeshStandardMaterial({ color: '#d4815a', roughness: 0.3, metalness: 0.9 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.25, metalness: 0 }),
    grate: textured(tex.iron, { roughness: 0.6, metalness: 0.7, color: new THREE.Color('#9aa0a6') }),
  };
}

/**
 * Adds a view-dependent rim light to a standard material. Used on the player so the silhouette
 * stays readable in dark areas without lighting the whole scene brighter.
 */
export function addRimLight(material: THREE.MeshStandardMaterial, color: THREE.ColorRepresentation, strength: number, power = 3): void {
  const rimColor = new THREE.Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: rimColor };
    shader.uniforms.rimStrength = { value: strength };
    shader.uniforms.rimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), rimPower);
          totalEmissiveRadiance += rimColor * rimF * rimStrength;
        }`,
      );
  };
  material.customProgramCacheKey = () => `rim-${power}`;
}

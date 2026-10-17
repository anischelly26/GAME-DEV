import * as THREE from 'three';

/**
 * Photographed CC0 surface textures from Poly Haven (public/assets/textures, fetched by
 * scripts/fetch-textures.mjs; sources in docs/ASSETS.md): diffuse, normal, and AO/roughness/
 * metalness packed into one "arm" map. Each set is tiled at its real-world size: the level's UVs
 * are in units of UV_METRES (worldBox and prismGeometry default to 3 m per UV unit).
 */
export const UV_METRES = 3;

export interface SurfaceSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
}

type CoreSurface = 'stone' | 'stoneDark' | 'floor' | 'grate' | 'iron' | 'wood';
/** Chapter Two's outdoor sets: the green, the lane, the shingle, roofs and garden walls. */
type OutdoorSurface = 'grass' | 'gravel' | 'shingle' | 'slate' | 'mossyStone' | 'sand' | 'rock';
export type SurfaceKey = CoreSurface | OutdoorSurface;
export type SurfaceLibrary = Record<CoreSurface, SurfaceSet> & Partial<Record<OutdoorSurface, SurfaceSet>>;

interface ManifestEntry {
  id: string;
  sizeMetres: [number, number];
}

/** Load the sets named in `keys` (a chapter loads only what it uses). */
export async function loadSurfaces(anisotropy: number, keys: SurfaceKey[]): Promise<SurfaceLibrary | null> {
  try {
    const base = `${import.meta.env.BASE_URL}assets/textures/`;
    const manifest = (await (await fetch(`${base}manifest.json`)).json()) as Record<SurfaceKey, ManifestEntry>;
    const loader = new THREE.TextureLoader();
    const out: Partial<SurfaceLibrary> = {};
    await Promise.all(
      (Object.keys(manifest) as SurfaceKey[])
        .filter((key) => keys.includes(key))
        .map(async (key) => {
        const { id, sizeMetres } = manifest[key];
        const [map, normalMap, arm] = await Promise.all(['diff', 'nor', 'arm'].map((n) => loader.loadAsync(`${base}${id}/${n}.jpg`)));
        map.colorSpace = THREE.SRGBColorSpace;
        for (const t of [map, normalMap, arm]) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(UV_METRES / sizeMetres[0], UV_METRES / sizeMetres[1]);
          t.anisotropy = anisotropy;
        }
        out[key] = { map, normalMap, arm };
      }),
    );
    return out as SurfaceLibrary;
  } catch (e) {
    console.warn('Surface textures unavailable; using the procedural ones.', e);
    return null;
  }
}

/** Use a photographed set on a material: colour, normal, and the packed AO/roughness/metalness. */
export function applySurface(material: THREE.MeshStandardMaterial, set: SurfaceSet, opts: { metal?: boolean; normalScale?: number } = {}): void {
  material.map = set.map;
  material.normalMap = set.normalMap;
  material.normalScale.setScalar(opts.normalScale ?? 1);
  material.roughnessMap = set.arm;
  material.roughness = 1;
  material.aoMap = set.arm;
  material.aoMapIntensity = 0.8;
  if (opts.metal) {
    material.metalnessMap = set.arm;
    material.metalness = 1;
  } else {
    material.metalnessMap = null;
    material.metalness = 0;
  }
  material.needsUpdate = true;
}

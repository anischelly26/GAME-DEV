import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Source files whose content determines Mara's baked meshes. */
export const MARA_SOURCES = ['sdf.ts', 'mesher.ts', 'simplify.ts', 'maraParts.ts', 'maraBuild.ts', 'bakeFormat.ts'].map((f) => join('src', 'character', f));

/**
 * Hash of the character source (line endings normalised) and the meshoptimizer version. The game
 * only uses public/mara/mara.bin when the hash stored in it matches the one compiled into the
 * bundle; otherwise it rebuilds Mara at load time.
 */
export function maraSourceHash(root = process.cwd()) {
  const h = createHash('sha256');
  for (const f of MARA_SOURCES) h.update(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'));
  h.update(JSON.parse(readFileSync(join(root, 'node_modules', 'meshoptimizer', 'package.json'), 'utf8')).version);
  return h.digest('hex').slice(0, 16);
}

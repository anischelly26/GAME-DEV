import { defineConfig } from 'vite';
import { maraSourceHash } from './scripts/maraHash.mjs';

export default defineConfig({
  // Relative base so the production build works from any static host or sub-path.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Rapier ships its WASM inlined in JS (~3 MB), so the main chunk is large by design for now.
  build: { target: 'es2022', chunkSizeWarningLimit: 5500 },
  // The character sculpting worker imports ES modules (and meshoptimizer's inlined WASM).
  worker: { format: 'es' },
  // Lets the game check that public/mara/mara.bin was baked from the current character source.
  define: { __MARA_BAKE_HASH__: JSON.stringify(maraSourceHash()) },
});

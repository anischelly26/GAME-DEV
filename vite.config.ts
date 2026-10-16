import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or sub-path.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    // Local captures, builds of older commits and check copies live in artifacts/: never watch them
    // (a tsconfig there made the dev server drop its dependency cache and serve 504s).
    watch: { ignored: ['**/artifacts/**', '**/import-cache/**', '**/test-results/**', '**/dist/**'] },
  },
  // Pre-bundle from the game and the import tools only (not stray HTML under artifacts/).
  optimizeDeps: { entries: ['index.html', 'tools/*.html'] },
  preview: { port: 4173, strictPort: true },
  // Rapier ships its WASM inlined in JS (~3 MB), so the main chunk is large by design for now.
  build: { target: 'es2022', chunkSizeWarningLimit: 5500 },
});

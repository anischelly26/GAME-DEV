import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or sub-path.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Rapier ships its WASM inlined in JS (~3 MB), so the main chunk is large by design for now.
  build: { target: 'es2022', chunkSizeWarningLimit: 5500 },
});

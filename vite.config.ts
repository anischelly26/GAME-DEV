import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or sub-path.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});

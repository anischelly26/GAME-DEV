import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks run the real game in a browser. Headless Chromium renders WebGL with SwiftShader
 * when no GPU is available, so this works on CI machines and reviewer sandboxes.
 * Set PW_CHANNEL=msedge or PW_CHANNEL=chrome to use an installed browser instead of the bundled one.
 */
const port = Number(process.env.PW_PORT ?? 5199);
/**
 * Without PW_CHANNEL the bundled Chromium renders in software (SwiftShader), at roughly two seconds
 * per frame for this game, so its time limits are four times longer than on a real GPU.
 */
const slow = process.env.PW_CHANNEL ? 1 : 4;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000 * slow,
  expect: { timeout: 20_000 * slow },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 720 },
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

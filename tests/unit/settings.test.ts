import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/ui/HUD';

function withStored(value: unknown): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => JSON.stringify(value),
    setItem: () => undefined,
  };
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('settings', () => {
  it('defaults: sensitivity 25 both ways, weak assist, shake on, 90 degree FOV, Auto graphics', () => {
    expect(loadSettings()).toMatchObject({ lookX: 25, lookY: 25, invertX: false, invertY: false, cameraAssist: 'weak', cameraShake: true, fov: 90, quality: 'auto' });
  });

  it('moves a version 2 mouse sensitivity onto both new sliders', () => {
    withStored({ sensitivity: 2, invertY: true, volume: 0.5, quality: 'low', version: 2 });
    const s = loadSettings();
    expect(s).toMatchObject({ lookX: 50, lookY: 50, invertY: true, volume: 0.5, quality: 'low', version: DEFAULT_SETTINGS.version });
    expect('sensitivity' in s).toBe(false);
  });

  it('keeps version 3 settings as saved', () => {
    withStored({ ...DEFAULT_SETTINGS, lookX: 70, lookY: 12, invertX: true, cameraAssist: 'off', cameraShake: false, fov: 100 });
    expect(loadSettings()).toMatchObject({ lookX: 70, lookY: 12, invertX: true, cameraAssist: 'off', cameraShake: false, fov: 100 });
  });
});

import type { Level, LevelContext } from './Level';
import type { SurfaceKey } from '../world/surfaces';

/**
 * Light and air for a chapter: sky, fog, the key light (the moon in Breakwater, a low sun at dawn on
 * the spur), the sky fill, and the colours the metals reflect.
 */
export interface Atmosphere {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  /** Key light colour, intensity and direction (toward the light). */
  light: string;
  lightIntensity: number;
  lightDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** Star brightness (0: none) and the size of the moon or sun disc (1: the moon). */
  stars: number;
  disc: number;
  /** Reflections: the sky below and above, and the warm glow round the horizon. */
  env: { low: string; high: string; glow: string; glowStrength: number };
  /** Reflection strength. */
  envIntensity: number;
}

export interface Chapter {
  number: number;
  title: string;
  /** One line for the title screen. */
  blurb: string;
  loading: string;
  /** Photographed surface sets this chapter uses (others are not downloaded). */
  surfaces: SurfaceKey[];
  atmosphere: Atmosphere;
  create(ctx: LevelContext): Promise<Level>;
}

const CORE: SurfaceKey[] = ['stone', 'stoneDark', 'floor', 'grate', 'iron', 'wood'];

export const CHAPTERS: Chapter[] = [
  {
    number: 1,
    title: 'The Quiet Cell',
    blurb: 'Mara Venn fell asleep in her workshop and woke up inside Breakwater, the prison that runs on the tide.',
    loading: 'Charging the tide engine…',
    surfaces: CORE,
    atmosphere: {
      skyTop: '#050a12',
      skyHorizon: '#1d3644',
      fog: '#14303a',
      fogDensity: 0.024,
      light: '#a9c8ff',
      lightIntensity: 2.1,
      lightDir: [-0.38, 0.33, -0.86],
      hemiSky: '#5d7f99',
      hemiGround: '#2e261d',
      hemiIntensity: 1.25,
      stars: 1,
      disc: 1,
      env: { low: '#0d1217', high: '#1f3347', glow: '#e68c40', glowStrength: 0.5 },
      envIntensity: 0.95,
    },
    create: async (ctx) => new (await import('./breakwater/QuietCellLevel')).QuietCellLevel(ctx),
  },
  {
    number: 2,
    title: "The Warders' Green",
    blurb: "Dawn on the spur behind Breakwater: the village where the prison's keepers once raised their children, and the Watch that still patrols it.",
    loading: 'Waiting for first light…',
    surfaces: [...CORE, 'grass', 'gravel', 'shingle', 'slate', 'mossyStone'],
    atmosphere: {
      // Blue hour turning gold: a low sun over the sea, cool mist in the hollows.
      skyTop: '#2c4a6e',
      skyHorizon: '#e7b48a',
      fog: '#9fb3bd',
      fogDensity: 0.016,
      light: '#ffc58f',
      lightIntensity: 2.6,
      // Low over the sea to the south-east: it lights the cove and throws long shadows up the lane.
      lightDir: [0.42, 0.33, -0.85],
      hemiSky: '#a9c4dc',
      hemiGround: '#5a5040',
      hemiIntensity: 1.35,
      stars: 0.15,
      disc: 2.2,
      env: { low: '#3a4650', high: '#8fb0cc', glow: '#ffb070', glowStrength: 0.8 },
      envIntensity: 1.0,
    },
    create: async (ctx) => {
      const { WardersGreenLevel } = await import('./green/WardersGreenLevel');
      return WardersGreenLevel.create(ctx);
    },
  },
];

export function chapterByNumber(n: number): Chapter {
  return CHAPTERS.find((c) => c.number === n) ?? CHAPTERS[0];
}

/** "Chapter One", "Chapter Two", ... */
export function chapterLabel(n: number): string {
  return `Chapter ${['Zero', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? n}`;
}

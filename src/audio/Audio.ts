import * as THREE from 'three';

/**
 * A game sound made of recorded CC0 samples (public/assets/audio, sources in docs/ASSETS.md):
 * each layer picks a random variation of a sample set, at a gain and a random pitch in a range.
 */
type Layer = [set: string, gain: number, pitchMin: number, pitchMax: number];
const SAMPLED: Record<string, Layer[]> = {
  'footstep:stone': [['step.stone', 0.55, 0.92, 1.08]],
  'footstep:wood': [['step.wood', 0.6, 0.92, 1.08]],
  'footstep:metal': [['step.metal', 0.32, 0.95, 1.1]],
  jump: [['cloth', 0.45, 0.95, 1.12]],
  land: [['land', 0.75, 0.92, 1.05]],
  'land:metal': [['land.metal', 0.5, 0.92, 1.05], ['land', 0.4, 0.95, 1.05]],
  'land:heavy': [['land.heavy', 0.85, 0.85, 0.95]],
  doubleJump: [['thruster', 0.3, 1.25, 1.4], ['cloth', 0.35, 1.05, 1.15]],
  airDash: [['thruster', 0.45, 0.95, 1.08], ['cloth', 0.35, 0.9, 1.0]],
  roll: [['cloth', 0.6, 0.82, 0.92], ['land', 0.25, 1.1, 1.2]],
  poundStart: [['cloth', 0.5, 1.2, 1.35]],
  groundPound: [['metal.heavy', 0.6, 0.75, 0.85], ['boom', 0.55, 1.0, 1.1], ['land.heavy', 0.5, 0.8, 0.9]],
  latch: [['latch', 0.8, 0.95, 1.05], ['metal.heavy', 0.45, 0.85, 0.95]],
  lever: [['click', 0.7, 0.9, 1.1], ['metal.light', 0.35, 0.9, 1.1]],
  valveOpen: [['creak', 0.6, 0.95, 1.1]],
  valveClose: [['creak', 0.6, 0.85, 0.95]],
  grab: [['cloth', 0.45, 1.0, 1.1], ['metal.light', 0.22, 1.1, 1.25]],
  climb: [['cloth', 0.45, 0.88, 0.98]],
  vault: [['cloth', 0.55, 1.05, 1.15], ['metal.light', 0.2, 1.2, 1.3]],
  pickup: [['belt', 0.8, 1.0, 1.05], ['jingle.gadget', 0.45, 1, 1]],
  markFound: [['jingle.found', 0.5, 1, 1], ['glass', 0.25, 1.0, 1.1]],
  piston: [['metal.heavy', 0.45, 0.6, 0.7]],
  whistlePull: [['click', 0.6, 0.8, 0.9]],
  thunk: [['wood.medium', 0.6, 0.9, 1.05]],
  pot: [['pot', 0.6, 0.95, 1.05]],
  uiSelect: [['ui.select', 0.35, 1, 1]],
};
/** These keep their synthesised layer too (steam, hiss and machinery read better with it). */
const ALSO_SYNTH = new Set(['latch', 'lever', 'piston', 'groundPound', 'airDash']);

/** Music and ambience beds (public/assets/audio/manifest.json "beds"), and their levels. */
const BED_GAIN: Record<string, number> = { title: 0.55, workshop: 0.6, cell: 0.42, hall: 0.5, ending: 0.62, tomb: 0.38, waves: 0.5 };

/**
 * Game audio. Recorded CC0 samples (with random variations and pitch) for footsteps, impacts,
 * cloth, metal and the steam kicker; music and ambience beds that crossfade with the place; and
 * Web Audio synthesis where it reads better or no sample fits (steam, hiss, the engine's drone,
 * the intercom), or until the samples have loaded.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private volume = 0.8;
  private musicVolume = 0.7;
  private manifest: { sfx: Record<string, string[]>; beds: Record<string, { file: string; loop: boolean }> } | null = null;
  private readonly samples = new Map<string, AudioBuffer[]>();
  private readonly bedBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly playing: Record<'music' | 'ambience', { name: string; src: AudioBufferSourceNode | null; gain: GainNode } | null> = { music: null, ambience: null };
  private readonly wanted: Record<'music' | 'ambience', string | null> = { music: null, ambience: null };
  private readonly base = `${import.meta.env.BASE_URL}assets/audio/`;
  private readonly listenerPos = new THREE.Vector3();
  private readonly listenerRight = new THREE.Vector3(1, 0, 0);

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.55;
    this.ambBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    void this.loadSamples();
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(paused: boolean): void {
    if (!this.ctx) return;
    this.ambBus.gain.setTargetAtTime(paused ? 0.12 : 0.55, this.ctx.currentTime, 0.2);
    this.musicBus.gain.setTargetAtTime(paused ? this.musicVolume * 0.35 : this.musicVolume, this.ctx.currentTime, 0.3);
  }

  /** Whether the recorded samples have loaded (tests, debug overlay). */
  get samplesReady(): boolean {
    return this.samples.size > 0;
  }

  /** The music bed now wanted (null: silence), crossfading over `fade` seconds. */
  setMusic(name: string | null, fade = 2.5): void {
    this.setBed('music', name, fade);
  }

  /** The ambience bed now wanted (null: none). */
  setAmbience(name: string | null, fade = 3): void {
    this.setBed('ambience', name, fade);
  }

  get currentMusic(): string | null {
    return this.wanted.music;
  }

  get currentAmbience(): string | null {
    return this.wanted.ambience;
  }

  private async loadSamples(): Promise<void> {
    try {
      this.manifest = await (await fetch(`${this.base}manifest.json`)).json();
    } catch {
      return; // no samples: everything stays synthesised
    }
    const ctx = this.ctx!;
    await Promise.all(
      Object.entries(this.manifest!.sfx).map(async ([name, files]) => {
        const buffers: AudioBuffer[] = [];
        for (const f of files) {
          try {
            buffers.push(await ctx.decodeAudioData(await (await fetch(this.base + f)).arrayBuffer()));
          } catch {
            /* skip a file that fails to load */
          }
        }
        if (buffers.length) this.samples.set(name, buffers);
      }),
    );
    // Beds requested before the manifest arrived.
    for (const slot of ['music', 'ambience'] as const) if (this.wanted[slot]) this.startBed(slot, this.wanted[slot]!, 2);
  }

  private bed(name: string): Promise<AudioBuffer | null> {
    let p = this.bedBuffers.get(name);
    if (!p) {
      const entry = this.manifest?.beds[name];
      p = entry
        ? fetch(this.base + entry.file)
            .then((r) => r.arrayBuffer())
            .then((b) => this.ctx!.decodeAudioData(b))
            .catch(() => null)
        : Promise.resolve(null);
      this.bedBuffers.set(name, p);
    }
    return p;
  }

  private setBed(slot: 'music' | 'ambience', name: string | null, fade: number): void {
    if (this.wanted[slot] === name) return;
    this.wanted[slot] = name;
    if (!this.ctx) return;
    const old = this.playing[slot];
    if (old) {
      const t = this.ctx.currentTime;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      old.src?.stop(t + fade + 0.1);
      this.playing[slot] = null;
    }
    if (name && this.manifest) this.startBed(slot, name, fade);
  }

  private startBed(slot: 'music' | 'ambience', name: string, fade: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(slot === 'music' ? this.musicBus : this.ambBus);
    const entry = { name, src: null as AudioBufferSourceNode | null, gain };
    this.playing[slot] = entry;
    void this.bed(name).then((buf) => {
      if (!buf || this.playing[slot] !== entry) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const loop = this.manifest!.beds[name]?.loop ?? false;
      if (loop) {
        // Loop past the recording's silent lead-in and tail.
        const [a, b] = audibleRange(buf);
        src.loop = true;
        src.loopStart = a;
        src.loopEnd = b;
      }
      src.connect(gain);
      src.start(ctx.currentTime, loop ? audibleRange(buf)[0] : 0);
      entry.src = src;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(BED_GAIN[name] ?? 0.5, t + fade);
    });
  }

  /** Play a sampled sound if its samples are loaded. Returns false if it should be synthesised. */
  private playSample(name: string, pos: THREE.Vector3Like | undefined, volume: number): boolean {
    const layers = SAMPLED[name];
    if (!layers) return false;
    let played = false;
    for (const [set, gain, p0, p1] of layers) {
      const buffers = this.samples.get(set);
      if (!buffers) continue;
      const src = this.ctx!.createBufferSource();
      src.buffer = buffers[Math.floor(Math.random() * buffers.length)];
      src.playbackRate.value = p0 + Math.random() * (p1 - p0);
      src.connect(this.out(pos, gain * volume));
      src.start();
      played = true;
    }
    return played;
  }

  setListener(camera: THREE.Camera): void {
    camera.getWorldPosition(this.listenerPos);
    this.listenerRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  // ---------------------------------------------------------------- building blocks

  private noise(duration: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(this.ctx!.currentTime, Math.random() * 1.5, duration + 0.1);
    return src;
  }

  /** Output node for a sound at a world position: distance attenuation + stereo pan. */
  private out(pos?: THREE.Vector3Like, gain = 1): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let level = gain;
    const pan = ctx.createStereoPanner();
    if (pos) {
      const dx = pos.x - this.listenerPos.x;
      const dy = pos.y - this.listenerPos.y;
      const dz = pos.z - this.listenerPos.z;
      const d = Math.hypot(dx, dy, dz);
      level *= 1 / (1 + Math.max(0, d - 1.5) / 4);
      pan.pan.value = d > 0.01 ? Math.max(-0.8, Math.min(0.8, (dx * this.listenerRight.x + dy * this.listenerRight.y + dz * this.listenerRight.z) / d)) : 0;
    }
    g.gain.value = level;
    g.connect(pan);
    pan.connect(this.sfxBus);
    return g;
  }

  private env(node: GainNode, t: number, attack: number, peak: number, decay: number): void {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, dest: AudioNode, attack = 0.005, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private burst(filterType: BiquadFilterType, freq: number, q: number, dur: number, peak: number, dest: AudioNode, attack = 0.005, delay = 0, freqEnd?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = this.noise(dur + attack + delay);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f).connect(g).connect(dest);
  }

  /** Inharmonic partials: metal being struck. */
  private metal(base: number, dur: number, peak: number, dest: AudioNode, delay = 0): void {
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.6],
      [5.4, 0.35],
      [8.93, 0.2],
    ]) {
      this.tone('sine', base * ratio, base * ratio * 0.995, dur * (1.2 - ratio * 0.08), peak * amp, dest, 0.002, delay);
    }
  }

  // ---------------------------------------------------------------- ambience

  private startAmbience(): void {
    const ctx = this.ctx!;
    // Engine drone: two detuned low oscillators through a slowly breathing low-pass.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.13;
    for (const f of [41, 61.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 8.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    lp.connect(droneGain).connect(this.ambBus);
    // Distant surf: band-passed noise swelling slowly.
    const surf = ctx.createBufferSource();
    surf.buffer = this.noiseBuffer;
    surf.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 600;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.06;
    const swell = ctx.createOscillator();
    swell.frequency.value = 1 / 6.5;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.04;
    swell.connect(swellGain).connect(surfGain.gain);
    swell.start();
    surf.connect(bp).connect(surfGain).connect(this.ambBus);
    surf.start();
  }

  // ---------------------------------------------------------------- effects

  play(name: string, pos?: THREE.Vector3Like, volume = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.playSample(name, pos, volume) && !ALSO_SYNTH.has(name)) return;
    // Surface variants fall back to the plain synthesised sound.
    if (name.startsWith('footstep:')) name = 'footstep';
    else if (name.startsWith('land:')) name = 'land';
    const o = (g = 1) => this.out(pos, g * volume);
    switch (name) {
      case 'footstep':
        this.burst('bandpass', 900 + Math.random() * 500, 1.2, 0.07, 0.18, o());
        this.tone('sine', 110, 70, 0.06, 0.06, o());
        break;
      case 'jump':
        this.burst('bandpass', 1400, 0.8, 0.16, 0.08, o(), 0.02, 0, 2400);
        break;
      case 'land':
        this.tone('sine', 120, 50, 0.16, 0.4 * volume, o());
        this.burst('lowpass', 900, 0.7, 0.12, 0.22, o());
        break;
      case 'valveClose':
      case 'valveOpen': {
        // Stiff wheel: a creak glide plus a seat clunk.
        const up = name === 'valveOpen';
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(up ? 180 : 260, t);
        osc.frequency.linearRampToValueAtTime(up ? 260 : 150, t + 0.45);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        bp.Q.value = 6;
        const g = ctx.createGain();
        this.env(g, t, 0.05, 0.07, 0.45);
        osc.connect(bp).connect(g).connect(o());
        osc.start(t);
        osc.stop(t + 0.6);
        this.metal(180, 0.25, 0.12, o(), 0.48);
        break;
      }
      case 'lever':
        this.metal(140, 0.3, 0.16, o());
        this.burst('lowpass', 400, 0.7, 0.1, 0.2, o());
        break;
      case 'hiss':
        this.burst('highpass', 3500, 0.5, 0.75, 0.22, o(), 0.03);
        this.metal(95, 0.25, 0.12, o(), 0.35);
        break;
      case 'vent':
        this.burst('bandpass', 2400, 0.6, 0.9, 0.1, o(), 0.08, 0, 900);
        this.metal(70, 0.12, 0.05, o(), 0.05);
        break;
      case 'piston':
        this.tone('sawtooth', 55, 95, 1.8, 0.07, o(), 0.2);
        this.burst('bandpass', 1800, 0.7, 1.7, 0.12, o(), 0.2);
        break;
      case 'latch':
        this.metal(320, 0.35, 0.3, o());
        this.metal(240, 0.4, 0.2, o(), 0.06);
        break;
      case 'engineThump':
        this.tone('sine', 52, 34, 0.9, 0.25 * volume, this.ambBus, 0.03);
        break;
      case 'drip':
        this.tone('sine', 1900 + Math.random() * 300, 1500, 0.18, 0.08, o(), 0.001);
        this.metal(640, 0.12, 0.02, o(), 0);
        break;
      case 'ignite':
        this.burst('lowpass', 300, 0.7, 0.5, 0.28, o(), 0.05, 0, 1400);
        this.tone('sine', 660, 660, 1.4, 0.06, o(), 0.02, 0.1);
        this.tone('sine', 990, 990, 1.2, 0.04, o(), 0.02, 0.18);
        break;
      case 'lampOn':
        this.metal(900, 0.08, 0.05, o(0.8));
        this.burst('lowpass', 500, 0.7, 0.3, 0.1, o(0.8), 0.04, 0.05);
        break;
      case 'intercom':
        this.burst('bandpass', 2200, 2, 0.35, 0.12, o());
        this.tone('square', 880, 880, 0.12, 0.04, o(), 0.002, 0.35);
        break;
      // Movement 2.0 (synthesised stand-ins until a sample is loaded for the name).
      case 'doubleJump':
        this.burst('bandpass', 1400, 0.9, 0.35, 0.16, o(), 0.004, 0, 500);
        this.tone('sine', 300, 520, 0.18, 0.05, o(), 0.004);
        break;
      case 'airDash':
        this.burst('bandpass', 900, 0.7, 0.4, 0.2, o(), 0.003, 0, 2600);
        break;
      case 'roll':
        this.burst('lowpass', 700, 0.7, 0.3, 0.12, o(), 0.01, 0, 250);
        break;
      case 'poundStart':
        this.burst('bandpass', 500, 1.2, 0.2, 0.08, o(), 0.004, 0, 1600);
        break;
      case 'groundPound':
        this.tone('sine', 90, 38, 0.5, 0.3, o(), 0.004);
        this.burst('lowpass', 900, 0.7, 0.45, 0.28, o(), 0.002, 0, 180);
        this.metal(140, 0.4, 0.08, o(), 0.01);
        break;
      case 'horn':
        // The prison's pressure horn: a low, slightly detuned two-note blast.
        this.tone('sawtooth', 92, 88, 2.6, 0.07, o(), 0.3);
        this.tone('sawtooth', 138, 133, 2.6, 0.045, o(), 0.3);
        this.burst('lowpass', 260, 0.7, 2.4, 0.05, o(), 0.3);
        break;
      case 'static':
        this.burst('bandpass', 3000, 1.5, 0.5, 0.08, o(), 0.01);
        break;
      case 'splash':
        this.burst('lowpass', 1600, 0.6, 0.6, 0.35, o(), 0.01, 0, 300);
        break;
      case 'paper':
        this.burst('highpass', 2500, 0.7, 0.18, 0.06, o());
        break;
      case 'respawn':
        this.tone('sine', 440, 660, 0.4, 0.05, o(), 0.05);
        break;
      default:
        break;
    }
  }
}

/** Seconds where a recording becomes audible and stops being audible (silent lead-in and tail). */
function audibleRange(buf: AudioBuffer): [number, number] {
  const d = buf.getChannelData(0);
  const thr = 0.004;
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < thr) a++;
  let b = d.length - 1;
  while (b > a && Math.abs(d[b]) < thr) b--;
  return [a / buf.sampleRate, (b + 1) / buf.sampleRate];
}

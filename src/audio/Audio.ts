import * as THREE from 'three';

/**
 * Procedural sound: every effect is synthesised with Web Audio at runtime, so there are no audio
 * assets to license. These are honest placeholders designed to communicate state (pressure, latch,
 * landing) until recorded sounds replace them.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private volume = 0.8;
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

  suspend(paused: boolean): void {
    if (!this.ctx) return;
    this.ambBus.gain.setTargetAtTime(paused ? 0.12 : 0.55, this.ctx.currentTime, 0.2);
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

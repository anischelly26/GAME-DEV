import './hud.css';
import type { Line } from '../gameplay/Dialogue';

export interface Settings {
  /** Horizontal and vertical look sensitivity, 1-100 (25 = 0.0022 rad per mouse pixel). */
  lookX: number;
  lookY: number;
  invertX: boolean;
  invertY: boolean;
  /** Horizontal field of view in degrees at 16:9, 70-110. */
  fov: number;
  cameraShake: boolean;
  /** How much the camera follows on its own: never in the air, climbing or interacting. */
  cameraAssist: 'off' | 'weak' | 'strong';
  volume: number; // 0..1
  /** Music level, 0..1, under the master volume. */
  music: number;
  /** 'auto' picks Low on integrated and mobile GPUs, High otherwise (see RenderPipeline). */
  quality: 'auto' | 'high' | 'low';
  version?: number;
}

const SETTINGS_VERSION = 3;
export const DEFAULT_SETTINGS: Settings = {
  lookX: 25,
  lookY: 25,
  invertX: false,
  invertY: false,
  fov: 90,
  cameraShake: true,
  cameraAssist: 'weak',
  volume: 0.8,
  music: 0.7,
  quality: 'auto',
  version: SETTINGS_VERSION,
};
const SETTINGS_KEY = 'it-takes-one.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Settings> & { sensitivity?: number };
      const version = stored.version ?? 1;
      // Version 1 saved 'high' as the default whenever any setting changed; there was no 'auto'.
      if (version < 2) stored.quality = 'auto';
      // Version 2 had one mouse sensitivity multiplier (0.2-3, default 1).
      if (version < 3 && typeof stored.sensitivity === 'number') {
        stored.lookX = stored.lookY = Math.round(Math.min(100, Math.max(1, stored.sensitivity * 25)));
      }
      delete stored.sensitivity;
      return { ...DEFAULT_SETTINGS, ...stored, version: SETTINGS_VERSION };
    }
  } catch {
    /* storage unavailable: use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignored */
  }
}

const SPEAKER_LABEL: Record<string, string> = { Mara: 'Mara', Horn: "Warden's horn", Intercom: 'Intercom', Watch: 'The Watch', Tip: '' };

const CONTROLS_HTML = `
  <dl class="controls">
    <dt>W A S D / Arrows</dt><dd>Move (physical keys: Z Q S D on AZERTY)</dd>
    <dt>Mouse</dt><dd>Look (click the game to capture the mouse; drag also works)</dd>
    <dt>Space</dt><dd>Jump (hold for higher)</dd>
    <dt>Shift</dt><dd>Dash (a roll); hold after it to sprint</dd>
    <dt>E / F</dt><dd>Interact</dd>
    <dt>C / Middle mouse</dt><dd>Recenter camera behind Mara</dd>
    <dt>Esc / P</dt><dd>Pause</dd>
    <dt>Later</dt><dd>A steam kicker: Space again in the air, Shift in the air, Ctrl to slam down. Land on pipes to ride them.</dd>
    <dt>Gamepad</dt><dd>Left stick move, right stick look, A jump, B dash, X interact, RB slam, R3 recenter, Start pause</dd>
  </dl>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export interface PauseHandlers {
  resume(): void;
  restartCheckpoint(): void;
  restartSection(): void;
  hint(): void;
  settingsChanged(s: Settings): void;
}

/** DOM overlay for everything that isn't the 3D view. */
export class HUD {
  readonly root: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveText: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly tipEl: HTMLElement;
  private readonly abilityEl: HTMLElement;
  private readonly areaEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private abilityTimer = 0;
  private areaTimer = 0;
  private toastTimer = 0;
  private readonly fadeEl: HTMLElement;
  private readonly fallFadeEl: HTMLElement;
  private readonly documentEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly skipEl: HTMLElement;
  private readonly storyEl: HTMLElement;
  private readonly letterboxEl: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly card: HTMLElement;
  private tipTimer = 0;
  private readonly shownTips = new Set<string>();
  documentOpen: string | null = null;
  private documentTimer = 0;
  settings: Settings = loadSettings();
  /** What 'Auto' resolves to on this machine, shown in the settings menu. */
  autoQualityLabel = 'High';

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud', container);
    this.fallFadeEl = el('div', 'fade', this.root);
    this.letterboxEl = el('div', 'letterbox', this.root);
    this.storyEl = el('div', 'story hidden', this.root);
    this.objective = el('div', 'objective hidden', this.root, '<div class="label">Objective</div><div class="text"></div>');
    this.objectiveText = this.objective.querySelector('.text')!;
    this.prompt = el('div', 'prompt hidden', this.root);
    this.subtitle = el('div', 'subtitle hidden', this.root);
    this.tipEl = el('div', 'tip hidden', this.root);
    this.abilityEl = el('div', 'ability hidden', this.root);
    this.areaEl = el('div', 'area hidden', this.root);
    this.toastEl = el('div', 'toast hidden', this.root);
    this.documentEl = el('div', 'document hidden', this.root);
    this.debugEl = el('div', 'debug hidden', this.root);
    this.skipEl = el('div', 'skip hidden', this.root, '<span class="key">Space</span> or <span class="key">E</span> skip');
    this.fadeEl = el('div', 'fade', this.root);
    this.screen = el('div', 'screen', this.root);
    this.card = el('div', 'card', this.screen);
  }

  // ---------------------------------------------------------------- screens

  showLoading(text: string): void {
    this.screen.classList.remove('hidden');
    this.card.innerHTML = `<div class="eyebrow">It Takes One</div><p class="loading">${text}</p>`;
  }

  showTitle(onStart: () => void): void {
    this.screen.classList.remove('hidden');
    this.card.innerHTML = `
      <div class="eyebrow">Working title</div>
      <h1>It Takes One</h1>
      <p>Mara Venn fell asleep in her workshop and woke up inside Breakwater, the prison that runs
      on the tide.<br/>Chapter One, <i>The Quiet Cell</i>.</p>
      ${CONTROLS_HTML}
      <div class="buttons"><button class="primary" data-a="start">Begin</button></div>`;
    const btn = this.card.querySelector<HTMLButtonElement>('[data-a="start"]')!;
    btn.focus();
    btn.addEventListener('click', () => {
      this.hideScreen();
      onStart();
    });
  }

  hideScreen(): void {
    this.screen.classList.add('hidden');
    this.screen.classList.remove('reward');
  }

  get screenVisible(): boolean {
    return !this.screen.classList.contains('hidden');
  }

  showPause(h: PauseHandlers, canRestartCheckpoint: boolean): void {
    this.screen.classList.remove('hidden', 'reward');
    const s = this.settings;
    this.card.innerHTML = `
      <div class="eyebrow">Paused</div>
      <h2>The Quiet Cell</h2>
      <div class="buttons">
        <button class="primary" data-a="resume">Resume</button>
        <button data-a="hint">Hint</button>
        ${canRestartCheckpoint ? '<button data-a="cp">Restart from service light</button>' : ''}
        <button data-a="restart">Restart section</button>
      </div>
      <div class="settings">
        <div class="group">Camera</div>
        <label>Horizontal sensitivity <span class="value" data-v="lookX">${s.lookX}</span><input type="range" min="1" max="100" step="1" value="${s.lookX}" data-s="lookX"></label>
        <label>Vertical sensitivity <span class="value" data-v="lookY">${s.lookY}</span><input type="range" min="1" max="100" step="1" value="${s.lookY}" data-s="lookY"></label>
        <label>Invert horizontal look <input type="checkbox" ${s.invertX ? 'checked' : ''} data-s="invertX"></label>
        <label>Invert vertical look <input type="checkbox" ${s.invertY ? 'checked' : ''} data-s="invertY"></label>
        <label>Field of view <span class="value" data-v="fov">${s.fov}°</span><input type="range" min="70" max="110" step="1" value="${s.fov}" data-s="fov"></label>
        <label>Camera assist <select data-s="cameraAssist"><option value="off" ${s.cameraAssist === 'off' ? 'selected' : ''}>Off</option><option value="weak" ${s.cameraAssist === 'weak' ? 'selected' : ''}>Weak</option><option value="strong" ${s.cameraAssist === 'strong' ? 'selected' : ''}>Strong</option></select></label>
        <label>Camera shake <input type="checkbox" ${s.cameraShake ? 'checked' : ''} data-s="cameraShake"></label>
        <div class="group">Sound and graphics</div>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></label>
        <label>Music <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-s="music"></label>
        <label>Graphics <select data-s="quality"><option value="auto" ${s.quality === 'auto' ? 'selected' : ''}>Auto (${this.autoQualityLabel})</option><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High (dedicated graphics card)</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low (faster)</option></select></label>
      </div>
      ${CONTROLS_HTML}`;
    const on = (a: string, fn: () => void) => this.card.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
    on('resume', h.resume);
    on('hint', () => {
      h.hint();
      h.resume();
    });
    on('cp', h.restartCheckpoint);
    on('restart', h.restartSection);
    this.card.querySelector<HTMLButtonElement>('[data-a="resume"]')!.focus();
    this.card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-s]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.s as keyof Settings;
        const next = { ...this.settings } as Record<string, unknown>;
        if (input instanceof HTMLInputElement && input.type === 'checkbox') next[key] = input.checked;
        else if (input instanceof HTMLInputElement) next[key] = Number(input.value);
        else next[key] = input.value;
        this.settings = next as unknown as Settings;
        const shown = this.card.querySelector(`[data-v="${key}"]`);
        if (shown) shown.textContent = key === 'fov' ? `${input.value}°` : input.value;
        saveSettings(this.settings);
        h.settingsChanged(this.settings);
      });
    });
  }

  /**
   * The completion screen. With `reward` it is laid over the current view (the vista the ending
   * framed) as a title card, with the choices fading in after a moment, rather than a menu.
   */
  showComplete(stats: { time: number; falls: number; title?: string; body?: string; reward?: boolean; marks?: { found: number; total: number } }, onRestart: () => void, onContinue: () => void): void {
    this.screen.classList.remove('hidden');
    this.screen.classList.toggle('reward', !!stats.reward);
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60)
      .toString()
      .padStart(2, '0');
    this.card.innerHTML = `
      <div class="eyebrow">${stats.reward ? 'Breakwater' : 'Section complete'}</div>
      <h2>${stats.title ?? 'Out of the Quiet Cell'}</h2>
      <p>${
        stats.body ??
        'The service lights lead down into the turbine hall, where the Breathing Engine heaves with the tide. That is the next destination. It is not built yet: this is the end of the first playable section.'
      }</p>
      <div class="stats"><div><b>${mins}:${secs}</b>time</div><div><b>${stats.falls}</b>falls</div>${stats.marks ? `<div><b>${stats.marks.found}/${stats.marks.total}</b>chalk marks</div>` : ''}</div>
      <div class="buttons">
        <button class="primary" data-a="restart">${stats.reward ? 'Play Chapter One again' : 'Restart section'}</button>
        <button data-a="continue">Keep exploring</button>
      </div>`;
    this.card.querySelector('[data-a="restart"]')!.addEventListener('click', onRestart);
    this.card.querySelector('[data-a="continue"]')!.addEventListener('click', onContinue);
    this.card.querySelector<HTMLButtonElement>('[data-a="restart"]')!.focus();
  }

  // ---------------------------------------------------------------- in-game elements

  setObjective(text: string): void {
    this.objectiveText.textContent = text;
    this.objective.classList.toggle('hidden', !text);
    if (text) this.pulseObjective();
  }

  pulseObjective(): void {
    this.objective.classList.remove('pulse');
    void this.objective.offsetWidth;
    this.objective.classList.add('pulse');
  }

  setPrompt(text: string | null, x: number, y: number, gamepad: boolean): void {
    if (!text) {
      this.prompt.classList.add('hidden');
      return;
    }
    const key = gamepad ? '<span class="key pad">X</span>' : '<span class="key">E</span>';
    const html = `${key}<span>${text}</span>`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.style.left = `${x}px`;
    this.prompt.style.top = `${y}px`;
    this.prompt.classList.remove('hidden');
  }

  showLine(line: Line | null): void {
    if (!line) {
      this.subtitle.classList.add('hidden');
      return;
    }
    const label = SPEAKER_LABEL[line.speaker] ?? line.speaker;
    this.subtitle.innerHTML = `${label ? `<span class="speaker ${line.speaker}">${label}</span>` : ''}${escapeHtml(line.text)}`;
    this.subtitle.classList.remove('hidden');
  }

  /**
   * A new gadget's card: what it is and its buttons, shown once when it is picked up (the way a
   * new ability is introduced), then it fades.
   */
  abilityCard(card: { eyebrow: string; title: string; rows: Array<{ key: string; pad: string; text: string }> }, gamepad = false): void {
    const keys = (k: string) => k.split(' ').map((x) => `<span class="key${gamepad ? ' pad' : ''}">${x}</span>`).join(' ');
    this.abilityEl.innerHTML = `<div class="eyebrow">${card.eyebrow}</div><h3>${card.title}</h3>${card.rows
      .map((r) => `<div class="row"><span class="keys">${keys(gamepad ? r.pad : r.key)}</span><span>${r.text}</span></div>`)
      .join('')}`;
    this.abilityEl.classList.remove('hidden');
    this.abilityTimer = 9;
  }

  /** The name of the space Mara has just entered, briefly, top centre. */
  areaTitle(title: string, sub = ''): void {
    this.areaEl.innerHTML = `<div class="name">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.areaEl.classList.remove('hidden');
    this.areaTimer = 3.6;
  }

  get areaText(): string {
    return this.areaEl.classList.contains('hidden') ? '' : (this.areaEl.textContent ?? '');
  }

  /** A small confirmation (a collectible found), top right. */
  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = 2.8;
  }

  /** Short contextual tip. With a `key`, it is shown only once per run. */
  tip(text: string, key?: string): void {
    if (key) {
      if (this.shownTips.has(key)) return;
      this.shownTips.add(key);
    }
    this.tipEl.textContent = text;
    this.tipEl.classList.remove('hidden');
    this.tipTimer = 5;
  }

  showDocument(id: string, src: string, caption: string): void {
    this.documentEl.innerHTML = `<figure><img alt="${caption}" src="${src}"/><figcaption>${caption} — press E to close</figcaption></figure>`;
    this.documentEl.classList.remove('hidden');
    this.documentOpen = id;
    this.documentTimer = 9;
  }

  hideDocument(): void {
    this.documentEl.classList.add('hidden');
    this.documentOpen = null;
  }

  /** Respawn / transition fade (0..1). */
  /**
   * Full-screen story card: the opening's narration and chapter titles. `backdrop` blacks out the
   * view (narration); without it the text sits over the scene (titles); `lower` sets it as a
   * caption in the lower left of a shot. null fades it away.
   */
  story(card: { eyebrow?: string; title?: string; text?: string; backdrop?: boolean; lower?: boolean } | null): void {
    if (!card) {
      this.storyEl.classList.add('hidden');
      return;
    }
    this.storyEl.classList.toggle('backdrop', card.backdrop ?? false);
    this.storyEl.classList.toggle('lower', card.lower ?? false);
    this.storyEl.innerHTML = `<div class="inner">${card.eyebrow ? `<div class="eyebrow">${card.eyebrow}</div>` : ''}${card.title ? `<h1>${card.title}</h1>` : ''}${card.text ? `<p>${card.text}</p>` : ''}</div>`;
    this.storyEl.classList.remove('hidden');
  }

  get storyText(): string {
    return this.storyEl.classList.contains('hidden') ? '' : (this.storyEl.textContent ?? '');
  }

  /** Cinematic bars, top and bottom, while a story scene holds the camera. */
  letterbox(on: boolean): void {
    this.letterboxEl.classList.toggle('on', on);
  }

  get letterboxed(): boolean {
    return this.letterboxEl.classList.contains('on');
  }

  setFade(v: number): void {
    this.fadeEl.style.opacity = String(v);
  }

  setFallFade(v: number): void {
    this.fallFadeEl.style.opacity = String(Math.min(1, v));
  }

  /** Shown while a skippable cinematic holds control. */
  setSkipHint(visible: boolean, gamepad = false): void {
    const html = gamepad ? '<span class="key pad">A</span> skip' : '<span class="key">Space</span> or <span class="key">E</span> skip';
    if (visible && this.skipEl.innerHTML !== html) this.skipEl.innerHTML = html;
    this.skipEl.classList.toggle('hidden', !visible);
  }

  setDebug(text: string | null): void {
    this.debugEl.classList.toggle('hidden', text === null);
    if (text !== null) this.debugEl.textContent = text;
  }

  resetRun(): void {
    this.story(null);
    this.letterbox(false);
    this.shownTips.clear();
    this.tipEl.classList.add('hidden');
    this.hideDocument();
    this.showLine(null);
  }

  update(dt: number): void {
    for (const [el, key] of [[this.abilityEl, 'abilityTimer'], [this.areaEl, 'areaTimer'], [this.toastEl, 'toastTimer']] as const) {
      if (this[key] > 0) {
        this[key] -= dt;
        if (this[key] <= 0) el.classList.add('hidden');
      }
    }
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.tipEl.classList.add('hidden');
    }
    if (this.documentOpen) {
      this.documentTimer -= dt;
      if (this.documentTimer <= 0) this.hideDocument();
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

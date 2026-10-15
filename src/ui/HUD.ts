import './hud.css';
import type { Line } from '../gameplay/Dialogue';

export interface Settings {
  sensitivity: number; // 0.2 .. 3, multiplies the base mouse sensitivity
  invertY: boolean;
  volume: number; // 0..1
  quality: 'high' | 'low';
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, invertY: false, volume: 0.8, quality: 'high' };
const SETTINGS_KEY = 'it-takes-one.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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

const SPEAKER_LABEL: Record<string, string> = { Mara: 'Mara', Horn: "Warden's horn", Intercom: 'Intercom', Tip: '' };

const CONTROLS_HTML = `
  <dl class="controls">
    <dt>W A S D / Arrows</dt><dd>Move (physical keys: Z Q S D on AZERTY)</dd>
    <dt>Mouse</dt><dd>Look (click the game to capture the mouse; drag also works)</dd>
    <dt>Space</dt><dd>Jump (hold for higher)</dd>
    <dt>E / F</dt><dd>Interact</dd>
    <dt>C / Middle mouse</dt><dd>Recenter camera</dd>
    <dt>Esc / P</dt><dd>Pause</dd>
    <dt>Gamepad</dt><dd>Left stick move, right stick look, A jump, X interact, R3 recenter, Start pause</dd>
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
  private readonly fadeEl: HTMLElement;
  private readonly fallFadeEl: HTMLElement;
  private readonly documentEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly skipEl: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly card: HTMLElement;
  private tipTimer = 0;
  private readonly shownTips = new Set<string>();
  documentOpen: string | null = null;
  private documentTimer = 0;
  settings: Settings = loadSettings();

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud', container);
    this.fallFadeEl = el('div', 'fade', this.root);
    this.objective = el('div', 'objective hidden', this.root, '<div class="label">Objective</div><div class="text"></div>');
    this.objectiveText = this.objective.querySelector('.text')!;
    this.prompt = el('div', 'prompt hidden', this.root);
    this.subtitle = el('div', 'subtitle hidden', this.root);
    this.tipEl = el('div', 'tip hidden', this.root);
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
      <p>Chapter 1, <i>The Quiet Cell</i> — first playable section.<br/>
      Breakwater prison runs on the tide. So will your way out.</p>
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
  }

  get screenVisible(): boolean {
    return !this.screen.classList.contains('hidden');
  }

  showPause(h: PauseHandlers, canRestartCheckpoint: boolean): void {
    this.screen.classList.remove('hidden');
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
        <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" value="${s.sensitivity}" data-s="sensitivity"></label>
        <label>Invert vertical look <input type="checkbox" ${s.invertY ? 'checked' : ''} data-s="invertY"></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></label>
        <label>Graphics <select data-s="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low (faster)</option></select></label>
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
        saveSettings(this.settings);
        h.settingsChanged(this.settings);
      });
    });
  }

  showComplete(stats: { time: number; falls: number; title?: string; body?: string }, onRestart: () => void, onContinue: () => void): void {
    this.screen.classList.remove('hidden');
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60)
      .toString()
      .padStart(2, '0');
    this.card.innerHTML = `
      <div class="eyebrow">Section complete</div>
      <h2>${stats.title ?? 'Out of the Quiet Cell'}</h2>
      <p>${
        stats.body ??
        'The service lights lead down into the turbine hall, where the Breathing Engine heaves with the tide. That is the next destination. It is not built yet: this is the end of the first playable section.'
      }</p>
      <div class="stats"><div><b>${mins}:${secs}</b>time</div><div><b>${stats.falls}</b>falls</div></div>
      <div class="buttons">
        <button class="primary" data-a="restart">Restart section</button>
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
    this.shownTips.clear();
    this.tipEl.classList.add('hidden');
    this.hideDocument();
    this.showLine(null);
  }

  update(dt: number): void {
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

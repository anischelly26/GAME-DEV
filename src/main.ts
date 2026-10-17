import { Game, type GameOptions } from './core/Game';

const params = new URLSearchParams(location.search);
const flag = (name: string) => params.has(name) && params.get(name) !== '0';

const options: GameOptions = {
  dev: import.meta.env.DEV || flag('dev'),
  test: flag('test'),
  realtime: flag('realtime'),
  autoplay: flag('autoplay'),
  // The story opening plays in normal play; automated runs (test, autoplay) skip it unless ?intro=1.
  intro: params.has('intro') ? flag('intro') : !flag('test') && !flag('autoplay'),
  // The Watch (sentries) patrols in normal play; automated runs turn it on with ?watch=1.
  watch: params.has('watch') ? flag('watch') : !flag('test') && !flag('autoplay'),
  start: params.get('start'),
  chapter: Number(params.get('chapter') ?? 1) || 1,
  quality: params.get('quality') === 'low' ? 'low' : params.get('quality') === 'high' ? 'high' : null,
};

const container = document.getElementById('app')!;

if (params.get('viewer') === 'mara' && (import.meta.env.DEV || flag('dev'))) {
  void import('./dev/CharacterViewer').then((m) => m.startCharacterViewer(container));
} else {
  start();
}

function start(): void {
  Game.create(container, options).catch((err: unknown) => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    container.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;font:16px system-ui;color:#f1ebdd;background:#05090c;padding:24px;text-align:center">
      <div><b>The game failed to start.</b><br/><br/>${message.replace(/</g, '&lt;')}<br/><br/>WebGL 2 is required. Try an up-to-date Chrome, Edge or Firefox.</div></div>`;
  });
}

import { describe, expect, it } from 'vitest';
import { Dialogue } from '../../src/gameplay/Dialogue';
import { EventBus, type GameEvents } from '../../src/core/Events';

function harness() {
  const events = new EventBus<GameEvents>();
  const shown: string[] = [];
  events.on('line', (l) => shown.push(l.text));
  const dialogue = new Dialogue(events);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) dialogue.update(1 / 60);
  };
  return { dialogue, shown, run };
}

describe('dialogue queue', () => {
  it('drops a remark that could not be shown within a few seconds', () => {
    const { dialogue, shown, run } = harness();
    dialogue.say('Mara', 'first', 5);
    dialogue.say('Mara', 'stale by the time first ends', 2);
    run(8);
    expect(shown).toEqual(['first']);
  });

  it('keeps story lines however long they wait, and lets them cut a remark short', () => {
    const { dialogue, shown, run } = harness();
    dialogue.say('Mara', 'a long remark', 6);
    run(0.2);
    dialogue.say('Intercom', 'story');
    run(1.2);
    expect(shown).toEqual(['a long remark', 'story']);
  });

  it('plays lines in order when there is no backlog', () => {
    const { dialogue, shown, run } = harness();
    dialogue.say('Mara', 'one', 1);
    run(0.5);
    dialogue.say('Mara', 'two', 1);
    run(3);
    expect(shown).toEqual(['one', 'two']);
  });

  it('marks cinematic lines as story so they are never dropped', () => {
    const { dialogue, shown, run } = harness();
    dialogue.say('Intercom', 'long story line', 6);
    dialogue.say('Mara', 'reply in the cutscene', 2, { story: true });
    run(10);
    expect(shown).toEqual(['long story line', 'reply in the cutscene']);
  });
});

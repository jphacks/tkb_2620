import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feedbackEvents } from '../src/game/feedback.ts';

test('cargo sound fires on loss, not repeated frames or reset', () => {
  assert.equal(
    feedbackEvents(null, { cargoRemaining: 3, finished: false }).dropped,
    false,
  );
  assert.equal(
    feedbackEvents(
      { cargoRemaining: 3, finished: false },
      { cargoRemaining: 1, finished: false },
    ).dropped,
    true,
  );
  assert.equal(
    feedbackEvents(
      { cargoRemaining: 1, finished: false },
      { cargoRemaining: 1, finished: false },
    ).dropped,
    false,
  );
  assert.equal(
    feedbackEvents(
      { cargoRemaining: 1, finished: false },
      { cargoRemaining: 3, finished: false },
    ).dropped,
    false,
  );
});
test('delivery cue fires once and can fire again after restarting', () => {
  const running = { cargoRemaining: 3, finished: false };
  const finished = { ...running, finished: true };
  assert.equal(feedbackEvents(running, finished).delivered, true);
  assert.equal(feedbackEvents(finished, finished).delivered, false);
  assert.equal(feedbackEvents(finished, running).delivered, false);
  assert.equal(feedbackEvents(running, finished).delivered, true);
});

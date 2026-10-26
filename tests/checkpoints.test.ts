import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECKPOINTS,
  checkpointPositions,
  passedCheckpoints,
  routeProgress,
} from '../src/game/checkpoints.ts';
import { DELIVERY_RATIO } from '../src/game/deliveryDestination.ts';

test('看板は、お家までの道のりの 1/4・1/2・3/4 に置く', () => {
  const length = 1000;
  const route = DELIVERY_RATIO * length;
  assert.deepEqual(
    checkpointPositions(length).map((p) => Math.round(p)),
    [route / 4, route / 2, (route * 3) / 4].map(Math.round),
  );
  assert.deepEqual(
    CHECKPOINTS.map((c) => c.label),
    ['1/4 通過', '折り返し', 'あと少し'],
  );
});

test('進んだ割合は、お家までの道のりで0〜1', () => {
  const length = 1000;
  assert.equal(routeProgress(0, length), 0);
  assert.equal(routeProgress(DELIVERY_RATIO * length * 0.5, length), 0.5);
  // 逆走で progress がマイナスになっても0、行き過ぎても1
  assert.equal(routeProgress(-50, length), 0);
  assert.equal(routeProgress(length * 2, length), 1);
  assert.equal(routeProgress(Number.NaN, length), 0);
  assert.equal(routeProgress(10, 0), 0);
});

test('通過した看板の数は、看板の地点を越えるたびに1つ増える', () => {
  assert.equal(passedCheckpoints(0), 0);
  assert.equal(passedCheckpoints(0.249), 0);
  assert.equal(passedCheckpoints(0.25), 1);
  assert.equal(passedCheckpoints(0.6), 2);
  assert.equal(passedCheckpoints(0.75), 3);
  assert.equal(passedCheckpoints(1), 3);
});

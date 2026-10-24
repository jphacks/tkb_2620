import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeScore,
  PAR_SPEED,
  slipNumber,
  type DeliveryResult,
} from '../src/game/score.ts';

const base: DeliveryResult = {
  courseName: 'テスト',
  time: 10,
  courseLength: 120,
  cargoRemaining: 3,
  cargoTotal: 3,
  finishedAt: 0,
};

test('finishing within the par time with all cargo scores 100 (#21)', () => {
  const score = computeScore(base); // 基準タイムは 120 / 12 = 10秒
  assert.equal(score.parTime, 120 / PAR_SPEED);
  assert.deepEqual(
    [score.timePoints, score.cargoPoints, score.total],
    [50, 50, 100],
  );
  assert.equal(
    computeScore({ ...base, time: 6 }).timePoints,
    50,
    '速くても50点まで',
  );
});

test('time points drop as the run gets slower (#21)', () => {
  assert.equal(computeScore({ ...base, time: 20 }).timePoints, 25);
  assert.equal(computeScore({ ...base, time: 40 }).timePoints, 13);
  assert.equal(computeScore({ ...base, time: 0 }).timePoints, 0);
  assert.equal(computeScore({ ...base, time: Number.NaN }).timePoints, 0);
});

test('cargo points are the share of cargo still on the truck (#21)', () => {
  assert.equal(computeScore({ ...base, cargoRemaining: 2 }).cargoPoints, 33);
  assert.equal(computeScore({ ...base, cargoRemaining: 0 }).cargoPoints, 0);
  assert.equal(computeScore({ ...base, cargoRemaining: 5 }).cargoPoints, 50);
});

test('without cargo yet, cargo points count as full and are marked untracked (#21)', () => {
  const score = computeScore({ ...base, cargoRemaining: 0, cargoTotal: 0 });
  assert.equal(score.cargoTracked, false);
  assert.equal(score.cargoPoints, 50);
});

test('slip number comes from the finish time (#21)', () => {
  const at = new Date(2026, 9, 24, 15, 3, 7).getTime();
  assert.equal(slipNumber(at), 'BR-20261024-1503-07');
});

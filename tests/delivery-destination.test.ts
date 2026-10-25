import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryDestination,
  DELIVERY_RATIO,
} from '../src/game/deliveryDestination.ts';
import { createLapTrack, startLap, updateLap } from '../src/game/lap.ts';

const points = Array.from({ length: 240 }, (_, i) => ({
  x: 30 * Math.sin((i / 240) * Math.PI * 2),
  z: 30 * Math.cos((i / 240) * Math.PI * 2),
}));
test('destination is at 90 percent of the closed arc, including its closing edge', () => {
  const track = createLapTrack(points, 6);
  const goal = deliveryDestination(points);
  assert.ok(Math.abs(goal.distance - track.length * 0.9) < 1e-8);
  assert.ok(Math.hypot(goal.x - points[216].x, goal.z - points[216].z) < 1e-8);
});
test('delivery finishes at the house, before returning to the depot', () => {
  const track = createLapTrack(points, 6);
  let lap = startLap(track, points[0], points[0], DELIVERY_RATIO);
  // お家はちょうど216点目（90%）にある。ちょうど境目の点では、浮動小数点の
  // 誤差で環境によって判定が1点ずれるため、1点の幅をもたせて確かめる
  for (let i = 1; i <= 217; i++) {
    lap = updateLap(track, lap, points[i], points[i], DELIVERY_RATIO);
    if (i < 215) assert.equal(lap.finished, false);
  }
  assert.equal(lap.finished, true);
});
test('driving backwards to the house does not finish a delivery', () => {
  const track = createLapTrack(points, 6);
  let lap = startLap(track, points[0], points[0], DELIVERY_RATIO);
  for (let i = 239; i >= 214; i--)
    lap = updateLap(track, lap, points[i], points[i], DELIVERY_RATIO);
  assert.equal(lap.finished, false);
});

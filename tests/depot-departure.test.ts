import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  departurePose,
  DEPARTURE_SECONDS,
} from '../src/game/depotDeparture.ts';

test('truck holds inside garage while camera approaches, then exits and turns right', () => {
  assert.deepEqual(departurePose(0), departurePose(2));
  const exit = departurePose(3);
  assert.equal(exit.x, 6);
  assert.equal(exit.z, -6);
  assert.equal(exit.angle, -Math.PI / 2);
  const end = departurePose(DEPARTURE_SECONDS);
  assert.ok(Math.abs(end.x) < 1e-8 && Math.abs(end.z) < 1e-8);
  assert.equal(end.angle, 0);
  let previous = departurePose(0);
  for (let t = 0.01; t <= 10; t += 0.01) {
    const pose = departurePose(t);
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) < 0.1);
    assert.ok(pose.angle >= previous.angle);
    previous = pose;
  }
});

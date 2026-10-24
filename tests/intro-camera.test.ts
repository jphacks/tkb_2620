import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_CAMERA, introCameraProgress } from '../src/game/introCamera.ts';
test('opening shot holds the overview, approaches smoothly, and ends exactly at follow pose', () => {
  assert.deepEqual(introCameraProgress(0), { weight: 0, done: false });
  assert.equal(introCameraProgress(INTRO_CAMERA.overviewSeconds).weight, 0);
  const middle =
    INTRO_CAMERA.overviewSeconds + INTRO_CAMERA.approachSeconds / 2;
  assert.ok(Math.abs(introCameraProgress(middle).weight - 0.5) < 1e-9);
  assert.deepEqual(introCameraProgress(100), { weight: 1, done: true });
  let previous = 0;
  for (let i = 0; i < 240; i++) {
    const { weight } = introCameraProgress(i / 60);
    assert.ok(weight >= previous && weight <= 1);
    previous = weight;
  }
});

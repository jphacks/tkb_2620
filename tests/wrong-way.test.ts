import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateGame, type TruckState } from '../src/game/updateGame.ts';
const initial = (yaw: number): TruckState => ({
  x: 0,
  z: 0,
  yaw,
  speed: 10,
  steering: 0,
  brakePressure: 0,
  distance: 0,
  collided: false,
});
const forward = { x: 0, z: 1 };
test('wrong-way throttle and coasting cannot drive backward along course', () => {
  for (const throttle of [0, 1]) {
    let state = initial(Math.PI);
    for (let i = 0; i < 120; i++)
      state = updateGame(
        state,
        { throttle, brake: 0, steering: 0 },
        1 / 60,
        [],
        forward,
      );
    assert.equal(state.z, 0);
    assert.equal(state.speed, 0);
    assert.equal(state.distance, 0);
    assert.equal(state.wrongWay, true);
  }
});
test('either full-lock steering can turn around and resume without reset', () => {
  for (const steering of [-1, 1]) {
    let state = initial(Math.PI);
    let resumed = false;
    for (let i = 0; i < 600; i++) {
      const previousZ = state.z;
      state = updateGame(
        state,
        { throttle: 1, brake: 0, steering: resumed ? 0 : steering },
        1 / 60,
        [],
        forward,
      );
      assert.ok(state.z >= previousZ - 1e-8);
      if (!state.wrongWay && state.speed > 0) resumed = true;
    }
    assert.equal(resumed, true);
    assert.ok(state.distance > 1);
  }
});
test('forward driving remains unchanged; braking prevents recovery turning', () => {
  const state = initial(0),
    input = { throttle: 1, brake: 0, steering: 0 };
  const normal = updateGame(state, input, 1 / 60, []);
  const guarded = updateGame(state, input, 1 / 60, [], forward);
  assert.equal(normal.z, guarded.z);
  assert.equal(normal.speed, guarded.speed);
  const stopped = { ...initial(Math.PI), speed: 0, brakePressure: 1 };
  assert.equal(
    updateGame(
      stopped,
      { throttle: 1, brake: 1, steering: 1 },
      1 / 60,
      [],
      forward,
    ).yaw,
    Math.PI,
  );
});

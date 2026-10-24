import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTruckState, updateGame } from '../src/game/updateGame.ts';
import { createCargoLayout, remainingCargo } from '../src/game/cargo.ts';
import { slideCargo, CARGO_PHYSICS } from '../src/game/slideCargo.ts';
import { updateCargoFalls } from '../src/game/fallCargo.ts';

test('actual truck can launch, brake to a stop, then restart without shedding cargo', () => {
  let state = initialTruckState({
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 100 },
    ],
  } as Parameters<typeof initialTruckState>[0]);
  let cargo = createCargoLayout();
  function drive(throttle: number, brake: number, frames: number) {
    for (let i = 0; i < frames; i++) {
      const before = state;
      state = updateGame(
        state,
        { throttle, brake, steering: 0 },
        CARGO_PHYSICS.step,
        [],
      );
      cargo = slideCargo(cargo, {
        speed: (before.speed + state.speed) / 2,
        acceleration: (state.speed - before.speed) / CARGO_PHYSICS.step,
        yawRate: 0,
      });
      cargo = updateCargoFalls(cargo, state);
      assert.equal(remainingCargo(cargo), 3);
    }
  }
  drive(1, 0, 180);
  drive(0, 1, 180);
  assert.equal(state.speed, 0);
  drive(1, 0, 180);
});

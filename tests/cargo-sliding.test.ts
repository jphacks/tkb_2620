import { test } from 'node:test';
import { updateCargoFalls } from '../src/game/fallCargo.ts';
import assert from 'node:assert/strict';
import { createCargoLayout, CARGO } from '../src/game/cargo.ts';
import {
  slideCargo,
  CARGO_PHYSICS,
  cargoLaunchScale,
} from '../src/game/slideCargo.ts';
const initial = () => createCargoLayout(1);
test('acceleration pushes backward; braking pushes forward', () => {
  assert.ok(
    slideCargo(initial(), { speed: 5, acceleration: 10, yawRate: 0 })[0]
      .position.z < 0,
  );
  assert.ok(
    slideCargo(initial(), { speed: 5, acceleration: -10, yawRate: 0 })[0]
      .position.z > 0,
  );
});
test('left turn pushes right and right turn pushes left', () => {
  assert.ok(
    slideCargo(initial(), { speed: 10, acceleration: 0, yawRate: 1 })[0]
      .position.x < 0,
  );
  assert.ok(
    slideCargo(initial(), { speed: 10, acceleration: 0, yawRate: -1 })[0]
      .position.x > 0,
  );
});
test('constant straight driving and sub-threshold acceleration do not move cargo', () => {
  for (const acceleration of [
    0,
    2,
    CARGO_PHYSICS.staticFriction * CARGO_PHYSICS.gravity,
  ]) {
    const items = initial();
    assert.deepEqual(
      slideCargo(items, { speed: 20, acceleration, yawRate: 0 }),
      items,
    );
  }
});
test('kinetic friction stops sliding without reversing', () => {
  let items = initial();
  items[0].velocity.x = 0.1;
  items[0].status = 'sliding';
  for (let i = 0; i < 60; i++) {
    items = slideCargo(items, { speed: 10, acceleration: 0, yawRate: 0 });
    assert.ok(items[0].velocity.x >= 0);
  }
  assert.equal(items[0].velocity.x, 0);
  assert.equal(items[0].status, 'resting');
});
test('semi-implicit step updates velocity before position without mutating input', () => {
  const items = initial();
  const next = slideCargo(items, { speed: 30, acceleration: 10, yawRate: 0 });
  const expected = -(10 - 0.18 * 9.8) / 60;
  assert.ok(Math.abs(next[0].velocity.z - expected) < 1e-10);
  assert.ok(Math.abs(next[0].position.z - expected / 60) < 1e-10);
  assert.equal(items[0].position.z, 0);
});
test('falling and lost cargo are skipped', () => {
  const items = initial();
  items[0].status = 'falling';
  assert.deepEqual(
    slideCargo(items, { speed: 10, acceleration: 10, yawRate: 1 }),
    items,
  );
});

test('three boxes remain separated under repeated acceleration, braking and turns', () => {
  let items = createCargoLayout();
  const original = structuredClone(items);
  for (let frame = 0; frame < 2400; frame++) {
    const phase = Math.floor(frame / 200) % 4;
    items = slideCargo(items, {
      speed: 30,
      acceleration: phase < 2 ? 16 : -20,
      yawRate: phase % 2 ? -3 : 3,
    });
    items = updateCargoFalls(items, { x: 0, z: 0, yaw: 0, speed: 30 });
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (a.climb || a.status === 'falling' || a.status === 'lost') continue;

      for (const b of items
        .slice(i + 1)
        .filter(
          (c) => !c.climb && c.status !== 'falling' && c.status !== 'lost',
        ))
        assert.ok(
          Math.abs(a.position.x - b.position.x) >= CARGO.size - 1e-8 ||
            Math.abs(a.position.z - b.position.z) >= CARGO.size - 1e-8,
        );
    }
  }
  assert.deepEqual(createCargoLayout(), original);
});

test('contact separates boxes without changing input', () => {
  const items = createCargoLayout(2);
  items[0].position = { x: -0.34, z: 0 };
  items[1].position = { x: 0.07, z: 0 };
  items[1].velocity.x = -2;
  const snapshot = structuredClone(items);
  const next = slideCargo(items, { speed: 0, acceleration: 0, yawRate: 0 });
  assert.ok(next[1].position.x - next[0].position.x >= CARGO.size - 1e-8);
  assert.deepEqual(items, snapshot);
});

test('launch assistance softens starts and restarts, not braking or lateral force', () => {
  assert.equal(
    cargoLaunchScale({ speed: 0, acceleration: 8, yawRate: 0 }),
    0.25,
  );
  assert.equal(cargoLaunchScale({ speed: 0, acceleration: -8, yawRate: 0 }), 1);
  assert.equal(cargoLaunchScale({ speed: 24, acceleration: 8, yawRate: 0 }), 1);
  assert.deepEqual(
    slideCargo(initial(), { speed: 0, acceleration: 8, yawRate: 0 }),
    initial(),
  );
  const turning = slideCargo(initial(), {
    speed: 5,
    acceleration: 0,
    yawRate: 2,
  });
  assert.ok(turning[0].position.x < 0);
});

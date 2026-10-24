import { TRUCK_SCALE } from '../src/game/constants.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BED,
  CARGO,
  bedToTruck,
  createCargoLayout,
  remainingCargo,
  type CargoItem,
} from '../src/game/cargo.ts';

/** Every box lies fully inside the bed and no two boxes overlap. */
function assertFits(items: CargoItem[], size = CARGO.size) {
  for (const item of items) {
    assert.ok(Math.abs(item.position.x) + size / 2 <= BED.width / 2 + 1e-9);
    assert.ok(Math.abs(item.position.z) + size / 2 <= BED.length / 2 + 1e-9);
  }
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].position,
        b = items[j].position;
      assert.ok(
        Math.abs(a.x - b.x) >= size - 1e-9 ||
          Math.abs(a.z - b.z) >= size - 1e-9,
        `boxes ${i} and ${j} overlap`,
      );
    }
}

test('defaults: three boxes scale together with the truck bed', () => {
  assert.equal(CARGO.count, 3);
  assert.equal(CARGO.size, 0.4 * TRUCK_SCALE);
  assert.deepEqual(
    { width: BED.width, length: BED.length },
    { width: 1.08 * TRUCK_SCALE, length: 1.39 * TRUCK_SCALE },
  );
  const items = createCargoLayout();
  assert.equal(items.length, 3);
  assertFits(items);
});

test('one box sits in the middle of the bed', () => {
  const [only] = createCargoLayout(1);
  assert.deepEqual(only.position, { x: 0, z: 0 });
  assertFits([only]);
});

test('three boxes: two at the front (cab side), one centered behind', () => {
  const items = createCargoLayout(3);
  const front = items.filter((c) => c.position.z > 0),
    back = items.filter((c) => c.position.z < 0);
  assert.equal(front.length, 2);
  assert.equal(back.length, 1);
  assert.equal(back[0].position.x, 0);
  assert.ok(Math.abs(front[0].position.x + front[1].position.x) < 1e-9);
});

test('each box has its own state, all resting and still at the start', () => {
  const items = createCargoLayout();
  assert.deepEqual(
    items.map((c) => c.id),
    [0, 1, 2],
  );
  assert.ok(items.every((c) => c.status === 'resting'));
  assert.ok(items.every((c) => c.velocity.x === 0 && c.velocity.z === 0));
  // Changing one box does not touch the others.
  items[0].position.x += 0.1;
  items[0].status = 'sliding';
  assert.equal(items[1].status, 'resting');
  assert.equal(remainingCargo(items), 3);
  items[1].status = 'falling';
  items[2].status = 'lost';
  assert.equal(remainingCargo(items), 1);
});

test('bed-local coordinates map onto the bed in truck coordinates', () => {
  assert.deepEqual(bedToTruck({ x: 0, z: 0 }), BED.center);
  const p = bedToTruck({ x: 0.2, z: -0.3 });
  assert.ok(
    Math.abs(p.x - 0.2) < 1e-9 && Math.abs(p.z - (BED.center.z - 0.3)) < 1e-9,
  );
});

test('refuses layouts that do not fit in one layer', () => {
  assert.equal(createCargoLayout(0).length, 0);
  assert.throws(() => createCargoLayout(5), /1段で載せられません/);
  assert.throws(() => createCargoLayout(1, 2), /1段で載せられません/);
  assert.throws(() => createCargoLayout(-1), /0以上の整数/);
  assert.throws(() => createCargoLayout(1.5), /0以上の整数/);
  // Four fit as two rows of two.
  const four = createCargoLayout(4);
  assertFits(four);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  updateGame,
  hitsWall,
  type TruckState,
  type WallSegment,
} from '../src/game/updateGame.ts';
const initial = (overrides: Partial<TruckState> = {}): TruckState => ({
  x: 0,
  z: 0,
  yaw: 0,
  speed: 8,
  steering: 0,
  collided: false,
  distance: 0,
  brakePressure: 0,
  ...overrides,
});
const front: WallSegment[] = [{ a: { x: -50, z: 4 }, b: { x: 50, z: 4 } }];
test('front impact can recover by full steering in either direction without crossing wall', () => {
  for (const steering of [-1, 1]) {
    let truck = initial();
    let contacted = false;
    for (let i = 0; i < 900; i++) {
      truck = updateGame(
        truck,
        { throttle: 1, brake: 0, steering: contacted ? steering : 0 },
        1 / 60,
        front,
      );
      contacted ||= truck.collided;
      assert.equal(hitsWall(truck, front), false);
      assert.ok(truck.z < 4);
    }
    assert.equal(contacted, true);
    assert.ok(Math.abs(truck.x) > 3);
    assert.ok(Math.abs(truck.yaw) > 1);
  }
});
test('side contact slides along the wall without crossing it', () => {
  const walls = [{ a: { x: 2, z: -100 }, b: { x: 2, z: 100 } }];
  let truck = initial({ yaw: 0.4 });
  let contacted = false;
  for (let i = 0; i < 300; i++) {
    truck = updateGame(
      truck,
      { throttle: 1, brake: 0, steering: 0 },
      1 / 60,
      walls,
    );
    contacted ||= truck.collided;
    assert.equal(hitsWall(truck, walls), false);
    assert.ok(truck.x < 2);
  }
  assert.ok(contacted);
  assert.ok(truck.z > 5);
});
test('holding throttle straight into a wall cannot tunnel through; brake does not pivot', () => {
  let truck = initial({ speed: 40 });
  for (let i = 0; i < 600; i++)
    truck = updateGame(
      truck,
      { throttle: 1, brake: 0, steering: 0 },
      1 / 60,
      front,
    );
  assert.equal(hitsWall(truck, front), false);
  assert.ok(truck.z < 4);
  truck = { ...truck, speed: 0, brakePressure: 1 };
  const yaw = truck.yaw;
  for (let i = 0; i < 120; i++)
    truck = updateGame(
      truck,
      { throttle: 0, brake: 1, steering: 1 },
      1 / 60,
      front,
    );
  assert.equal(truck.yaw, yaw);
});
test('corner contact remains finite and outside both walls', () => {
  const walls = [...front, { a: { x: 2, z: -50 }, b: { x: 2, z: 50 } }];
  let truck = initial({ yaw: 0.3 });
  for (let i = 0; i < 900; i++) {
    truck = updateGame(
      truck,
      { throttle: 1, brake: 0, steering: i > 60 ? -1 : 0 },
      1 / 60,
      walls,
    );
    assert.equal(hitsWall(truck, walls), false);
    assert.ok(Number.isFinite(truck.x + truck.z + truck.yaw));
    assert.ok(truck.x < 2 && truck.z < 4);
  }
});

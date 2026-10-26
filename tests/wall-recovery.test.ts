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

const course = { x: 0, z: 1 };
test('側の壁に当たると、壁から跳ね返って離れる。コースの後ろへは動かない', () => {
  const walls = [{ a: { x: 2, z: -100 }, b: { x: 2, z: 100 } }];
  let truck = initial({ yaw: 0.4, speed: 10 });
  let hitAt = -1,
    hitX = 0;
  for (let i = 0; i < 120; i++) {
    const previousZ = truck.z;
    truck = updateGame(
      truck,
      { throttle: 0, brake: 0, steering: 0 },
      1 / 60,
      walls,
      course,
    );
    assert.equal(hitsWall(truck, walls), false);
    assert.ok(truck.z >= previousZ - 1e-9, '後ろへ動かない');
    if (hitAt < 0 && truck.collided) {
      hitAt = i;
      hitX = truck.x;
    }
    if (hitAt >= 0 && i === hitAt + 18) break;
  }
  assert.ok(hitAt >= 0, '壁に当たる');
  assert.ok(hitX - truck.x > 0.15, `${hitX - truck.x}`);
});

test('正面の壁に当たっても、跳ね返ってコースの後ろへは戻らない', () => {
  let truck = initial({ speed: 12 });
  for (let i = 0; i < 120; i++) {
    const previousZ = truck.z;
    truck = updateGame(
      truck,
      { throttle: 0, brake: 0, steering: 0 },
      1 / 60,
      front,
      course,
    );
    assert.equal(hitsWall(truck, front), false);
    assert.ok(truck.z >= previousZ - 1e-9);
  }
});

test('後輪が壁に引っかかっても、跳ね返りで外れて前へ進める', () => {
  const walls = [{ a: { x: 2, z: -100 }, b: { x: 2, z: 100 } }];
  // 壁に沿って走りながら、壁と反対へハンドルを切る（後ろが壁のほうへ振れる）
  let truck = initial({ x: 2 - 0.68, speed: 3 });
  let contacts = 0;
  for (let i = 0; i < 120; i++) {
    truck = updateGame(
      truck,
      { throttle: 1, brake: 0, steering: i < 30 ? -0.4 : 0 },
      1 / 60,
      walls,
      course,
    );
    if (truck.collided) contacts++;
    assert.equal(hitsWall(truck, walls), false);
  }
  assert.ok(contacts <= 3, `${contacts}`);
  assert.ok(truck.z > 6, `${truck.z}`);
});

test('跳ね返りは少しずつ弱まり、1.5秒ほどでなくなる', () => {
  let truck = initial({ speed: 0, knockX: -3, knockZ: 0 });
  for (let i = 0; i < 90; i++)
    truck = updateGame(
      truck,
      { throttle: 0, brake: 1, steering: 0 },
      1 / 60,
      [],
      course,
    );
  assert.ok(Math.hypot(truck.knockX ?? 0, truck.knockZ ?? 0) < 0.1);
});

import { test } from 'node:test';
import { cargoDropLocations } from '../src/game/fallCargo.ts';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BED,
  CARGO,
  createCargoLayout,
  remainingCargo,
} from '../src/game/cargo.ts';
import {
  isOutsideBed,
  updateCargoFalls,
  CARGO_LANDING_Y,
} from '../src/game/fallCargo.ts';
import { slideCargo } from '../src/game/slideCargo.ts';
import { createCargo } from '../src/game/createCargo.ts';
const truck = { x: 10, z: 20, yaw: Math.PI / 2, speed: 8 };

test('center must cross any of the four bed edges; partial overhang is supported', () => {
  assert.equal(isOutsideBed({ x: BED.width / 2, z: 0 }), false);
  for (const sign of [-1, 1]) {
    assert.equal(
      isOutsideBed({ x: sign * (BED.width / 2 + 0.001), z: 0 }),
      true,
    );
    assert.equal(
      isOutsideBed({ x: 0, z: sign * (BED.length / 2 + 0.001) }),
      true,
    );
  }
  assert.equal(isOutsideBed({ x: BED.width / 2 - 0.01, z: 0 }), false);
});

test('fall starts once in world coordinates and inherits forward and relative velocity', () => {
  const items = createCargoLayout(1);
  items[0].position.x = BED.width / 2 + 0.01;
  items[0].velocity = { x: 1, z: 2 };
  const snapshot = structuredClone(items);
  let next = updateCargoFalls(items, truck);
  assert.equal(next[0].status, 'falling');
  assert.equal(remainingCargo(next), 0);
  assert.ok(Math.abs(next[0].fall!.velocity.x - 10) < 1e-9);
  assert.ok(Math.abs(next[0].fall!.velocity.z + 1) < 1e-9);
  const start = next[0].fall!;
  next = updateCargoFalls(next, { ...truck, x: 1000, yaw: -2, speed: 40 });
  assert.ok(
    Math.abs(next[0].fall!.position.x - start.position.x - 10 / 60) < 1e-9,
  );
  assert.ok(next[0].fall!.position.y < start.position.y);
  assert.equal(remainingCargo(next), 0);
  assert.deepEqual(items, snapshot);
  for (let i = 1; i < 120; i++) next = updateCargoFalls(next, truck);
  assert.equal(next[0].status, 'lost');
  assert.equal(next[0].fall!.position.y, CARGO_LANDING_Y);
  assert.deepEqual(next[0].fall!.velocity, { x: 0, y: 0, z: 0 });
  assert.deepEqual(updateCargoFalls(next, truck), next);
});

test('real sliding transitions to falling and removes cargo from remaining count', () => {
  let items = createCargoLayout();
  for (let i = 0; i < 120; i++) {
    items = slideCargo(items, { speed: 20, acceleration: 8, yawRate: 1 });
    items = updateCargoFalls(items, truck);
  }
  assert.equal(remainingCargo(items), 0);
  assert.ok(items.every((c) => c.status === 'falling' || c.status === 'lost'));
});

test('Three.js detaches falling boxes, keeps world transform, and reattaches on reset', () => {
  const scene = new THREE.Scene();
  const truckGroup = new THREE.Group();
  scene.add(truckGroup);
  truckGroup.position.set(truck.x, 0, truck.z);
  truckGroup.rotation.y = truck.yaw;
  const items = createCargoLayout(1);
  items[0].position.x = BED.width / 2 + 0.01;
  const view = createCargo(items);
  truckGroup.add(view.group);
  const box = view.group.children[0];
  scene.updateMatrixWorld(true);
  const before = box.getWorldPosition(new THREE.Vector3());
  const falling = updateCargoFalls(items, truck);
  view.sync(falling);
  assert.equal(box.parent, scene);
  assert.ok(
    box.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9,
  );
  truckGroup.position.x += 100;
  assert.ok(
    box.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9,
  );
  view.sync([{ ...falling[0], status: 'lost' }]);
  assert.equal(box.visible, true);
  view.sync(createCargoLayout(1));
  assert.equal(box.parent, view.group);
  assert.equal(box.visible, true);
  assert.equal(box.position.y, BED.center.y + CARGO.size / 2);
});

test('simultaneous falls and landings separate three boxes without changing input', () => {
  let items = createCargoLayout();
  for (const item of items) {
    item.status = 'falling';
    item.fall = {
      position: { x: 5, y: 1, z: 5 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: Math.PI / 4,
      elapsed: 0,
    };
  }
  const snapshot = structuredClone(items);
  for (let frame = 0; frame < 120; frame++) {
    const next = updateCargoFalls(items, truck);
    for (let i = 0; i < next.length; i++)
      for (const b of next.slice(i + 1)) {
        const a = next[i].fall!,
          bf = b.fall!;
        const dx = bf.position.x - a.position.x,
          dz = bf.position.z - a.position.z;
        const x = dx * Math.cos(a.yaw) - dz * Math.sin(a.yaw);
        const z = dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw);
        assert.ok(
          Math.abs(x) >= CARGO.size * 1.01 - 1e-7 ||
            Math.abs(z) >= CARGO.size * 1.01 - 1e-7,
        );
        assert.ok(a.position.y >= CARGO_LANDING_Y);
      }
    if (frame === 0) assert.deepEqual(items, snapshot);
    items = next;
  }
  assert.ok(items.every((c) => c.status === 'lost'));
});

test('airborne cargo is pushed aside by a grounded box without moving the grounded box', () => {
  const items = createCargoLayout(2);
  items.forEach((c, i) => {
    c.status = i === 0 ? 'lost' : 'falling';
    c.fall = {
      position: { x: 0, y: CARGO_LANDING_Y + i * 0.2, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      elapsed: 0,
      yaw: (i * Math.PI) / 4,
    };
  });
  const next = updateCargoFalls(items, truck);
  assert.deepEqual(next[0].fall!.position, items[0].fall!.position);
  assert.ok(
    Math.hypot(next[1].fall!.position.x, next[1].fall!.position.z) > 0.4,
  );
});

test('drop markers stay at the departure point, occur once per box, and clear on reset', () => {
  let items = createCargoLayout(1);
  items[0].position.x = BED.width;
  items = updateCargoFalls(items, truck);
  const markers = cargoDropLocations(items);
  assert.equal(markers.length, 1);
  for (let i = 0; i < 120; i++)
    items = updateCargoFalls(items, { ...truck, x: 1000 });
  assert.deepEqual(cargoDropLocations(items), markers);
  assert.notEqual(items[0].fall!.position.x, markers[0].x);
  assert.deepEqual(cargoDropLocations(createCargoLayout()), []);
});

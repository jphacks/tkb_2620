import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCargoLayout, BED } from '../src/game/cargo.ts';
import { applyCargoRails, RAIL_CONFIG } from '../src/game/cargoRails.ts';
import { updateCargoFalls } from '../src/game/fallCargo.ts';
const truck = { x: 0, z: 0, yaw: 0, speed: 8 };
test('gentle contact stays inside and does not fall', () => {
  const items = createCargoLayout(1);
  items[0].position.x = BED.width / 2 - 0.19;
  items[0].velocity.x = 0.8;
  const next = applyCargoRails(items, { x: 2, z: 0 }, 1 / 60);
  assert.equal(next[0].climb, undefined);
  assert.ok(next[0].velocity.x <= 0);
  assert.notEqual(updateCargoFalls(next, truck)[0].status, 'falling');
});
test('hard contact lifts first, crosses above rail and only then starts falling', () => {
  const items = createCargoLayout(1);
  items[0].position.x = BED.width / 2 - 0.19;
  items[0].velocity.x = 2;
  let next = applyCargoRails(items, { x: 10, z: 0 }, 1 / 60);
  assert.ok(next[0].climb);
  const startX = next[0].position.x;
  for (let i = 0; i < 8; i++)
    next = applyCargoRails(next, { x: 0, z: 0 }, 1 / 60);
  assert.equal(next[0].position.x, startX);
  assert.ok(next[0].lift! > 0.1);
  assert.notEqual(updateCargoFalls(next, truck)[0].status, 'falling');
  for (let i = 8; i < Math.ceil(RAIL_CONFIG.climbDuration * 60); i++)
    next = applyCargoRails(next, { x: 0, z: 0 }, 1 / 60);
  assert.ok(next[0].lift! >= RAIL_CONFIG.height - 1e-9);
  const falling = updateCargoFalls(next, truck)[0];
  assert.equal(falling.status, 'falling');
  assert.ok(falling.fall!.position.y > BED.center.y + 0.2);
  assert.ok(falling.fall!.velocity.y > 0);
});
test('cab stops forward boxes rather than letting them pass through', () => {
  const items = createCargoLayout(1);
  items[0].position.z = BED.length;
  items[0].velocity.z = 4;
  const next = applyCargoRails(items, { x: 0, z: 20 }, 1 / 60);
  assert.ok(next[0].position.z <= (BED.length - 0.4) / 2);
  assert.equal(next[0].velocity.z, 0);
  assert.equal(next[0].climb, undefined);
});

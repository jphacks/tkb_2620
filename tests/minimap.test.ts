import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMinimapProjection } from '../src/game/minimap.ts';
test('negative z stays above positive z; x increases rightward without camera rotation', () => {
  const map = createMinimapProjection([
    { x: -10, z: -20 },
    { x: 10, z: 20 },
  ]);
  assert.deepEqual(map.project({ x: 0, z: 0 }), { x: 90, y: 90 });
  assert.ok(map.project({ x: 0, z: -20 }).y < map.project({ x: 0, z: 20 }).y);
  assert.ok(map.project({ x: -10, z: 0 }).x < map.project({ x: 10, z: 0 }).x);
  assert.ok(map.path.endsWith(' Z'));
});
test('translated and very large photo courses fit with uniform scale and padding', () => {
  const points = [
    { x: 10000, z: -5000 },
    { x: 10020, z: -4800 },
  ];
  const { project } = createMinimapProjection(points);
  const a = project(points[0]),
    b = project(points[1]);
  assert.ok(a.x >= 16 && b.x <= 164);
  assert.equal(a.y, 16);
  assert.equal(b.y, 164);
  assert.ok(Math.abs((b.y - a.y) / (b.x - a.x) - 10) < 1e-8);
});
test('degenerate bounds remain finite; invalid data is rejected', () => {
  const map = createMinimapProjection([{ x: 5, z: 5 }]);
  assert.deepEqual(map.project({ x: 5, z: 5 }), { x: 90, y: 90 });
  assert.throws(() => createMinimapProjection([]));
  assert.throws(() => createMinimapProjection([{ x: NaN, z: 0 }]));
});

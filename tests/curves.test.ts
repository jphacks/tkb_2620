import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  circleRadius,
  correctSharpCurves,
  DEFAULT_CURVE_CORRECTION,
  detectSharpCurves,
} from '../src/image-processing/correctCurves.ts';
import { validateContour } from '../src/image-processing/extractContour.ts';
import { resampleClosedContour } from '../src/image-processing/resampleContour.ts';

const circle = (radius: number, count = 200, bump?: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2,
      r = radius + (bump?.(i) ?? 0);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
const rectangle = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

test('defaults are 6m radius, 30 iterations and 3m displacement', () => {
  assert.deepEqual(DEFAULT_CURVE_CORRECTION, {
    minTurnRadius: 6,
    maxCorrectionIterations: 30,
    maxDisplacement: 3,
  });
});

test('radius of the circle through three points', () => {
  const r = circleRadius({ x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 });
  assert.ok(Math.abs(r - 5) < 1e-9);
  assert.equal(
    circleRadius({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }),
    Infinity,
  );
});

test('detects sharp curves below the minimum radius only', () => {
  assert.equal(detectSharpCurves(circle(20)).sharp.length, 0);
  const small = detectSharpCurves(circle(4));
  assert.equal(small.sharp.length, 200);
  assert.ok(Math.abs(small.minRadius - 4) < 0.01);
  // Square corners of a resampled rectangle are sharp; straight sides are not.
  const box = resampleClosedContour(rectangle(30, 20), 0.5);
  const check = detectSharpCurves(box.points);
  assert.equal(check.sharp.length, 4);
  for (const index of check.sharp) {
    const p = box.points[index];
    assert.ok((p.x === 0 || p.x === 30) && (p.y === 0 || p.y === 20));
  }
});

test('corrects a small kink within the displacement limit and keeps the start', () => {
  const input = resampleClosedContour(
    circle(20, 200, (i) => (i === 50 ? 1.5 : 0)),
    0.5,
  );
  const result = correctSharpCurves(input);
  assert.ok(result.before.sharp.length > 0);
  assert.equal(result.after.sharp.length, 0);
  assert.equal(result.warning, undefined);
  assert.ok(result.maxShift <= 3 + 1e-9);
  // points[0] is the corrected point that came from the original start.
  const start = result.contour.points[0];
  assert.ok(
    Math.hypot(start.x - input.points[0].x, start.y - input.points[0].y) < 0.5,
  );
  assert.equal(start.t, 0);
  assert.ok(validateContour(result.contour.points).valid);
  // Still evenly resampled at the requested spacing.
  assert.ok(Math.abs(result.contour.actualSpacing - 0.5) < 0.01);
});

test('rounds rectangle corners to the minimum radius', () => {
  const result = correctSharpCurves(
    resampleClosedContour(rectangle(40, 30), 0.5),
  );
  assert.equal(result.after.sharp.length, 0);
  assert.ok(result.after.minRadius >= 6);
  assert.ok(result.maxShift <= 3 + 1e-9);
  assert.ok(result.iterationsApplied <= 30);
});

test('warns when the shape cannot be corrected and never moves more than 3m', () => {
  // A 2m-wide strip can never turn with a 6m radius.
  const input = resampleClosedContour(rectangle(30, 2), 0.5);
  const result = correctSharpCurves(input);
  assert.ok(result.after.sharp.length > 0);
  assert.match(result.warning ?? '', /急カーブが\d+点残りました/);
  assert.ok(result.maxShift <= 3 + 1e-9);
  assert.ok(validateContour(result.contour.points).valid);
  assert.ok(result.iterationsApplied <= 30);
  // The tightest turn never gets worse, even when it cannot reach the minimum.
  assert.ok(result.after.minRadius >= result.before.minRadius);
});

test('respects custom limits and rejects invalid settings', () => {
  const input = resampleClosedContour(rectangle(40, 30), 0.5);
  const none = correctSharpCurves(input, {
    ...DEFAULT_CURVE_CORRECTION,
    maxCorrectionIterations: 0,
  });
  assert.equal(none.iterationsApplied, 0);
  assert.equal(none.after.sharp.length, 4);
  assert.match(none.warning ?? '', /残りました/);
  const tight = correctSharpCurves(input, {
    ...DEFAULT_CURVE_CORRECTION,
    maxDisplacement: 0.5,
  });
  assert.ok(tight.maxShift <= 0.5 + 1e-9);
  assert.throws(
    () =>
      correctSharpCurves(input, {
        ...DEFAULT_CURVE_CORRECTION,
        minTurnRadius: 0,
      }),
    /設定/,
  );
});

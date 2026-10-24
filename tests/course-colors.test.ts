import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignToReference,
  colorAt,
  DEFAULT_COLOR_MAPPING,
  distanceFractions,
  mapCourseColors,
} from '../src/image-processing/mapCourseColors.ts';
import type { RepresentativeColor } from '../src/image-processing/extractColors.ts';

type RGB = [number, number, number];
const segmentsOf = (colors: RGB[]): RepresentativeColor[] =>
  colors.map((color, i) => ({
    t: (i + 0.5) / colors.length,
    startT: i / colors.length,
    endT: (i + 1) / colors.length,
    color,
    sampleCount: 9,
    interpolated: false,
  }));
const RED: RGB = [255, 0, 0],
  GREEN: RGB = [0, 255, 0],
  BLUE: RGB = [0, 0, 255],
  WHITE: RGB = [255, 255, 255];
// Counterclockwise on screen (image y down), starting at the top right like Issue #7.
const square = (size: number, count: number) => {
  const points = [];
  for (let i = 0; i < count; i++) {
    const d = (i / count) * size * 4,
      side = Math.floor(d / size),
      o = d - side * size;
    points.push(
      side === 0
        ? { x: size - o, y: 0 }
        : side === 1
          ? { x: 0, y: o }
          : side === 2
            ? { x: o, y: size }
            : { x: size, y: size - o },
    );
  }
  return points;
};

test('blendRatio defaults to 0.2', () => {
  assert.deepEqual(DEFAULT_COLOR_MAPPING, { blendRatio: 0.2 });
});

test('distance fractions start at 0 and include the closing edge', () => {
  const t = distanceFractions(square(10, 4));
  assert.deepEqual(t, [0, 0.25, 0.5, 0.75]);
});

test('segment centers keep their own color; only boundaries blend', () => {
  const segments = segmentsOf([RED, BLUE, GREEN, WHITE]);
  assert.deepEqual(colorAt(segments, 0.125), RED);
  assert.deepEqual(colorAt(segments, 0.375), BLUE);
  // Blend zone is 0.2 x 0.25 = 0.05 wide: 0.025 each side of a boundary.
  assert.deepEqual(colorAt(segments, 0.25 - 0.026), RED);
  assert.deepEqual(colorAt(segments, 0.25 + 0.026), BLUE);
  assert.deepEqual(colorAt(segments, 0.25), [128, 0, 128]);
  const near = colorAt(segments, 0.25 - 0.0125);
  assert.ok(near[0] > 128 && near[2] > 0 && near[0] + near[2] === 255);
  // No gradient at all with blendRatio 0.
  assert.deepEqual(colorAt(segments, 0.2499, 0), RED);
});

test('the loop closes: last and first segments blend across t = 0', () => {
  const segments = segmentsOf([RED, BLUE, GREEN, WHITE]);
  assert.deepEqual(colorAt(segments, 0), [255, 128, 128]);
  assert.deepEqual(colorAt(segments, 1), colorAt(segments, 0));
  const before = colorAt(segments, 0.99),
    after = colorAt(segments, 0.01);
  assert.ok(before[1] > 128 && after[1] < 128 && after[1] > 0);
});

test('every course point gets an RGB from its distance fraction', () => {
  const course = square(10, 80);
  const result = mapCourseColors(
    segmentsOf([RED, BLUE, GREEN, WHITE]),
    course,
    course,
  );
  assert.equal(result.points.length, 80);
  assert.ok(result.points.every((p) => /^#[0-9a-f]{6}$/.test(p.color)));
  assert.equal(result.points[10].color, '#ff0000');
  assert.equal(result.points[30].color, '#0000ff');
  assert.equal(result.reversed, false);
  assert.equal(result.rotated, 0);
  // Neighboring points never jump by more than a gradient step.
  for (let i = 0; i < 80; i++) {
    const a = result.points[i].rgb,
      b = result.points[(i + 1) % 80].rgb;
    assert.ok(Math.max(...a.map((v, c) => Math.abs(v - b[c]))) < 255);
  }
  // Stops are in progress order, start at 0, and use #RRGGBB.
  const stops = result.wallColorStops;
  assert.equal(stops[0].progress, 0);
  assert.ok(
    stops.every((s, i) => i === 0 || s.progress > stops[i - 1].progress),
  );
  assert.ok(stops.length < result.points.length);
});

test('a course running the other way or starting elsewhere is aligned to the original', () => {
  const reference = square(10, 80);
  const segments = segmentsOf([RED, BLUE, GREEN, WHITE]);
  const expected = mapCourseColors(segments, reference, reference);
  const rotated = [...reference.slice(25), ...reference.slice(0, 25)];
  const r = mapCourseColors(segments, rotated, reference);
  assert.equal(r.rotated, 55);
  assert.deepEqual(
    r.points.map((p) => p.color),
    expected.points.map((p) => p.color),
  );
  const reversed = [...reference].reverse();
  const v = mapCourseColors(segments, reversed, reference);
  assert.equal(v.reversed, true);
  assert.deepEqual(v.points[0], expected.points[0]);
  assert.deepEqual(
    v.points.map((p) => p.color),
    expected.points.map((p) => p.color),
  );
  const { points } = alignToReference(reversed, reference);
  assert.deepEqual(points[1], reference[1]);
});

test('corrected courses keep colors in order by distance, not by point index', () => {
  const reference = square(10, 40);
  // Same shape, uneven points: denser on the first side.
  const uneven = [
    ...Array.from({ length: 30 }, (_, i) => ({ x: 10 - i / 3, y: 0 })),
    { x: 0, y: 5 },
    { x: 0, y: 10 },
    { x: 5, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 5 },
  ];
  const result = mapCourseColors(
    segmentsOf([RED, BLUE, GREEN, WHITE]),
    uneven,
    reference,
  );
  assert.equal(result.points[15].color, '#ff0000');
  // Points 30..34 are (0,5) (0,10) (5,10) (10,10) (10,5).
  assert.equal(result.points[30].color, '#0000ff');
  assert.equal(result.points[32].color, '#00ff00');
  assert.equal(result.points[34].color, '#ffffff');
});

test('colors follow places on the original, even where it is longer (jagged edges)', () => {
  // Original: the top side zigzags, so it is twice as long as on the smooth course.
  const top = Array.from({ length: 20 }, (_, i) => ({
    x: 10 - i / 2,
    y: i % 2 ? Math.sqrt(0.75) : 0,
  }));
  const reference = [
    ...top,
    { x: 0, y: 0 },
    { x: 0, y: 5 },
    { x: 0, y: 10 },
    { x: 5, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 5 },
  ];
  const course = square(10, 80);
  const result = mapCourseColors(
    segmentsOf([RED, BLUE, GREEN, WHITE]),
    course,
    reference,
  );
  // (0,8) on the course is 28m of 50m along the original: green, not the plain 0.45 (blue).
  const p = result.points.find((q) => q.x === 0 && Math.abs(q.y - 8) < 1e-9)!;
  assert.ok(Math.abs(p.sourceT - 28 / 50) < 0.01);
  assert.equal(p.color, '#00ff00');
  // Source positions only move forward around the loop.
  const sources = result.points.map((q) => q.sourceT);
  assert.ok(sources.every((t, i) => i === 0 || t >= sources[i - 1]));
});

test('rejects invalid segments and settings', () => {
  const course = square(10, 8);
  assert.throws(() => mapCourseColors([], course, course), /色がありません/);
  const gap = segmentsOf([RED, BLUE]);
  gap[1] = { ...gap[1], startT: 0.6 };
  assert.throws(() => mapCourseColors(gap, course, course), /隙間/);
  assert.throws(
    () => mapCourseColors(segmentsOf([RED]), course, course, { blendRatio: 2 }),
    /0〜1/,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapturedPerson } from '../src/capture/capture.ts';
import {
  buildCourse,
  DEFAULT_ROAD_WIDTH,
  DEFAULT_WALL_COLOR,
  generateCourse,
  toGameSpace,
} from '../src/image-processing/generateCourse.ts';
import { fitRoad } from '../src/image-processing/fitRoad.ts';
import { resampleClosedContour } from '../src/image-processing/resampleContour.ts';
import {
  correctSharpCurves,
  detectSharpCurves,
} from '../src/image-processing/correctCurves.ts';
import { signedImageArea } from '../src/image-processing/normalizeContour.ts';
import type { RepresentativeColor } from '../src/image-processing/extractColors.ts';
import type { CoursePoint } from '../shared/course.ts';

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
// Photo meters (100x100 px photo, 1px = 1m), counterclockwise on screen,
// START at the top right (Issue #7).
const outline = [
  { x: 60, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 50 },
  { x: 60, y: 50 },
];
function person(shape = outline, colors?: RGB[]): CapturedPerson {
  const curveCorrection = correctSharpCurves({
    ...resampleClosedContour(shape, 0.5),
    metersPerPixel: 1,
  });
  return {
    blob: new Blob(),
    width: 100,
    height: 100,
    bodyStatus: 'full_body',
    capturedAt: 1,
    outline: {
      points: shape.map((p) => ({ x: p.x / 100, y: p.y / 100 })),
      touchesEdge: false,
    },
    curveCorrection,
    colorExtraction: colors
      ? {
          colorSamples: segmentsOf(colors),
          probes: [],
          warnings: [],
          config: {
            segmentCount: colors.length,
            samplesPerSegment: 3,
            inwardOffsets: [3, 6, 10],
            defaultColor: [160, 160, 160],
          },
        }
      : undefined,
  };
}
/** Smallest distance between parts of the loop that are far apart along it. */
function minSeparation(points: CoursePoint[], minArc: number) {
  const n = points.length,
    arc = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i],
      b = points[(i + 1) % n];
    arc.push(arc[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  let best = Infinity;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const along = Math.min(arc[j] - arc[i], arc[n] - (arc[j] - arc[i]));
      if (along >= minArc)
        best = Math.min(
          best,
          Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z),
        );
    }
  return best;
}
const radii = (points: CoursePoint[]) =>
  detectSharpCurves(points.map((p) => ({ x: p.x, y: p.z })));

test('game space keeps image x/y as x/z, centered, so the loop stays counterclockwise', () => {
  const points = toGameSpace(outline);
  assert.deepEqual(points, [
    { x: 25, z: -20 },
    { x: -25, z: -20 },
    { x: -25, z: 20 },
    { x: 25, z: 20 },
  ]);
  assert.ok(
    Math.sign(signedImageArea(points.map((p) => ({ x: p.x, y: p.z })))) ===
      Math.sign(signedImageArea(outline)),
  );
  // Scaled so the longest side is courseSize.
  const scaled = toGameSpace(outline, 140);
  assert.equal(scaled[0].x - scaled[1].x, 140);
});

test('builds CourseData from the photo with person colors', () => {
  const course = generateCourse(
    person(outline, [
      [255, 0, 0],
      [0, 0, 255],
      [0, 0, 255],
      [0, 0, 255],
    ]),
  );
  assert.ok(course.points.length > 50);
  assert.equal(course.roadWidth, DEFAULT_ROAD_WIDTH);
  assert.equal(course.captureMode, 'full_body');
  assert.equal(course.wallColorStops[0].progress, 0);
  assert.ok(course.wallColorStops.every((s) => /^#[0-9a-f]{6}$/.test(s.color)));
  assert.equal(course.themeColor, '#0000ff');
  // START is first, near the top-right of the shape, and the loop runs counterclockwise.
  assert.ok(course.points[0].x > 30 && course.points[0].z < -30);
  assert.ok(
    signedImageArea(course.points.map((p) => ({ x: p.x, y: p.z }))) < 0,
  );
});

test('falls back to a plain wall without colors, and clipped photos stay clipped', () => {
  const p = { ...person(), bodyStatus: 'clipped' as const };
  const course = generateCourse(p);
  assert.deepEqual(course.wallColorStops, [
    { progress: 0, color: DEFAULT_WALL_COLOR },
  ]);
  assert.equal(course.captureMode, 'clipped');
  assert.equal(
    generateCourse({ ...p, bodyStatus: 'unknown' }).captureMode,
    'clipped',
  );
});

test('explains when the course shape is missing', () => {
  assert.throws(
    () => generateCourse({ ...person(), curveCorrection: undefined }),
    /コースの形/,
  );
});

// A hand: a palm with four thin fingers and narrow gaps between them.
const hand = (() => {
  const points = [{ x: 50, y: 40 }];
  for (let f = 3; f >= 0; f--) {
    const x = 15 + f * 8;
    points.push(
      { x: x + 3, y: 40 },
      { x: x + 3, y: 5 },
      { x, y: 5 },
      { x, y: 40 },
    );
  }
  points.push({ x: 10, y: 40 }, { x: 10, y: 80 }, { x: 50, y: 80 });
  return points;
})();

test('thin fingers and narrow gaps become one road that never overlaps itself', () => {
  const before = toGameSpace(
    correctSharpCurves({
      ...resampleClosedContour(hand, 0.5),
      metersPerPixel: 1,
    }).contour.points,
    140,
  );
  // As drawn, the way up and down each finger is closer than the road width.
  assert.ok(minSeparation(before, 3 * DEFAULT_ROAD_WIDTH) < DEFAULT_ROAD_WIDTH);
  const { course } = buildCourse(person(hand));
  // After fitting, distant parts of the loop stay more than 1.5 road widths apart.
  assert.ok(
    minSeparation(course.points, 3 * DEFAULT_ROAD_WIDTH) >
      1.5 * DEFAULT_ROAD_WIDTH,
  );
  // And no turn is tighter than the truck's turning radius (6).
  assert.ok(radii(course.points).minRadius >= 6);
});

test('fitRoad keeps long thin limbs instead of cutting them off', () => {
  // A T shape: a body with a long thin arm to the right.
  const shape = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 5 },
    { x: 30, y: 5 },
    { x: 30, y: 60 },
    { x: 0, y: 60 },
  ].map((p) => ({ x: p.x * 1.4, z: p.y * 1.4 }));
  const fitted = fitRoad(shape, DEFAULT_ROAD_WIDTH);
  const xs = fitted.points.map((p) => p.x);
  // The arm tip (x = 140) is still there, grown by about one road width.
  assert.ok(Math.max(...xs) > 140);
  assert.ok(
    minSeparation(fitted.points, 3 * DEFAULT_ROAD_WIDTH) >
      1.5 * DEFAULT_ROAD_WIDTH,
  );
});

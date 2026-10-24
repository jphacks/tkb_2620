import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapturedPerson } from '../src/capture/capture.ts';
import {
  DEFAULT_ROAD_WIDTH,
  DEFAULT_WALL_COLOR,
  dominantColor,
  generateCourse,
  toGameSpace,
} from '../src/image-processing/generateCourse.ts';
import { mapCourseColors } from '../src/image-processing/mapCourseColors.ts';
import { resampleClosedContour } from '../src/image-processing/resampleContour.ts';
import { correctSharpCurves } from '../src/image-processing/correctCurves.ts';
import { signedImageArea } from '../src/image-processing/normalizeContour.ts';
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
// Photo meters, counterclockwise on screen, START at the top right (Issue #7).
const outline = [
  { x: 60, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 50 },
  { x: 60, y: 50 },
];
function person(withColors: boolean): CapturedPerson {
  const curveCorrection = correctSharpCurves(
    resampleClosedContour(outline, 0.5),
  );
  return {
    blob: new Blob(),
    width: 100,
    height: 100,
    bodyStatus: 'full_body',
    capturedAt: 1,
    curveCorrection,
    courseColors: withColors
      ? mapCourseColors(
          segmentsOf([
            [255, 0, 0],
            [0, 0, 255],
            [0, 0, 255],
            [0, 0, 255],
          ]),
          curveCorrection.contour.points,
          outline,
        )
      : undefined,
  };
}

test('game space keeps image x/y as x/z, centered, so the loop stays counterclockwise', () => {
  const points = toGameSpace(outline);
  assert.deepEqual(points, [
    { x: 25, z: -20 },
    { x: -25, z: -20 },
    { x: -25, z: 20 },
    { x: 25, z: 20 },
  ]);
  // Top is -z and right is +x, so screen and game orientation match.
  assert.ok(
    Math.sign(signedImageArea(points.map((p) => ({ x: p.x, y: p.z })))) ===
      Math.sign(signedImageArea(outline)),
  );
});

test('builds CourseData from the corrected course and person colors', () => {
  const course = generateCourse(person(true));
  assert.ok(course.points.length > 100);
  assert.equal(course.roadWidth, DEFAULT_ROAD_WIDTH);
  assert.equal(course.captureMode, 'full_body');
  assert.equal(course.wallColorStops[0].progress, 0);
  assert.ok(course.wallColorStops.every((s) => /^#[0-9a-f]{6}$/.test(s.color)));
  // Blue covers three quarters of the wall, so it becomes the theme color.
  assert.equal(course.themeColor, '#0000ff');
  // START is first: the top-right corner area of the outline.
  assert.ok(course.points[0].x > 15 && course.points[0].z < -15);
  // Centered on the origin, and the longest side (width 50m) scaled to 140.
  const xs = course.points.map((p) => p.x);
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 140) < 1e-9);
  const small = generateCourse(person(true), { courseSize: 50, roadWidth: 4 });
  assert.equal(small.roadWidth, 4);
  const sx = small.points.map((p) => p.x);
  assert.ok(Math.abs(Math.max(...sx) - Math.min(...sx) - 50) < 1e-9);
});

test('falls back to a plain wall without colors, and clipped photos stay clipped', () => {
  const p = { ...person(false), bodyStatus: 'clipped' as const };
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
    () => generateCourse({ ...person(false), curveCorrection: undefined }),
    /コースの形/,
  );
});

test('theme color is the longest stretch of one color', () => {
  const colors = person(true).courseColors!;
  assert.equal(dominantColor(colors), '#0000ff');
});

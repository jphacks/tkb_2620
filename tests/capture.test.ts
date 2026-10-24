import {
  resampleClosedContour,
  resamplePhotoContour,
} from '../src/image-processing/resampleContour.ts';
import {
  smoothClosedContour,
  DEFAULT_SMOOTHING,
} from '../src/image-processing/previewContour.ts';
import { closeSmallMaskGaps } from '../src/image-processing/cleanPersonMask.ts';
import {
  smoothPreviewContour,
  previewContourPath,
} from '../src/image-processing/previewContour.ts';
import {
  extractPersonOutline,
  extractOuterContour,
  validateContour,
} from '../src/image-processing/extractContour.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bodyGuidance,
  validatePhoto,
  readPhoto,
  isFullBody,
} from '../src/capture/capture.ts';

const pose = () =>
  Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));

test('full body requires visible face, both arms and feet within the frame', () => {
  assert.equal(isFullBody(pose()), true);
  assert.equal(isFullBody([]), false);
  for (const index of [0, 15, 16, 27, 28, 31, 32]) {
    for (const replacement of [
      { x: 0.5, y: 0.99, visibility: 0.9 },
      { x: -0.1, y: 0.5, visibility: 0.9 },
      { x: 0.5, y: 0.5, visibility: 0.2 },
      { x: NaN, y: 0.5, visibility: 0.9 },
    ]) {
      const points = pose();
      points[index] = replacement;
      assert.equal(isFullBody(points), false);
    }
  }
});

test('guidance identifies missing feet and distinguishes an absent person', () => {
  assert.match(bodyGuidance([]), /人物を認識できていません/);
  const points = pose();
  points[31].visibility = 0.1;
  assert.match(bodyGuidance(points), /両足の足先/);
  assert.doesNotMatch(bodyGuidance(points), /顔を/);
  assert.match(bodyGuidance(pose()), /全身を確認できました/);
});

test('rejects empty, non-image and oversized files', () => {
  assert.throws(
    () => validatePhoto(new File([], 'empty.jpg', { type: 'image/jpeg' })),
    /空のファイル/,
  );
  assert.throws(
    () => validatePhoto(new File(['text'], 'text.txt', { type: 'text/plain' })),
    /画像ファイル/,
  );
  assert.throws(
    () => validatePhoto({ size: 21 * 1024 * 1024, type: 'image/jpeg' } as File),
    /20MB/,
  );
  assert.doesNotThrow(() =>
    validatePhoto(new File(['image'], 'photo.jpg', { type: 'image/jpeg' })),
  );
});

test('normalizes photo size and releases decoded image, including conversion failure', async (t) => {
  let closed = 0;
  const bitmap = {
    width: 4000,
    height: 3000,
    close: () => {
      closed++;
    },
  };
  const blob = new Blob(['png'], { type: 'image/png' });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback: (value: Blob | null) => void) => callback(blob),
  };
  for (const [key, value] of Object.entries({
    document: { createElement: () => canvas },
    createImageBitmap: async () => bitmap,
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const file = new File(['image'], 'phone.jpg', { type: 'image/jpeg' });
  const photo = await readPhoto(file);
  assert.equal(photo.width, 2048);
  assert.equal(photo.height, 1536);
  assert.equal(photo.blob, blob);
  assert.equal(photo.bodyStatus, 'unknown');
  assert.equal(closed, 1);
  canvas.toBlob = (callback) => callback(null);
  await assert.rejects(readPhoto(file), /準備できません/);
  assert.equal(closed, 2);
});

function outline(rows: string[]) {
  return extractPersonOutline(
    Float32Array.from(rows.join(''), (value) => (value === '#' ? 1 : 0)),
    rows[0].length,
    rows.length,
  );
}
function area(points: { x: number; y: number }[]) {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}
test('clipped body closes along the bottom photo edge with a straight segment', () => {
  const result = outline(['..##..', '.####.', '.####.', '.####.'])!;
  assert.equal(result.touchesEdge, true);
  const bottom = result.points.filter((p) => p.y === 1);
  assert.deepEqual(bottom, [
    { x: 5 / 6, y: 1 },
    { x: 1 / 6, y: 1 },
  ]);
  assert.ok(
    result.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
  );
});
test('silhouette remains concave instead of replacing arms with a convex hull', () => {
  const result = outline([
    '.......',
    '.##.##.',
    '.##.##.',
    '.#####.',
    '.#####.',
    '.......',
  ])!;
  assert.equal(result.touchesEdge, false);
  assert.equal(result.points.length, 8);
  assert.ok(result.points.some((p) => p.x === 3 / 7 && p.y === 3 / 6));
});
test('largest outer boundary excludes holes and detached noise', () => {
  const result = outline([
    '#......',
    '..####.',
    '..#..#.',
    '..#..#.',
    '..####.',
    '.......',
  ])!;
  assert.equal(result.touchesEdge, false);
  assert.equal(result.points.length, 4);
  assert.ok(Math.abs(area(result.points) - 16 / 42) < 0.00001);
});
test('all four clipped edges close as the photo rectangle; empty masks produce no fake outline', () => {
  const result = outline(['####', '####', '####'])!;
  assert.equal(result.points.length, 4);
  assert.equal(result.touchesEdge, true);
  assert.equal(area(result.points), 1);
  assert.equal(outline(['....', '....']), null);
  assert.equal(outline(['....', '.#..', '....']), null);
  assert.throws(
    () => extractPersonOutline(new Float32Array(2), 3, 4),
    /Invalid/,
  );
});

test('binary contour API returns ordered pixel coordinates and rejects invalid inputs', () => {
  const pixels = extractOuterContour(
    Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
    4,
    4,
  );
  assert.deepEqual(pixels, [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 3 },
    { x: 1, y: 3 },
  ]);
  assert.equal(validateContour(pixels).valid, true);
  assert.throws(
    () => extractOuterContour(new Uint8Array(16), 4, 4),
    /見つかりません/,
  );
  assert.throws(
    () => extractOuterContour(Uint8Array.from([2, 1, 1, 1]), 2, 2),
    /0または1/,
  );
});
test('invalid loops reject crossings, duplicate points, nonfinite values and zero area', () => {
  assert.equal(
    validateContour([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
    ]).valid,
    false,
  );
  assert.equal(
    validateContour([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]).valid,
    false,
  );
  assert.equal(
    validateContour([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: NaN, y: 1 },
    ]).valid,
    false,
  );
  assert.equal(
    validateContour([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]).valid,
    false,
  );
  assert.equal(validateContour([]).valid, false);
});

test('preview smoothing keeps the original and clipped edges while producing a closed curved path', () => {
  const original = [
    { x: 0.2, y: 0 },
    { x: 0.8, y: 0 },
    { x: 0.8, y: 1 },
    { x: 0.2, y: 1 },
  ];
  const snapshot = structuredClone(original);
  const smooth = smoothPreviewContour(original, 500, 1000);
  assert.deepEqual(original, snapshot);
  assert.equal(validateContour(smooth).valid, true);
  assert.ok(smooth.some((p) => p.y === 0));
  assert.ok(smooth.some((p) => p.y === 1));
  assert.ok(
    smooth.every(
      (p) => p.x >= 0.2 - 1e-12 && p.x <= 0.8 + 1e-12 && p.y >= 0 && p.y <= 1,
    ),
  );
  assert.match(previewContourPath(smooth), /^M .*Q .* Z$/);
  assert.equal(previewContourPath([]), '');
  assert.deepEqual(smoothPreviewContour([], 500, 1000), []);
});

test('mask closing joins small wrist cracks but preserves wider body gaps and clipped borders', () => {
  const width = 11,
    height = 7;
  const rows = [
    '...........',
    '...........',
    '.###.####..',
    '.###.####..',
    '.###.####..',
    '...........',
    '...........',
  ];
  const input = Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));
  const closed = closeSmallMaskGaps(input, width, height);
  assert.equal(closed[3 * width + 4], 1);
  assert.equal(input[3 * width + 4], 0);
  const clipped = closeSmallMaskGaps(new Uint8Array(25).fill(1), 5, 5);
  assert.ok(clipped.every((v) => v === 1));
  const separated = Uint8Array.from(
    ['##....##', '##....##', '##....##'].join(''),
    (c) => (c === '#' ? 1 : 0),
  );
  assert.equal(closeSmallMaskGaps(separated, 8, 3)[1 * 8 + 3], 0);
});

test('smoothing defaults, zero settings and invalid parameters', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];
  assert.deepEqual(DEFAULT_SMOOTHING, { iterations: 3, strength: 0.4 });
  assert.deepEqual(
    smoothClosedContour(square, 500, 1000, { iterations: 0, strength: 0.4 })
      .points,
    square,
  );
  assert.deepEqual(
    smoothClosedContour(square, 500, 1000, { iterations: 3, strength: 0 })
      .points,
    square,
  );
  assert.throws(
    () =>
      smoothClosedContour(square, 500, 1000, { iterations: 3, strength: NaN }),
    /範囲外/,
  );
  assert.throws(
    () =>
      smoothClosedContour(square, 500, 1000, { iterations: -1, strength: 0.4 }),
    /範囲外/,
  );
  assert.throws(() => smoothClosedContour(square, 0, 1000), /寸法/);
  assert.throws(() => smoothClosedContour([], 500, 1000), /点/);
});
test('adjustable smoothing reduces small radial bumps without mutating the original silhouette', () => {
  const points = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2,
      r = 0.3 + 0.008 * Math.cos(a * 24);
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });
  const original = structuredClone(points);
  const light = smoothClosedContour(points, 1000, 1000, {
    iterations: 1,
    strength: 0.2,
  });
  const strong = smoothClosedContour(points, 1000, 1000, {
    iterations: 8,
    strength: 0.8,
  });
  const range = (ps: { x: number; y: number }[]) => {
    const radii = ps.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5));
    return Math.max(...radii) - Math.min(...radii);
  };
  assert.ok(range(strong.points) < range(points));
  assert.notDeepEqual(light.points, strong.points);
  assert.deepEqual(points, original);
  assert.equal(validateContour(strong.points).valid, true);
  assert.ok(
    strong.points.every(
      (p) => Math.abs(Math.hypot(p.x - 0.5, p.y - 0.5) - 0.3) < 0.03,
    ),
  );
});

const rectangle = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 1 },
  { x: 0, y: 1 },
];
test('closed resampling includes closing edge, equal arc spacing, t and preserves start/direction', () => {
  const result = resampleClosedContour(rectangle, 0.5);
  assert.equal(result.totalLength, 6);
  assert.equal(result.points.length, 12);
  assert.equal(result.actualSpacing, 0.5);
  assert.deepEqual(result.points[0], { x: 0, y: 0, t: 0, distance: 0 });
  assert.equal(result.points[1].x, 0.5);
  assert.deepEqual(result.points[11], {
    x: 0,
    y: 0.5,
    t: 11 / 12,
    distance: 5.5,
  });
  for (let i = 0; i < 12; i++) {
    assert.equal(result.points[i].distance, i * 0.5);
    assert.ok(
      Math.abs(
        Math.hypot(
          result.points[i].x - result.points[(i + 1) % 12].x,
          result.points[i].y - result.points[(i + 1) % 12].y,
        ) - 0.5,
      ) < 1e-10,
    );
  }
  const backwards = resampleClosedContour(
    [rectangle[0], ...rectangle.slice(1).reverse()],
    0.5,
  );
  assert.equal(backwards.points[1].y, 0.5);
});
test('non-divisible spacing is adjusted to close evenly without duplicating the endpoint', () => {
  const result = resampleClosedContour(rectangle, 0.7);
  assert.equal(result.points.length, 9);
  assert.ok(Math.abs(result.actualSpacing - 6 / 9) < 1e-12);
  assert.ok(
    Math.abs(
      result.totalLength -
        result.points.at(-1)!.distance -
        result.actualSpacing,
    ) < 1e-12,
  );
  assert.ok(result.points.every((p) => p.t >= 0 && p.t < 1));
});
test('duplicates and tiny edges are removed without changing input or perimeter', () => {
  const points = [
    rectangle[0],
    rectangle[0],
    { x: 1e-9, y: 0 },
    ...rectangle.slice(1),
    rectangle[0],
  ];
  const copy = structuredClone(points);
  assert.equal(resampleClosedContour(points, 0.5).totalLength, 6);
  assert.deepEqual(points, copy);
  assert.throws(() => resampleClosedContour(rectangle, 0), /点間隔/);
  assert.throws(() => resampleClosedContour(rectangle, NaN), /点間隔/);
  assert.throws(() => resampleClosedContour(rectangle, 1e-6), /点数/);
  assert.throws(
    () =>
      resampleClosedContour(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        0.5,
      ),
    /点/,
  );
});
test('photo conversion uses the photo pixel dimensions and explicit meters per pixel', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const result = resamplePhotoContour(points, 200, 100, {
    metersPerPixel: 0.01,
    spacing: 0.5,
  });
  assert.equal(result.totalLength, 6);
  assert.equal(result.metersPerPixel, 0.01);
  assert.equal(result.imageWidth, 200);
  assert.equal(result.points[4].x, 2);
  assert.equal(result.points[6].y, 1);
  assert.throws(
    () =>
      resamplePhotoContour(points, 200, 100, {
        metersPerPixel: 0,
        spacing: 0.5,
      }),
    /倍率/,
  );
});

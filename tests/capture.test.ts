import {
  calculateMedianColor,
  extractRepresentativeColors,
  splitContourIntoSegments,
} from '../src/image-processing/extractColors.ts';
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
import {
  findStartIndex,
  orderFromStart,
  signedImageArea,
} from '../src/image-processing/normalizeContour.ts';
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

function colorFixture(empty = false) {
  const width = 40,
    height = 40,
    data = new Uint8ClampedArray(width * height * 4),
    mask = new Uint8Array(100);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++)
      mask[y * 10 + x] = !empty && x >= 1 && x < 9 && y >= 1 && y < 9 ? 1 : 0;
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++)
      data.set(
        x >= 4 && x < 36 && y >= 4 && y < 36
          ? [200, 30, 40, 255]
          : [0, 0, 255, 255],
        (y * 40 + x) * 4,
      );
  return {
    image: { width, height, data },
    mask: { width: 10, height: 10, data: mask },
    contour: [
      { x: 4, y: 4 },
      { x: 36, y: 4 },
      { x: 36, y: 36 },
      { x: 4, y: 36 },
    ],
  };
}
test('color extraction samples inside a different-resolution mask in both contour directions', () => {
  const { image, mask, contour } = colorFixture();
  for (const points of [contour, [contour[0], ...contour.slice(1).reverse()]]) {
    const result = extractRepresentativeColors(image, mask, points);
    assert.equal(result.colorSamples.length, 16);
    assert.equal(result.warnings.length, 0);
    assert.ok(
      result.colorSamples.every((s) => s.color.join(',') === '200,30,40'),
    );
    assert.ok(
      result.probes.every((p) => p.x >= 4 && p.x < 36 && p.y >= 4 && p.y < 36),
    );
    assert.equal(result.colorSamples[0].t, 0.03125);
  }
});
test('RGB median suppresses outliers and missing colors safely fall back', () => {
  assert.deepEqual(
    calculateMedianColor([
      [220, 40, 35],
      [225, 45, 40],
      [180, 30, 30],
      [222, 42, 38],
      [245, 200, 195],
    ]),
    [222, 42, 38],
  );
  const { image, mask, contour } = colorFixture(true);
  const result = extractRepresentativeColors(image, mask, contour);
  assert.equal(result.probes.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.ok(
    result.colorSamples.every(
      (s) => s.interpolated && s.color.join(',') === '160,160,160',
    ),
  );
  assert.throws(
    () =>
      extractRepresentativeColors(image, mask, contour, {
        inwardOffsets: [-1],
      }),
    /設定/,
  );
});
test('partial sampling failures fill from adjacent valid segments across the loop seam', () => {
  const { image, mask, contour } = colorFixture();
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++)
      if (y < 15) image.data[(y * 40 + x) * 4 + 3] = 0;
  const result = extractRepresentativeColors(image, mask, contour);
  assert.ok(result.colorSamples.some((s) => s.interpolated));
  assert.ok(result.colorSamples.some((s) => s.sampleCount));
  assert.ok(
    result.colorSamples.every((s) => s.color.join(',') === '200,30,40'),
  );
  assert.ok(result.warnings.length > 0);
});
test('color segments follow arc distance rather than point density', () => {
  const { contour } = colorFixture();
  const a = splitContourIntoSegments(contour),
    b = splitContourIntoSegments([
      contour[0],
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      ...contour.slice(1),
    ]);
  assert.equal(a.totalLength, b.totalLength);
  assert.deepEqual(a.at(0.125), b.at(0.125));
  assert.deepEqual(a.at(1), a.at(0));
});

test('color sampling remains in bounds when the person touches every photo edge', () => {
  const { image } = colorFixture();
  const result = extractRepresentativeColors(
    image,
    { width: 40, height: 40, data: new Uint8Array(1600).fill(1) },
    [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ],
  );
  assert.ok(result.probes.length > 0);
  assert.ok(
    result.probes.every((p) => p.x >= 0 && p.x < 40 && p.y >= 0 && p.y < 40),
  );
  assert.equal(result.colorSamples.length, 16);
});

test('START is the topmost point, and the rightmost one when tied (#7)', () => {
  // 画像座標なので「最も上」は y が最小
  const points = [
    { x: 0.2, y: 0.5 },
    { x: 0.4, y: 0.1 },
    { x: 0.6, y: 0.1 },
    { x: 0.8, y: 0.5 },
    { x: 0.5, y: 0.9 },
  ];
  assert.equal(findStartIndex(points), 2);
  assert.equal(
    findStartIndex([
      { x: 0, y: 0.3 },
      { x: 1, y: 0.2 },
    ]),
    1,
  );
});

test('orderFromStart makes the loop counterclockwise on screen and puts START first (#7)', () => {
  // 画面上で時計回り（上辺を右へ）。抽出された輪郭と同じ向き
  const clockwise = [
    { x: 0.2, y: 0.2, id: 'a' },
    { x: 0.8, y: 0.2, id: 'b' },
    { x: 0.8, y: 0.8, id: 'c' },
    { x: 0.2, y: 0.8, id: 'd' },
  ];
  const copy = structuredClone(clockwise);
  const ordered = orderFromStart(clockwise);
  assert.deepEqual(
    ordered.map((p) => p.id),
    ['b', 'a', 'd', 'c'],
    '右上から始まり、左（上→左→下→右）へ進む',
  );
  assert.ok(signedImageArea(ordered) < 0);
  assert.deepEqual(clockwise, copy, '入力は変更しない');
  // すでに反時計回りなら、回転だけ
  const again = orderFromStart([...ordered.slice(2), ...ordered.slice(0, 2)]);
  assert.deepEqual(again, ordered);
});

test('orderFromStart rejects loops whose START or direction cannot be decided (#7)', () => {
  assert.throws(() =>
    orderFromStart([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
  );
  assert.throws(() =>
    orderFromStart([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]),
  );
  assert.throws(() =>
    orderFromStart([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 1, y: 1 },
    ]),
  );
});

test('a traced silhouette starts at the top-right of the head and stays first through smoothing and resampling (#7)', () => {
  const width = 12,
    height = 16,
    mask = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  };
  fill(4, 2, 8, 6); // 頭（上辺は y=2、x=4〜8）
  fill(2, 6, 10, 11); // 胴と腕
  fill(3, 11, 5, 15); // 左脚
  fill(7, 11, 9, 15); // 右脚
  const outline = orderFromStart(
    extractOuterContour(mask, width, height).map((p) => ({
      x: p.x / width,
      y: p.y / height,
    })),
  );
  assert.deepEqual(outline[0], { x: 8 / width, y: 2 / height });
  assert.ok(signedImageArea(outline) < 0, '反時計回り');
  assert.ok(outline[1].x < outline[0].x, 'STARTから左へ進む');
  const smoothed = smoothClosedContour(
    outline,
    width,
    height,
    DEFAULT_SMOOTHING,
  );
  const start = findStartIndex(smoothed.points);
  assert.ok(
    start === 0 ||
      Math.abs(smoothed.points[start].y - smoothed.points[0].y) < 0.02,
    '平滑化後も先頭が最上部にある',
  );
  const resampled = resamplePhotoContour(smoothed.points, width, height, {
    spacing: 0.05,
    metersPerPixel: 0.05,
  });
  assert.equal(resampled.points[0].t, 0);
  assert.ok(
    Math.abs(resampled.points[0].x - smoothed.points[0].x * width * 0.05) <
      1e-9,
  );
  assert.ok(signedImageArea(resampled.points) < 0, '等間隔化後も反時計回り');
});

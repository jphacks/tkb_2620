import { extractPersonOutline } from '../src/image-processing/extractContour.ts';
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

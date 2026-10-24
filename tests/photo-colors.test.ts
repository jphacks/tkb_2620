import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readPhotoColors } from '../src/capture/photoColors.ts';
import type { CapturedPerson } from '../src/capture/capture';
const photo = (): CapturedPerson => ({
  blob: new Blob(),
  width: 40,
  height: 40,
  bodyStatus: 'clipped',
  capturedAt: 1,
  binaryMask: { width: 40, height: 40, data: new Uint8Array(1600).fill(1) },
  outline: {
    touchesEdge: true,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
});
function browser(t: TestContext, fail: boolean) {
  let closed = 0;
  for (const [name, value] of Object.entries({
    createImageBitmap: async () => ({ close: () => closed++ }),
    document: {
      createElement: () => ({
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => {
            if (fail) throw new Error('decode failed');
            return {
              width: 40,
              height: 40,
              data: Uint8ClampedArray.from(
                { length: 6400 },
                (_, i) => [180, 40, 70, 255][i % 4],
              ),
            };
          },
        }),
      }),
    },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return () => closed;
}
test('automatic photo processing retains standard 16 colors without inspection canvas', async (t) => {
  const closed = browser(t, false);
  const result = await readPhotoColors(photo());
  assert.equal(result.colorSamples.length, 16);
  assert.deepEqual(result.config.inwardOffsets, [3, 6, 10]);
  assert.ok(
    result.colorSamples.every((c) => c.color.join(',') === '180,40,70'),
  );
  assert.equal(closed(), 1);
});
test('bitmap is released when color reading fails', async (t) => {
  const closed = browser(t, true);
  await assert.rejects(readPhotoColors(photo()), /decode failed/);
  assert.equal(closed(), 1);
});
test('missing person outline cannot silently produce a fake color result', async () => {
  await assert.rejects(
    readPhotoColors({ ...photo(), outline: undefined }),
    /輪郭/,
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskMapPhoto } from '../src/capture/mapPhoto.ts';
test('cutout makes background transparent without changing foreground or mask', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const mask = { width: 2, height: 2, data: new Uint8Array([1, 0, 0, 1]) };
  const original = mask.data.slice();
  maskMapPhoto(pixels, 4, 4, mask);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const alpha = pixels[(y * 4 + x) * 4 + 3];
      assert.equal(alpha, Math.floor(x / 2) === Math.floor(y / 2) ? 255 : 0);
      assert.equal(pixels[(y * 4 + x) * 4], 255);
    }
  assert.deepEqual(mask.data, original);
});
test('invalid mask or pixel size is rejected', () => {
  assert.throws(() =>
    maskMapPhoto(new Uint8ClampedArray(4), 2, 2, {
      width: 1,
      height: 1,
      data: new Uint8Array([1]),
    }),
  );
});

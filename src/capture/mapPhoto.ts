import type { BinaryPersonMask } from '../image-processing/extractContour';

/** Mask only a local RGBA preview; keep original RGB and foreground alpha intact. */
export function maskMapPhoto(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: BinaryPersonMask,
) {
  if (
    data.length !== width * height * 4 ||
    mask.data.length !== mask.width * mask.height ||
    width <= 0 ||
    height <= 0 ||
    mask.width <= 0 ||
    mask.height <= 0
  )
    throw new Error('切り抜き画像のサイズが不正です。');
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (
        !mask.data[
          Math.floor((y * mask.height) / height) * mask.width +
            Math.floor((x * mask.width) / width)
        ]
      )
        data[(y * width + x) * 4 + 3] = 0;
    }
}

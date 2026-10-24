/** Close one-pixel cracks before selecting the largest person component.
 * Clamp at photo edges so clipped body regions remain on the photo boundary.
 */
export function closeSmallMaskGaps(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (mask.length !== width * height || width < 1 || height < 1)
    throw new Error('Invalid person mask');
  function pass(input: Uint8Array, dilate: boolean) {
    const output = new Uint8Array(input.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let value = dilate ? 0 : 1;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const neighbor =
              input[
                Math.min(height - 1, Math.max(0, y + dy)) * width +
                  Math.min(width - 1, Math.max(0, x + dx))
              ];
            value = dilate
              ? Math.max(value, neighbor)
              : Math.min(value, neighbor);
          }
        output[y * width + x] = value;
      }
    return output;
  }
  return pass(pass(mask, true), false);
}

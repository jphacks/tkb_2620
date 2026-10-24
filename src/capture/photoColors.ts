import type { CapturedPerson } from './capture';
import { extractRepresentativeColors } from '../image-processing/extractColors.ts';

/** The same extraction used by the inspection UI, with standard settings. */
export async function readPhotoColors(photo: CapturedPerson) {
  if (!photo.outline || !photo.binaryMask)
    throw new Error(
      '人物の輪郭を取得できませんでした。別の写真を選んでください。',
    );
  const bitmap = await createImageBitmap(photo.blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = photo.width;
    canvas.height = photo.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context)
      throw new Error(
        '写真の色を読み取れませんでした。もう一度判定してください。',
      );
    context.drawImage(bitmap, 0, 0);
    return extractRepresentativeColors(
      context.getImageData(0, 0, photo.width, photo.height),
      photo.binaryMask,
      photo.outline.points.map((p) => ({
        x: p.x * photo.width,
        y: p.y * photo.height,
      })),
    );
  } finally {
    bitmap.close();
  }
}

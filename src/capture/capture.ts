import type { ColorExtraction } from '../image-processing/extractColors';
import type {
  ResampledContour,
  ResamplingOptions,
} from '../image-processing/resampleContour';
import type { CourseColors } from '../image-processing/mapCourseColors';
import type { CurveCorrectionResult } from '../image-processing/correctCurves';
import type { SmoothingOptions } from '../image-processing/previewContour';
import type {
  BinaryPersonMask,
  PersonOutline,
} from '../image-processing/extractContour';
export type BodyStatus = 'full_body' | 'clipped' | 'unknown';

/** Orientation-normalized PNG, longest edge at most 2048 pixels. Kept in memory only; never uploaded or stored. */
export type CapturedPerson = {
  blob: Blob;
  width: number;
  height: number;
  bodyStatus: BodyStatus;
  capturedAt: number;
  recognitionMessage?: string;
  colorExtraction?: ColorExtraction;
  outline?: PersonOutline;
  binaryMask?: BinaryPersonMask;
  smoothedOutline?: PersonOutline;
  smoothingOptions?: SmoothingOptions;
  resampledContour?: ResampledContour;
  resamplingOptions?: ResamplingOptions;
  /** Resampled contour with sharp curves relaxed (Issue #6). */
  curveCorrection?: CurveCorrectionResult;
  /** Person colors assigned to each corrected course point (Issue #9). */
  courseColors?: CourseColors;
};

export type PosePoint = { x: number; y: number; visibility?: number };

// Face, shoulders, arms, hips, knees, ankles and feet must all be visible.
export function isFullBody(points: PosePoint[]): boolean {
  const required = [
    0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    32,
  ];
  return required.every((index) => {
    const point = points[index];
    return (
      point &&
      (point.visibility ?? 0) >= 0.65 &&
      point.x > 0.03 &&
      point.x < 0.97 &&
      point.y > 0.05 &&
      point.y < 0.95
    );
  });
}

export function validatePhoto(file: File) {
  if (file.size === 0)
    throw new Error('空のファイルです。別の写真を選んでください。');
  if (file.size > 20 * 1024 * 1024)
    throw new Error('写真は20MB以下にしてください。');
  if (file.type && !file.type.startsWith('image/'))
    throw new Error('画像ファイルを選んでください。');
}

/** Decode orientation and limit the longest edge before inference. */
export async function readPhoto(file: File): Promise<CapturedPerson> {
  validatePhoto(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      'この写真を読み込めませんでした。JPEG・PNGなどに変換して選び直してください。',
    );
  }
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 50_000_000
    )
      throw new Error(
        '写真の解像度が大きすぎるか、画像が壊れています。縮小して選び直してください。',
      );
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('写真を準備できませんでした。');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('写真を準備できませんでした。')),
        'image/png',
      ),
    );
    return {
      blob,
      width,
      height,
      bodyStatus: 'unknown',
      capturedAt: Date.now(),
    };
  } finally {
    bitmap.close();
  }
}

/** Explain the same checks used by isFullBody, without claiming recognition succeeded. */
export function bodyGuidance(points: PosePoint[]): string {
  if (!points.length)
    return '人物を認識できていません。明るい場所で、頭から足先まで写った、明るい写真を選んでください。';
  const groups = [
    { label: '顔', indices: [0, 2, 5, 7, 8] },
    { label: '両腕・手首', indices: [11, 12, 13, 14, 15, 16] },
    { label: '腰・膝', indices: [23, 24, 25, 26] },
    { label: '両足の足先', indices: [27, 28, 29, 30, 31, 32] },
  ];
  const missing = groups
    .filter(
      ({ indices }) =>
        !indices.every((index) => {
          const point = points[index];
          return (
            point &&
            (point.visibility ?? 0) >= 0.65 &&
            point.x > 0.03 &&
            point.x < 0.97 &&
            point.y > 0.05 &&
            point.y < 0.95
          );
        }),
    )
    .map(({ label }) => label);
  return missing.length
    ? `${missing.join('・')}を確認できていません。写真の端に余白がある、全身の写った写真を試してください。この写真のままでも使えます。`
    : '全身を確認できました。';
}

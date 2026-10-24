import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { extractPersonOutline } from '../image-processing/extractContour';
import { isFullBody } from './capture';
import type { CapturedPerson } from './capture';

export async function analyzePhoto(
  photo: CapturedPerson,
): Promise<CapturedPerson> {
  const files = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
  );
  const segmenter = await ImageSegmenter.createFromOptions(files, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
    },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  try {
    const scale = Math.min(1, 512 / Math.max(photo.width, photo.height));
    const bitmap = await createImageBitmap(photo.blob, {
      resizeWidth: Math.max(1, Math.round(photo.width * scale)),
      resizeHeight: Math.max(1, Math.round(photo.height * scale)),
    });
    try {
      const result = segmenter.segment(bitmap);
      let outline;
      try {
        const mask = result.confidenceMasks?.[0];
        outline = mask
          ? extractPersonOutline(
              mask.getAsFloat32Array(),
              mask.width,
              mask.height,
            )
          : null;
      } finally {
        result.close();
      }
      if (!outline)
        return {
          ...photo,
          bodyStatus: 'unknown',
          outline: undefined,
          recognitionMessage:
            '身体の縁を見つけられませんでした。背景と身体の違いが分かりやすい写真を選ぶか、もう一度判定してください。',
        };
      // Pose only labels the optional full-body badge; it never blocks a usable silhouette.
      let full = false;
      if (!outline.touchesEdge) {
        try {
          const { createPoseDetector } = await import('./poseDetector');
          const detector = await createPoseDetector();
          try {
            full = isFullBody(detector.detect(bitmap).landmarks[0] ?? []);
          } finally {
            detector.close();
          }
        } catch {
          /* The silhouette remains usable without pose landmarks. */
        }
      }
      return {
        ...photo,
        outline,
        bodyStatus: full ? 'full_body' : 'clipped',
        recognitionMessage: outline.touchesEdge
          ? '写真の端に沿って直線で閉じました。黄色い線がコースの輪郭イメージです。'
          : '身体の縁を黄色い線で表示しました。上半身だけでも、この形を使えます。',
      };
    } finally {
      bitmap.close();
    }
  } finally {
    segmenter.close();
  }
}

import { closeSmallMaskGaps } from '../image-processing/cleanPersonMask';
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { extractOuterContour } from '../image-processing/extractContour';
import { orderFromStart } from '../image-processing/normalizeContour';
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
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
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
      let binaryMask;
      try {
        const mask = result.confidenceMasks?.[0];
        if (!mask) throw new Error('人物マスクを取得できませんでした。');
        // Multiclass index 0 is background. Union of hair, skin, face, clothes and accessories.
        const foreground = Uint8Array.from(
          mask.getAsFloat32Array(),
          (background) =>
            Number.isFinite(background) && 1 - background >= 0.4 ? 1 : 0,
        );
        const data = closeSmallMaskGaps(foreground, mask.width, mask.height);
        binaryMask = { data, width: mask.width, height: mask.height };
        const pixels = extractOuterContour(data, mask.width, mask.height);
        // START（最も上・同じ高さなら最も右）を先頭に、反時計回りへそろえる（#7）。
        // ここでそろえると、平滑化・等間隔化・色の取得もSTARTから同じ向きになる。
        const points = orderFromStart(
          pixels.map((p) => ({
            x: p.x / mask.width,
            y: p.y / mask.height,
          })),
        );
        outline = {
          points,
          touchesEdge: points.some(
            (p) => p.x === 0 || p.x === 1 || p.y === 0 || p.y === 1,
          ),
        };
      } catch (cause) {
        return {
          ...photo,
          outline: undefined,
          binaryMask,
          bodyStatus: 'unknown',
          recognitionMessage:
            cause instanceof Error
              ? cause.message
              : '輪郭が不正です。別の写真を選んでください。',
        };
      } finally {
        result.close();
      }
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
        binaryMask,
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

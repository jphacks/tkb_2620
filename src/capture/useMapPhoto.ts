import { useEffect, useState } from 'react';
import type { CapturedPerson } from './capture';
import { maskMapPhoto } from './mapPhoto';
import {
  gameTransform,
  DEFAULT_COURSE_SIZE,
} from '../image-processing/generateCourse';
export type MapPhoto = {
  url: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
};

/** Ephemeral, masked preview only. Never added to CourseData or storage. */
export function useMapPhoto(
  photo: CapturedPerson | null | undefined,
): MapPhoto | null {
  const [preview, setPreview] = useState<{
    photo: CapturedPerson;
    image: MapPhoto;
  } | null>(null);
  useEffect(() => {
    if (!photo?.binaryMask || !photo.curveCorrection?.contour) return;
    let cancelled = false,
      url: string | undefined;
    const source = photo;
    async function prepare() {
      const bitmap = await createImageBitmap(source.blob);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 512 / Math.max(source.width, source.height));
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        maskMapPhoto(
          pixels.data,
          canvas.width,
          canvas.height,
          source.binaryMask!,
        );
        context.putImageData(pixels, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png'),
        );
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        const contour = source.curveCorrection!.contour;
        const transform = gameTransform(contour.points, DEFAULT_COURSE_SIZE);
        const mpp = contour.metersPerPixel ?? 1;
        setPreview({
          photo: source,
          image: {
            url,
            from: transform({ x: 0, y: 0 }),
            to: transform({ x: source.width * mpp, y: source.height * mpp }),
          },
        });
      } finally {
        bitmap.close();
      }
    }
    void prepare().catch(() => {
      /* Optional preview: keep the outline on decode failure. */
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);
  return photo && preview?.photo === photo ? preview.image : null;
}

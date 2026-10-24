import { useEffect, useState } from 'react';
import type { CapturedPerson } from './capture';
import type { ColorExtraction } from '../image-processing/extractColors';
import { readPhotoColors } from './photoColors';

export function usePhotoColors(photo: CapturedPerson | null) {
  const [completed, setCompleted] = useState<{
    photo: CapturedPerson;
    result: ColorExtraction | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!photo?.outline || !photo.binaryMask) return;
    let cancelled = false;
    const source = photo;
    async function extract() {
      try {
        const result = await readPhotoColors(source);
        if (!cancelled) setCompleted({ photo: source, result, error: '' });
      } catch (cause) {
        if (!cancelled)
          setCompleted({
            photo: source,
            result: null,
            error:
              cause instanceof Error
                ? cause.message
                : '写真の色を読み取れませんでした。もう一度判定してください。',
          });
      }
    }
    void extract();
    return () => {
      cancelled = true;
    };
  }, [photo]);
  const current = completed?.photo === photo ? completed : null;
  return {
    result: current?.result ?? null,
    error: current?.error ?? '',
    busy: Boolean(photo?.outline && photo.binaryMask && !current),
  };
}

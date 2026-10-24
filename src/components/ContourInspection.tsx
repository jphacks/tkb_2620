import {
  smoothPreviewContour,
  previewContourPath,
} from '../image-processing/previewContour';
import { useEffect, useRef, useState } from 'react';
import type { CapturedPerson } from '../capture/capture';
import { extractOuterContour } from '../image-processing/extractContour';
import type {
  BinaryPersonMask,
  OutlinePoint,
} from '../image-processing/extractContour';

function sampleMask(clipped: boolean): BinaryPersonMask {
  const width = 80,
    height = 100,
    data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const head = (x - 40) ** 2 + (y - 16) ** 2 < 11 ** 2;
      const body = x >= 29 && x < 51 && y >= 27 && y < 66;
      const arms = y >= 32 && y < 43 && x >= 8 && x < 72;
      const legs =
        y >= 60 &&
        y < (clipped ? 100 : 94) &&
        ((x >= 28 && x < 38) || (x >= 43 && x < 53));
      data[y * width + x] = head || body || arms || legs ? 1 : 0;
    }
  data[2 * width + 2] = 1;
  data[48 * width + 40] = 0;
  return { data, width, height };
}
function InspectionCanvas({
  mask,
  points,
  blob,
  mode,
}: {
  mask: BinaryPersonMask;
  points: OutlinePoint[];
  blob?: Blob;
  mode: 'photo' | 'mask' | 'outline';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const element = canvas.current;
      if (!element) return;
      const context = element.getContext('2d');
      if (!context) return;
      element.width = mask.width;
      element.height = mask.height;
      context.fillStyle = '#17251e';
      context.fillRect(0, 0, mask.width, mask.height);
      if (mode === 'photo' && blob) {
        try {
          const bitmap = await createImageBitmap(blob);
          try {
            if (cancelled) return;
            context.drawImage(bitmap, 0, 0, mask.width, mask.height);
          } finally {
            bitmap.close();
          }
        } catch {
          if (cancelled) return;
          context.fillStyle = '#eee';
          context.fillText('画像を表示できません', 8, 20);
        }
      }
      if (cancelled) return;
      if (mode === 'mask' || (mode === 'photo' && !blob)) {
        const pixels = context.createImageData(mask.width, mask.height);
        for (let i = 0; i < mask.data.length; i++) {
          const value = mask.data[i] ? 255 : 0;
          pixels.data.set([value, value, value, 255], i * 4);
        }
        context.putImageData(pixels, 0, 0);
      }
      if (mode !== 'mask' && points.length) {
        const smooth = smoothPreviewContour(points, mask.width, mask.height);
        const path = new Path2D(
          previewContourPath(smooth, mask.width, mask.height),
        );
        context.strokeStyle = '#ffe229';
        context.lineWidth = Math.max(1, mask.width / 100);
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke(path);
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [mask, points, blob, mode]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={
        mode === 'mask'
          ? '人物二値マスク。白が人物、黒が背景'
          : mode === 'outline'
            ? '抽出した閉じた外周輪郭'
            : '写真と抽出輪郭の重ね合わせ'
      }
    />
  );
}
export function ContourInspection({ photo }: { photo: CapturedPerson | null }) {
  const [sample, setSample] = useState(false);
  const [clipped, setClipped] = useState(true);
  const usePhoto = photo?.binaryMask && !sample;
  const mask = usePhoto ? photo.binaryMask! : sampleMask(clipped);
  let points: OutlinePoint[] = [],
    error = '';
  try {
    points =
      usePhoto && photo.outline
        ? photo.outline.points
        : extractOuterContour(mask.data, mask.width, mask.height).map((p) => ({
            x: p.x / mask.width,
            y: p.y / mask.height,
          }));
  } catch (cause) {
    error = cause instanceof Error ? cause.message : '輪郭を抽出できません';
  }
  return (
    <details className="card contour-inspection">
      <summary>輪郭の検証（マスク・外周・サンプル）</summary>
      <p>
        白い領域から最大のつながった領域だけを選び、外周を閉じた点列として取り出します。内部の穴と孤立したノイズは輪郭に含めません。
      </p>
      <label>
        <input
          type="checkbox"
          checked={sample || !photo?.binaryMask}
          disabled={!photo?.binaryMask}
          onChange={(e) => setSample(e.target.checked)}
        />{' '}
        サンプルの人型を使う
      </label>
      {!usePhoto && (
        <label>
          <input
            type="checkbox"
            checked={clipped}
            onChange={(e) => setClipped(e.target.checked)}
          />{' '}
          足が写真の端で見切れる例
        </label>
      )}
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p>
          {points.length}点・閉じた外周。画像座標は{xLabel(mask)}
          。黄色い線は表示用に丸めた外周です。抽出した元の点列は保持しています。
        </p>
      )}
      <div className="contour-grid">
        {(['photo', 'mask', 'outline'] as const).map((mode) => (
          <figure key={mode}>
            <figcaption>
              {mode === 'photo'
                ? '写真＋外周'
                : mode === 'mask'
                  ? '人物二値マスク'
                  : '外周のみ（内部の穴なし）'}
            </figcaption>
            <InspectionCanvas
              mask={mask}
              points={points}
              blob={usePhoto ? photo.blob : undefined}
              mode={mode}
            />
          </figure>
        ))}
      </div>
      <p>
        表示用の線だけを滑らかにしています。元の輪郭点と道路への変換処理は分けています。確認用の輪郭は画像の左上が原点で、右が+x、下が+yです。
      </p>
    </details>
  );
}
function xLabel(mask: BinaryPersonMask) {
  return `${mask.width}×${mask.height}px`;
}

import { resamplePhotoContour } from '../image-processing/resampleContour';
import type {
  ResamplingOptions,
  ResampledContour,
} from '../image-processing/resampleContour';
import type { SmoothingOptions } from '../image-processing/previewContour';
import {
  smoothClosedContour,
  previewContourPath,
} from '../image-processing/previewContour';
import {
  correctSharpCurves,
  DEFAULT_CURVE_CORRECTION,
} from '../image-processing/correctCurves';
import type { CurveCorrectionResult } from '../image-processing/correctCurves';
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
  sharp = [],
}: {
  mask: BinaryPersonMask;
  points: OutlinePoint[];
  blob?: Blob;
  mode:
    | 'photo'
    | 'mask'
    | 'outline'
    | 'original'
    | 'resampled'
    | 'curvesBefore'
    | 'curvesAfter';
  /** Indices of points drawn in red as sharp curves. */
  sharp?: number[];
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
        const path = new Path2D(
          mode === 'original' ||
            mode === 'resampled' ||
            mode === 'curvesBefore' ||
            mode === 'curvesAfter'
            ? points
                .map(
                  (p, i) =>
                    `${i ? 'L' : 'M'} ${p.x * mask.width} ${p.y * mask.height}`,
                )
                .join(' ') + ' Z'
            : previewContourPath(points, mask.width, mask.height),
        );
        context.strokeStyle = '#ffe229';
        context.lineWidth = Math.max(1, mask.width / 100);
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.stroke(path);
        if (mode === 'resampled') {
          context.fillStyle = '#ff735e';
          for (const p of points) {
            context.beginPath();
            context.arc(
              p.x * mask.width,
              p.y * mask.height,
              Math.max(0.55, mask.width / 230),
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }
        if (mode === 'curvesBefore' || mode === 'curvesAfter') {
          context.fillStyle = '#ff2d2d';
          for (const index of sharp) {
            const p = points[index];
            if (!p) continue;
            context.beginPath();
            context.arc(
              p.x * mask.width,
              p.y * mask.height,
              Math.max(1, mask.width / 120),
              0,
              Math.PI * 2,
            );
            context.fill();
          }
        }
      }
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [mask, points, blob, mode, sharp]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={
        mode === 'mask'
          ? '人物二値マスク。白が人物、黒が背景'
          : mode === 'resampled'
            ? '等間隔に配置した輪郭点'
            : mode === 'curvesBefore'
              ? '急カーブ補正前の輪郭。赤い点が半径の小さい急カーブ'
              : mode === 'curvesAfter'
                ? '急カーブ補正後の輪郭。赤い点は補正しきれなかった急カーブ'
                : mode === 'original'
                  ? '平滑化前の輪郭'
                  : mode === 'outline'
                    ? '平滑化後の輪郭'
                    : '写真と抽出輪郭の重ね合わせ'
      }
    />
  );
}
export function ContourInspection({
  photo,
  smoothing,
  onSmoothingChange,
  resampling,
  onResamplingChange,
}: {
  photo: CapturedPerson | null;
  smoothing: SmoothingOptions;
  resampling: ResamplingOptions;
  onResamplingChange: (options: ResamplingOptions) => void;
  onSmoothingChange: (options: SmoothingOptions) => void;
}) {
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
  const smoothed =
    !error && points.length
      ? smoothClosedContour(points, mask.width, mask.height, smoothing)
      : null;
  const width = usePhoto ? photo.width : mask.width,
    height = usePhoto ? photo.height : mask.height;
  let sampled: ResampledContour | null = null,
    sampleError = '';
  if (smoothed)
    try {
      sampled = resamplePhotoContour(
        smoothed.points,
        width,
        height,
        resampling,
      );
    } catch (cause) {
      sampleError =
        cause instanceof Error ? cause.message : '等間隔化に失敗しました。';
    }
  const toNormalized = (p: OutlinePoint) => ({
    x: p.x / (width * resampling.metersPerPixel),
    y: p.y / (height * resampling.metersPerPixel),
  });
  const normalizedSamples = sampled?.points.map(toNormalized) ?? [];
  let corrected: CurveCorrectionResult | null = null,
    correctionError = '';
  if (sampled)
    try {
      corrected = correctSharpCurves(sampled);
    } catch (cause) {
      correctionError =
        cause instanceof Error ? cause.message : '急カーブを補正できません。';
    }
  const normalizedCorrected = corrected?.contour.points.map(toNormalized) ?? [];
  return (
    <details className="card contour-inspection">
      <summary>輪郭の検証・平滑化の調整</summary>
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
      <div className="smoothing-controls">
        <label>
          平滑化の強さ：{smoothing.strength.toFixed(2)}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={smoothing.strength}
            onChange={(e) =>
              onSmoothingChange({
                ...smoothing,
                strength: Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          繰り返し回数：{smoothing.iterations}
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={smoothing.iterations}
            onChange={(e) =>
              onSmoothingChange({
                ...smoothing,
                iterations: Number(e.target.value),
              })
            }
          />
        </label>
        <button
          onClick={() => onSmoothingChange({ iterations: 3, strength: 0.4 })}
        >
          初期値に戻す
        </button>
      </div>
      <p>
        元の輪郭 {points.length}点 → 平滑化後 {smoothed?.points.length ?? 0}
        点・適用 {smoothed?.iterationsApplied ?? 0}
        回。設定を変えたら「この写真を使う」で確定してください。
      </p>
      {smoothed?.warning && <p role="status">{smoothed.warning}</p>}
      <div className="smoothing-controls">
        <label>
          点間隔：{resampling.spacing.toFixed(1)}m
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={resampling.spacing}
            onChange={(e) =>
              onResamplingChange({
                ...resampling,
                spacing: Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          変換倍率：1px = {resampling.metersPerPixel.toFixed(3)}m
          <input
            type="range"
            min="0.005"
            max="0.2"
            step="0.005"
            value={resampling.metersPerPixel}
            onChange={(e) =>
              onResamplingChange({
                ...resampling,
                metersPerPixel: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <p>
        倍率は読み込み後の写真（{width}×{height}
        px）に対する仮の設定です。実際の身体の寸法を推定するものではありません。
      </p>
      {sampleError && <p role="alert">{sampleError}</p>}
      {sampled && (
        <p role="status">
          一周 {sampled.totalLength.toFixed(2)}m・{sampled.points.length}
          点・実際の弧長間隔 {sampled.actualSpacing.toFixed(3)}
          m。赤い点が等間隔の位置です。最後から最初まで同じ間隔でつながります。
        </p>
      )}
      {correctionError && <p role="alert">{correctionError}</p>}
      {corrected && (
        <>
          <p role="status">
            急カーブ（3点を通る円の半径
            {DEFAULT_CURVE_CORRECTION.minTurnRadius}m未満）：補正前{' '}
            {corrected.before.sharp.length}点（最小半径
            {formatRadius(corrected.before.minRadius)}）→ 補正後{' '}
            {corrected.after.sharp.length}点（最小半径
            {formatRadius(corrected.after.minRadius)}）。補正
            {corrected.iterationsApplied}回・最大移動
            {corrected.maxShift.toFixed(2)}m（上限
            {DEFAULT_CURVE_CORRECTION.maxDisplacement}m）。
          </p>
          {corrected.warning && <p role="alert">{corrected.warning}</p>}
        </>
      )}
      <div className="contour-grid">
        {(
          [
            'photo',
            'mask',
            'original',
            'outline',
            'resampled',
            'curvesBefore',
            'curvesAfter',
          ] as const
        ).map((mode) => (
          <figure key={mode}>
            <figcaption>
              {mode === 'photo'
                ? '写真＋外周'
                : mode === 'mask'
                  ? '人物二値マスク'
                  : mode === 'original'
                    ? '平滑化前（元の輪郭）'
                    : mode === 'resampled'
                      ? '等間隔に配置した点'
                      : mode === 'curvesBefore'
                        ? '急カーブ補正前（赤：急カーブ）'
                        : mode === 'curvesAfter'
                          ? '急カーブ補正後（赤：残った急カーブ）'
                          : '平滑化後'}
            </figcaption>
            <InspectionCanvas
              mask={mask}
              points={
                mode === 'resampled' || mode === 'curvesBefore'
                  ? normalizedSamples
                  : mode === 'curvesAfter'
                    ? normalizedCorrected
                    : mode === 'original' || mode === 'mask'
                      ? points
                      : (smoothed?.points ?? [])
              }
              blob={usePhoto ? photo.blob : undefined}
              mode={mode}
              sharp={
                mode === 'curvesBefore'
                  ? corrected?.before.sharp
                  : mode === 'curvesAfter'
                    ? corrected?.after.sharp
                    : undefined
              }
            />
          </figure>
        ))}
      </div>
      <p>
        元の輪郭と平滑化後の点列を両方保持します。道路への変換・カーブ半径の保証は次の処理で行います。確認用の輪郭は画像の左上が原点で、右が+x、下が+yです。
      </p>
    </details>
  );
}
function formatRadius(radius: number) {
  return Number.isFinite(radius) ? `${radius.toFixed(2)}m` : '直線';
}
function xLabel(mask: BinaryPersonMask) {
  return `${mask.width}×${mask.height}px`;
}

import { useEffect, useRef, useState } from 'react';
import type { CapturedPerson } from '../capture/capture';
import { extractRepresentativeColors } from '../image-processing/extractColors';
import type { ColorExtraction } from '../image-processing/extractColors';
import type { OutlinePoint } from '../image-processing/extractContour';
export type PhotoColorResult = { blob: Blob; result: ColorExtraction } | null;
const cssColor = (color: number[]) => `rgb(${color.join(',')})`;

export function PersonColors({
  photo,
  onResult,
  onSettingsChange,
}: {
  photo: CapturedPerson | null;
  onResult: (value: PhotoColorResult) => void;
  onSettingsChange: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sample, setSample] = useState(false);
  const [segments, setSegments] = useState(16);
  const [offsetScale, setOffsetScale] = useState(1);
  const [result, setResult] = useState<ColorExtraction | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const useReal = !!photo && !sample;
  useEffect(() => {
    let cancelled = false;
    async function extract() {
      setBusy(true);
      setError('');
      setResult(null);
      onResult(null);
      try {
        const surface = document.createElement('canvas');
        const ctx = surface.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('画像を読み込めませんでした。');
        let points: OutlinePoint[];
        let mask;
        if (useReal && photo) {
          if (!photo.outline || !photo.binaryMask)
            throw new Error(
              '先に写真の「もう一度判定する」で輪郭を取得してください。',
            );
          const bitmap = await createImageBitmap(photo.blob);
          try {
            if (cancelled) return;
            surface.width = photo.width;
            surface.height = photo.height;
            ctx.drawImage(bitmap, 0, 0);
          } finally {
            bitmap.close();
          }
          points = photo.outline.points.map((p) => ({
            x: p.x * photo.width,
            y: p.y * photo.height,
          }));
          mask = photo.binaryMask;
        } else {
          surface.width = 320;
          surface.height = 400;
          points = [
            { x: 135, y: 20 },
            { x: 185, y: 20 },
            { x: 195, y: 85 },
            { x: 270, y: 110 },
            { x: 285, y: 145 },
            { x: 205, y: 125 },
            { x: 205, y: 240 },
            { x: 225, y: 375 },
            { x: 175, y: 375 },
            { x: 160, y: 260 },
            { x: 145, y: 375 },
            { x: 95, y: 375 },
            { x: 115, y: 240 },
            { x: 115, y: 125 },
            { x: 35, y: 145 },
            { x: 50, y: 110 },
            { x: 125, y: 85 },
          ];
          const path = new Path2D(
            points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') +
              ' Z',
          );
          ctx.fillStyle = 'white';
          ctx.fill(path);
          mask = {
            width: 320,
            height: 400,
            data: Uint8Array.from(
              ctx
                .getImageData(0, 0, 320, 400)
                .data.filter((_, i) => i % 4 === 3),
              (v) => (v > 128 ? 1 : 0),
            ),
          };
          ctx.save();
          ctx.clip(path);
          for (const [y, h, color] of [
            [0, 55, '#30282c'],
            [55, 100, '#dca17f'],
            [155, 95, '#b73545'],
            [250, 150, '#304c80'],
          ] as const) {
            ctx.fillStyle = color;
            ctx.fillRect(0, y, 320, h);
          }
          ctx.restore();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#e9eee6';
          ctx.fillRect(0, 0, 320, 400);
          ctx.globalCompositeOperation = 'source-over';
        }
        const extracted = extractRepresentativeColors(
          ctx.getImageData(0, 0, surface.width, surface.height),
          mask,
          points,
          {
            segmentCount: segments,
            inwardOffsets: [3, 6, 10].map((v) => v * offsetScale),
          },
        );
        if (cancelled) return;
        const target = canvas.current;
        if (target) {
          target.width = surface.width;
          target.height = surface.height;
          const draw = target.getContext('2d');
          if (draw) {
            draw.drawImage(surface, 0, 0);
            draw.strokeStyle = '#ffe229';
            draw.lineWidth = surface.width / 180;
            draw.beginPath();
            points.forEach((p, i) =>
              i ? draw.lineTo(p.x, p.y) : draw.moveTo(p.x, p.y),
            );
            draw.closePath();
            draw.stroke();
            for (const probe of extracted.probes) {
              draw.beginPath();
              draw.arc(
                probe.x,
                probe.y,
                Math.max(2, surface.width / 180),
                0,
                Math.PI * 2,
              );
              draw.fillStyle = '#00e5ff';
              draw.fill();
            }
          }
        }
        setResult(extracted);
        if (useReal && photo) onResult({ blob: photo.blob, result: extracted });
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : '色の取得に失敗しました。',
          );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void extract();
    return () => {
      cancelled = true;
    };
  }, [photo, useReal, segments, offsetScale, onResult]);
  return (
    <section className="card person-colors">
      <h2>人物の色を取り出す</h2>
      <p>
        黄色が元の輪郭、水色の点が実際に色を取得した場所です。背景を除き、輪郭に沿った各区間の代表色を並べます。
      </p>
      <div className="smoothing-controls">
        <label>
          <input
            type="checkbox"
            checked={!useReal}
            disabled={!photo}
            onChange={(e) => setSample(e.target.checked)}
          />
          サンプルの配色を試す
        </label>
        <label>
          色の区間数：{segments}
          <input
            type="range"
            min="4"
            max="32"
            step="1"
            value={segments}
            onChange={(e) => {
              setSegments(Number(e.target.value));
              onSettingsChange();
            }}
          />
        </label>
        <label>
          内側への距離：
          {[3, 6, 10].map((v) => (v * offsetScale).toFixed(1)).join(' / ')}px
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.5"
            value={offsetScale}
            onChange={(e) => {
              setOffsetScale(Number(e.target.value));
              onSettingsChange();
            }}
          />
        </label>
      </div>
      <p>
        距離は読み込み後の写真のピクセル単位です。色を変えたら「この写真を使う」で再確定してください。
      </p>
      {busy && <p role="status">人物の内側から色を取得しています…</p>}
      {error && <p role="alert">{error}</p>}
      <canvas
        ref={canvas}
        hidden={busy || !!error}
        role="img"
        aria-label="元画像の人物輪郭と色の取得位置"
      />
      {result && !busy && (
        <>
          <p role="status">
            {result.colorSamples.length}区間・有効な取得位置{' '}
            {result.probes.length}点
          </p>
          <div className="color-palette">
            {result.colorSamples.map((sample, i) => (
              <div key={i}>
                <span
                  style={{ background: cssColor(sample.color) }}
                  aria-label={`区間${i + 1}の代表色 RGB ${sample.color.join(',')}`}
                />
                <small>
                  {i + 1}
                  {sample.interpolated ? '（補完）' : ''}
                  <br />
                  {sample.color.join(', ')}
                </small>
              </div>
            ))}
          </div>
          {result.warnings.map((warning) => (
            <p role="status" key={warning}>
              {warning}
            </p>
          ))}
        </>
      )}
      <p>
        この段階では色の取得までです。補正後コースへの割り当ては次のIssueで行います。
      </p>
    </section>
  );
}

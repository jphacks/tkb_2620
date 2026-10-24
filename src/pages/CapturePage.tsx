import { PersonColors } from '../components/PersonColors';
import type { PhotoColorResult } from '../components/PersonColors';
import {
  DEFAULT_RESAMPLING,
  resamplePhotoContour,
} from '../image-processing/resampleContour';
import type { ResamplingOptions } from '../image-processing/resampleContour';
import { correctSharpCurves } from '../image-processing/correctCurves';
import { mapCourseColors } from '../image-processing/mapCourseColors';
import {
  smoothClosedContour,
  DEFAULT_SMOOTHING,
  previewContourPath,
} from '../image-processing/previewContour';
import type { SmoothingOptions } from '../image-processing/previewContour';
import { ContourInspection } from '../components/ContourInspection';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CapturedPerson } from '../capture/capture';
import { readPhoto } from '../capture/capture';

type Props = {
  captured: CapturedPerson | null;
  onConfirm: (image: CapturedPerson | null) => void;
};

export default function CapturePage({ captured, onConfirm }: Props) {
  const [colorResult, setColorResult] = useState<PhotoColorResult>(
    captured?.colorExtraction
      ? { blob: captured.blob, result: captured.colorExtraction }
      : null,
  );
  const [photo, setPhoto] = useState<CapturedPerson | null>(captured);
  const [smoothing, setSmoothing] = useState<SmoothingOptions>(
    captured?.smoothingOptions ?? DEFAULT_SMOOTHING,
  );
  const smoothed = useMemo(
    () =>
      photo?.outline
        ? smoothClosedContour(
            photo.outline.points,
            photo.width,
            photo.height,
            smoothing,
          )
        : null,
    [photo, smoothing],
  );
  const displayOutline = smoothed?.points ?? [];
  const [resampling, setResampling] = useState<ResamplingOptions>(
    captured?.resamplingOptions ?? DEFAULT_RESAMPLING,
  );
  const resampled = useMemo(() => {
    if (!photo || !smoothed) return { result: null, error: '' };
    try {
      return {
        result: resamplePhotoContour(
          smoothed.points,
          photo.width,
          photo.height,
          resampling,
        ),
        error: '',
      };
    } catch (cause) {
      return {
        result: null,
        error:
          cause instanceof Error ? cause.message : '等間隔化に失敗しました。',
      };
    }
  }, [photo, smoothed, resampling]);
  const curveCorrection = useMemo(() => {
    if (!resampled.result) return null;
    try {
      return correctSharpCurves(resampled.result);
    } catch {
      return null;
    }
  }, [resampled]);
  const photoColors =
    photo && colorResult?.blob === photo.blob ? colorResult.result : null;
  const courseColors = useMemo(() => {
    if (!photo?.outline || !photoColors || !curveCorrection) return null;
    try {
      return mapCourseColors(
        photoColors.colorSamples,
        curveCorrection.contour.points,
        photo.outline.points.map((p) => ({
          x: p.x * photo.width * resampling.metersPerPixel,
          y: p.y * photo.height * resampling.metersPerPixel,
        })),
      );
    } catch {
      return null;
    }
  }, [photo, photoColors, curveCorrection, resampling]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const image = useRef<HTMLImageElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.blob);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function selectPhoto(file: File) {
    const token = ++generation.current;
    setError('');
    setBusy(true);
    setPhoto(null);
    onConfirm(null);
    try {
      const selected = await readPhoto(file);
      if (token !== generation.current) return;
      setPhoto(selected);
      try {
        const { analyzePhoto } = await import('../capture/analyzePhoto');
        if (token !== generation.current) return;
        const result = await analyzePhoto(selected);
        if (token !== generation.current) return;
        setPhoto(result);
      } catch {
        if (token === generation.current)
          setPhoto({
            ...selected,
            recognitionMessage:
              '身体の輪郭を読み取れませんでした。通信環境を確認して再判定するか、別の写真を選んでください。',
          });
      }
    } catch (cause) {
      if (token === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : '写真を読み込めませんでした。',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }

  return (
    <section className="capture-page">
      <p className="eyebrow">STEP 01 · PHOTO</p>
      <h1>写真のポーズが、道になる。</h1>
      <p>
        ひとりの人物写真を選んでください。全身でも、上半身だけでもOK。身体の縁を黄色い線で表示し、見切れた部分は写真の端に沿って直線でつなぎます。
      </p>
      <div className="capture-frame" aria-busy={busy}>
        {photo ? (
          <>
            <div
              className="outline-photo"
              style={{
                aspectRatio: `${photo.width} / ${photo.height}`,
                maxWidth: `min(100%, ${(65 * photo.width) / photo.height}vh)`,
              }}
            >
              <img ref={image} alt="選択した人物の写真" />
              {photo.outline && !busy && (
                <svg
                  className="person-outline"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="認識した身体の輪郭。見切れた部分は写真の端に沿って閉じています。"
                >
                  <path
                    d={previewContourPath(displayOutline)}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              {photo.outline && !busy && displayOutline[0] && (
                <span
                  className="start-marker"
                  style={{
                    left: `${displayOutline[0].x * 100}%`,
                    top: `${displayOutline[0].y * 100}%`,
                  }}
                  role="img"
                  aria-label="START地点"
                >
                  <span>START</span>
                </span>
              )}
            </div>
            <span className="capture-badge">
              {busy
                ? '身体の縁を読み取り中…'
                : photo.bodyStatus === 'full_body'
                  ? '全身○'
                  : photo.outline
                    ? '上半身・見切れOK'
                    : '輪郭を確認できません'}
            </span>
          </>
        ) : (
          <div className="capture-placeholder">
            <span aria-hidden="true">◎</span>
            <p>
              {busy
                ? '写真を読み込んでいます…'
                : '全身・上半身、お好きなポーズの写真を選ぼう。'}
            </p>
            <small>JPEG・PNG・WebPなど、20MBまで</small>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {busy ? (
          <p>
            写真から身体の縁を読み取っています。初回は認識モデルの読み込みに時間がかかります。
          </p>
        ) : (
          photo?.recognitionMessage && <p>{photo.recognitionMessage}</p>
        )}
      </div>
      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="人物の写真を選択"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void selectPhoto(file);
        }}
      />
      <div className="capture-actions">
        <button
          className={!photo ? 'capture-primary' : ''}
          onClick={() => input.current?.click()}
        >
          {photo ? '別の写真を選ぶ' : '写真を選ぶ'}
        </button>
        {busy && (
          <button
            onClick={() => {
              generation.current++;
              setBusy(false);
              setPhoto(null);
            }}
          >
            キャンセル
          </button>
        )}
        {!busy && photo && (
          <>
            <button
              onClick={() =>
                void selectPhoto(
                  new File([photo.blob], 'photo.png', { type: 'image/png' }),
                )
              }
            >
              もう一度判定する
            </button>
            <button
              className="capture-primary"
              disabled={
                !photo.outline ||
                !resampled.result ||
                colorResult?.blob !== photo.blob
              }
              onClick={() =>
                onConfirm({
                  ...photo,
                  colorExtraction:
                    colorResult?.blob === photo.blob
                      ? colorResult.result
                      : undefined,
                  smoothedOutline:
                    photo.outline && smoothed
                      ? { ...photo.outline, points: smoothed.points }
                      : undefined,
                  smoothingOptions: { ...smoothing },
                  resampledContour: resampled.result ?? undefined,
                  curveCorrection: curveCorrection ?? undefined,
                  courseColors: courseColors ?? undefined,
                  resamplingOptions: { ...resampling },
                })
              }
            >
              この写真を使う
            </button>
          </>
        )}
      </div>
      {captured && !busy && (
        <p className="capture-confirmed" role="status">
          写真を選択しました。画像と輪郭を保持しました。黄色い線がコースの形のイメージです。実際の道路への変換は次のステップで追加します。
        </p>
      )}
      {smoothed?.warning && <p role="status">{smoothed.warning}</p>}
      {resampled.error && <p role="alert">{resampled.error}</p>}
      <PersonColors
        photo={photo}
        onResult={setColorResult}
        onSettingsChange={() => onConfirm(null)}
      />
      <ContourInspection
        photo={photo}
        colorExtraction={photoColors}
        smoothing={smoothing}
        resampling={resampling}
        onResamplingChange={(options) => {
          setResampling(options);
          onConfirm(null);
        }}
        onSmoothingChange={(options) => {
          setSmoothing(options);
          onConfirm(null);
        }}
      />
      <p className="capture-note">
        写真はブラウザ内で処理し、サーバーには送信しません。黄色い線は推定した身体の外周です。内側の穴や、離れた小さな領域は含めません。写真はひとりで写ったものを選んでください。初回の認識にはインターネット接続が必要です。HEIC形式を読み込めない場合はJPEGに変換してください。
      </p>
    </section>
  );
}

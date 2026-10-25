import { TruckRoad } from '../components/TruckRoad';
import { usePhotoColors } from '../capture/usePhotoColors';
import {
  DEFAULT_RESAMPLING,
  resamplePhotoContour,
} from '../image-processing/resampleContour';
import { correctSharpCurves } from '../image-processing/correctCurves';
import { mapCourseColors } from '../image-processing/mapCourseColors';
import {
  smoothClosedContour,
  DEFAULT_SMOOTHING,
  previewContourPath,
} from '../image-processing/previewContour';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CapturedPerson } from '../capture/capture';
import { readPhoto } from '../capture/capture';

type Props = {
  captured: CapturedPerson | null;
  onConfirm: (image: CapturedPerson | null) => void;
  /** 写真・コースの処理に失敗して戻ってきたときの説明（#22） */
  notice?: string;
};

export default function CapturePage({ captured, onConfirm, notice }: Props) {
  const [photo, setPhoto] = useState<CapturedPerson | null>(captured);
  const colors = usePhotoColors(photo);
  const smoothing = DEFAULT_SMOOTHING;
  const resampling = DEFAULT_RESAMPLING;
  // 輪郭を作れなかったときは画面を止めず、理由を出して写真を選び直してもらう（#22）
  const outlineResult = useMemo(() => {
    if (!photo?.outline) return { result: null, error: '' };
    try {
      return {
        result: smoothClosedContour(
          photo.outline.points,
          photo.width,
          photo.height,
          smoothing,
        ),
        error: '',
      };
    } catch (cause) {
      return {
        result: null,
        error:
          cause instanceof Error
            ? `輪郭を作れませんでした：${cause.message}`
            : '輪郭を作れませんでした。別の写真を選んでください。',
      };
    }
  }, [photo, smoothing]);
  const smoothed = outlineResult.result;
  const displayOutline = smoothed?.points ?? [];
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
  const photoColors = colors.result;
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
  // 読み込み中のトラックの進み具合に使う段階（写真を開く → 体の形を読み取る）
  const [stage, setStage] = useState<'reading' | 'analyzing'>('reading');
  // 写真を選び直したら、トラックをスタートに戻す
  const [run, setRun] = useState(0);
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
    setStage('reading');
    setRun((n) => n + 1);
    setPhoto(null);
    onConfirm(null);
    try {
      const selected = await readPhoto(file);
      if (token !== generation.current) return;
      setPhoto(selected);
      setStage('analyzing');
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
      <p className="eyebrow">新規受付 1/2</p>
      <h1>写真をお預かりします</h1>
      {notice && (
        <p className="capture-notice" role="alert">
          {notice}
        </p>
      )}
      <div className="capture-slip-head" aria-hidden="true">
        <span>集荷票</span>
        <span>人物写真 1枚</span>
      </div>
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
            <svg
              className="capture-parcel"
              viewBox="0 0 64 56"
              aria-hidden="true"
            >
              <path d="M6 16 32 4l26 12v26L32 54 6 42z" />
              <path d="M6 16l26 12 26-12M32 28v26M19 10l26 12" />
            </svg>
            <p>ひとりで写った写真をどうぞ</p>
            <small>上半身だけでもOK・JPEG/PNG/WebP/HEIC 20MBまで</small>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {busy || colors.busy ? (
          <TruckRoad
            key={run}
            target={busy ? (stage === 'reading' ? 0.25 : 0.85) : 0.97}
            label={
              busy
                ? stage === 'reading'
                  ? '写真を開いています'
                  : '体の形を読み取っています'
                : 'コースの色を準備しています'
            }
          />
        ) : (
          photo?.recognitionMessage && <p>{photo.recognitionMessage}</p>
        )}
      </div>
      {colors.error && (
        <p className="capture-error" role="alert">
          {colors.error}
        </p>
      )}
      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
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
                !smoothed ||
                !resampled.result ||
                !photoColors ||
                colors.busy ||
                !curveCorrection
              }
              onClick={() =>
                onConfirm({
                  ...photo,
                  colorExtraction: photoColors ?? undefined,
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
          黄色い線が道の形になります。
        </p>
      )}
      {smoothed?.warning && <p role="status">{smoothed.warning}</p>}
      {outlineResult.error && (
        <p className="capture-error" role="alert">
          {outlineResult.error}
        </p>
      )}
      {resampled.error && <p role="alert">{resampled.error}</p>}
      {resampled.result && !curveCorrection && (
        <p className="capture-error" role="alert">
          道路の形を整えられませんでした。別の写真を選ぶか、もう一度判定してください。
        </p>
      )}
      <p className="capture-note">写真は送信・保存しません。</p>
    </section>
  );
}

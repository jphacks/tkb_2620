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
              disabled={!photo.outline}
              onClick={() =>
                onConfirm({
                  ...photo,
                  smoothedOutline:
                    photo.outline && smoothed
                      ? { ...photo.outline, points: smoothed.points }
                      : undefined,
                  smoothingOptions: { ...smoothing },
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
      <ContourInspection
        photo={photo}
        smoothing={smoothing}
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

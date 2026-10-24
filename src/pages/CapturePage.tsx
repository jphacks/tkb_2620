import { useEffect, useRef, useState } from 'react';
import type { CapturedPerson } from '../capture/capture';
import { bodyGuidance, isFullBody, readPhoto } from '../capture/capture';

type Props = {
  captured: CapturedPerson | null;
  onConfirm: (image: CapturedPerson | null) => void;
};

export default function CapturePage({ captured, onConfirm }: Props) {
  const [photo, setPhoto] = useState<CapturedPerson | null>(captured);
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
        const { createPoseDetector } = await import('../capture/poseDetector');
        if (token !== generation.current) return;
        const detector = await createPoseDetector();
        try {
          if (token !== generation.current) return;
          const bitmap = await createImageBitmap(selected.blob);
          try {
            if (token !== generation.current) return;
            const points = detector.detect(bitmap).landmarks[0] ?? [];
            const full = isFullBody(points);
            const result: CapturedPerson = {
              ...selected,
              bodyStatus: full
                ? 'full_body'
                : points.length
                  ? 'clipped'
                  : 'unknown',
              recognitionMessage: full
                ? '全身を認識しました。黄色い枠が目印です。'
                : bodyGuidance(points),
            };
            setPhoto(result);
          } finally {
            bitmap.close();
          }
        } finally {
          detector.close();
        }
      } catch {
        if (token === generation.current)
          setPhoto({
            ...selected,
            recognitionMessage:
              '全身認識を実行できませんでした。通信環境を確認して再判定するか、この写真をそのまま使えます。',
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
        携帯で撮った、ひとりの全身写真を選んでください。写真から全身を判定します。見切れた写真も使えます。
      </p>
      <div
        className={`capture-frame ${photo?.bodyStatus === 'full_body' ? 'is-full-body' : ''}`}
        aria-busy={busy}
      >
        {photo ? (
          <>
            <img ref={image} alt="選択した人物の写真" />
            <span className="capture-badge">
              {busy
                ? '全身を判定中…'
                : photo.bodyStatus === 'full_body'
                  ? '全身○'
                  : photo.bodyStatus === 'clipped'
                    ? '全身の一部を確認できません'
                    : '全身を確認できません'}
            </span>
          </>
        ) : (
          <div className="capture-placeholder">
            <span aria-hidden="true">◎</span>
            <p>
              {busy
                ? '写真を読み込んでいます…'
                : '頭から足先まで入った写真を選ぼう。'}
            </p>
            <small>JPEG・PNG・WebPなど、20MBまで</small>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {busy ? (
          <p>
            写真から全身を確認しています。初回は認識モデルの読み込みに時間がかかります。
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
        aria-label="全身の写真を選択"
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
              onClick={() => onConfirm(photo)}
            >
              この写真を使う
            </button>
          </>
        )}
      </div>
      {captured && !busy && (
        <p className="capture-confirmed" role="status">
          写真を選択しました。輪郭処理へ画像と判定結果を渡す準備ができています。輪郭生成は次のステップで追加します。
        </p>
      )}
      <p className="capture-note">
        写真はブラウザ内で処理し、サーバーには送信しません。全身の判定は推定です。初回の認識にはインターネット接続が必要です。HEIC形式を読み込めない場合はJPEGに変換してください。
      </p>
    </section>
  );
}

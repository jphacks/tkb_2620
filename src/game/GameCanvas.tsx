import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CourseData } from '../../shared/course';
import type { createScene, DrivingStatus } from './createScene';
import type { DriveInput } from './updateGame';
import { createLapTrack, formatTime } from './lap';
import type { DeliveryResult } from './score';
export function GameCanvas({
  course,
  toolbarExtra,
  getRemoteInput,
  courseName = 'コース',
  onFinish,
}: {
  course: CourseData;
  toolbarExtra?: ReactNode;
  /** スマホからの入力（#14） */
  getRemoteInput?: () => DriveInput | null;
  courseName?: string;
  /** ゴールしたときの配送結果（#21） */
  onFinish?: (result: DeliveryResult) => void;
}) {
  // 3D画面を作り直さずに最新の関数を使う
  const remoteInput = useRef(getRemoteInput);
  useEffect(() => {
    remoteInput.current = getRemoteInput;
  }, [getRemoteInput]);
  const container = useRef<HTMLDivElement>(null),
    scene = useRef<ReturnType<typeof createScene> | null>(null);
  const [error, setError] = useState(''),
    [following, setFollowing] = useState(true);
  const [status, setStatus] = useState<DrivingStatus>({
    speed: 0,
    distance: 0,
    collided: false,
    active: false,
    time: 0,
    finished: false,
  });
  const courseLength = useMemo(
    () => createLapTrack(course.points, course.roadWidth).length,
    [course],
  );
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  // ゲームから届いた状態を受け取る。ゴールした瞬間に配送結果を1回だけ作る
  const resultRef = useRef<DeliveryResult | null>(null);
  const handleStatus = useRef((next: DrivingStatus) => {
    setStatus(next);
    if (next.finished && !resultRef.current) {
      resultRef.current = {
        courseName: info.current.courseName,
        time: next.time,
        courseLength: info.current.courseLength,
        cargoRemaining: 0, // 積荷は #15〜#17 で追加
        cargoTotal: 0,
        finishedAt: Date.now(),
      };
      setResult(resultRef.current);
    } else if (!next.finished && resultRef.current) {
      resultRef.current = null;
      setResult(null);
    }
  });
  const info = useRef({ courseName, courseLength });
  useEffect(() => {
    info.current = { courseName, courseLength };
  }, [courseName, courseLength]);
  // 「配送完了！」を2秒見せてから結果画面へ
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => finishRef.current?.(result), 2000);
    return () => window.clearTimeout(timer);
  }, [result]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    import('./createScene')
      .then(({ createScene }) => {
        if (cancelled) return;
        scene.current = createScene(
          element,
          course,
          (next) => handleStatus.current(next),
          () => remoteInput.current?.() ?? null,
        );
        setFollowing(true);
        setError('');
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : '3D表示を開始できませんでした。',
          );
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [course]);
  return (
    <div className="course-preview">
      <div className="course-toolbar">
        <div className="toolbar-info">
          <span>↑ / W 加速 / ↓ / S / Space ブレーキ / ← → / A D ハンドル</span>
          <div className="drive-status">
            <span>
              タイム <strong>{formatTime(status.time)}</strong>
            </span>
            <span>
              速度 {status.speed.toFixed(1)} <small>unit/s</small>
            </span>
            <span>
              走行距離 {status.distance.toFixed(1)} <small>unit</small>
            </span>
            <span>
              {status.finished
                ? '配送完了！'
                : status.collided
                  ? '壁に接触 — RでSTARTへ'
                  : status.active
                    ? '走行中'
                    : '画面をクリックして操作'}
            </span>
          </div>
        </div>
        {toolbarExtra}
        <div className="drive-actions">
          <button
            onClick={() => {
              scene.current?.setFollowing(!following);
              setFollowing(!following);
            }}
          >
            {following ? 'コース全体を見る' : '追従カメラに戻る'}
          </button>
          <button
            onClick={() => {
              scene.current?.resetTruck();
              container.current?.focus();
            }}
          >
            STARTに戻す
          </button>
        </div>
      </div>
      {status.finished && (
        <div className="goal-overlay" role="status">
          <p className="goal-title">配送完了！</p>
          <p className="goal-time">{formatTime(status.time)}</p>
          <div className="goal-actions">
            {onFinish && result && (
              <button onClick={() => onFinish(result)}>結果を見る</button>
            )}
            <button
              onClick={() => {
                scene.current?.resetTruck();
                container.current?.focus();
              }}
            >
              もう一度
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div
        className="course-canvas"
        ref={container}
        tabIndex={0}
        role="region"
        aria-label="キーボードでトラックを操作"
        onPointerDown={() => container.current?.focus()}
      />
      <p className="course-caption">
        反時計回りのコースです。Rでリセット。画面からフォーカスが外れると一時停止します。スマホ操作・荷物・ゴール判定は今後追加します。
      </p>
    </div>
  );
}

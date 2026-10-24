import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CourseData } from '../../shared/course';
import type { createScene, DrivingStatus } from './createScene';
import type { DriveInput } from './updateGame';
import { formatTime } from './lap';
export function GameCanvas({
  course,
  toolbarExtra,
  getRemoteInput,
}: {
  course: CourseData;
  toolbarExtra?: ReactNode;
  /** スマホからの入力（#14） */
  getRemoteInput?: () => DriveInput | null;
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
          setStatus,
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
          <button
            onClick={() => {
              scene.current?.resetTruck();
              container.current?.focus();
            }}
          >
            もう一度
          </button>
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

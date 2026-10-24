import { DELIVERY_RATIO } from './deliveryDestination';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { socket } from '../socket/client';
import type { CourseData } from '../../shared/course';
import type { createScene, DrivingStatus } from './createScene';
import type { DriveInput } from './updateGame';
import { createLapTrack, formatTime } from './lap';
import type { DeliveryResult } from './score';
import type { CapturedPerson } from '../capture/capture';
import { createGameAudio, feedbackEvents, soundSettings } from './feedback';
import { GameHud } from '../components/GameHud';
import { CourseMinimap } from '../components/CourseMinimap';
export function GameCanvas({
  course,
  minimapPhoto,
  toolbarExtra,
  getRemoteInput,
  courseName = 'コース',
  onFinish,
  pausedReason = null,
  onKeyboardContinue,
  onLobby,
}: {
  course: CourseData;
  minimapPhoto?: CapturedPerson | null;
  toolbarExtra?: ReactNode;
  /** スマホからの入力（#14） */
  getRemoteInput?: () => DriveInput | null;
  courseName?: string;
  /** ゴールしたときの配送結果（#21） */
  onFinish?: (result: DeliveryResult) => void;
  /** スマホとの通信が切れた理由。ある間はゲームを止める（#22） */
  pausedReason?: string | null;
  /** スマホを待たずにキーボードで続ける */
  onKeyboardContinue?: () => void;
  /** ホーム（ロビー）へ戻る */
  onLobby?: () => void;
}) {
  const audio = useRef<ReturnType<typeof createGameAudio> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(soundSettings.enabled);
  const soundPreference = useRef(soundSettings.enabled);
  const previousFeedback = useRef<DrivingStatus | null>(null);
  const accelerationFeedback = useRef({ time: 0, speed: 0, harsh: false });
  function unlockAudio() {
    if (!soundPreference.current) return;
    try {
      audio.current ??= createGameAudio();
      void audio.current.unlock();
    } catch {
      // Unsupported audio must never prevent playing the game.
    }
  }
  useEffect(() => {
    const silence = () => audio.current?.update(0, false);
    window.addEventListener('blur', silence);
    document.addEventListener('visibilitychange', silence);
    return () => {
      window.removeEventListener('blur', silence);
      document.removeEventListener('visibilitychange', silence);
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  const [dismissedPhoto, setDismissedPhoto] = useState<CapturedPerson | null>(
    null,
  );
  // 3D画面を作り直さずに最新の関数を使う
  const remoteInput = useRef(getRemoteInput);
  useEffect(() => {
    remoteInput.current = getRemoteInput;
  }, [getRemoteInput]);
  const paused = useRef(Boolean(pausedReason));
  useEffect(() => {
    paused.current = Boolean(pausedReason);
  }, [pausedReason]);
  const container = useRef<HTMLDivElement>(null),
    scene = useRef<ReturnType<typeof createScene> | null>(null);
  const [error, setError] = useState(''),
    [following, setFollowing] = useState(true);
  const [status, setStatus] = useState<DrivingStatus>({
    introducing: false,
    position: course.points[0],
    droppedCargo: [],
    wrongWay: false,
    speed: 0,
    distance: 0,
    collided: false,
    active: false,
    time: 0,
    finished: false,
    cargoRemaining: 0,
    cargoTotal: 0,
  });
  const [mapPosition, setMapPosition] = useState<{
    course: CourseData;
    point: { x: number; z: number };
    droppedCargo: DrivingStatus['droppedCargo'];
  } | null>(null);
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
    const events = feedbackEvents(previousFeedback.current, next);
    const audible = !document.hidden && document.hasFocus() && !paused.current;
    audio.current?.update(
      next.speed,
      audible &&
        next.active &&
        !next.finished &&
        (next.countdown == null || next.countdown === 0),
    );
    if (
      audible &&
      next.countdown != null &&
      next.countdown !== previousFeedback.current?.countdown
    )
      audio.current?.countdown(next.countdown === 0);
    if (audible && events.dropped) audio.current?.drop();
    if (audible && events.delivered) audio.current?.finish();
    const hit = next.collided && !previousFeedback.current?.collided;
    const previousMotion = accelerationFeedback.current;
    const dt = next.time - previousMotion.time;
    const acceleration =
      dt > 0 && dt <= 0.5
        ? Math.abs(next.speed - previousMotion.speed) / dt
        : 0;
    // Hysteresis avoids repeatedly warning around the threshold (game metres / s²).
    const harsh = acceleration > (previousMotion.harsh ? 5 : 7);
    const becameHarsh = harsh && !previousMotion.harsh;
    accelerationFeedback.current = {
      time: next.time,
      speed: next.speed,
      harsh,
    };
    if (
      !next.finished &&
      (events.dropped || hit || becameHarsh) &&
      socket.connected
    ) {
      socket.volatile.emit(
        'game:feedback',
        events.dropped
          ? 'cargo-drop'
          : hit
            ? 'collision'
            : 'harsh-acceleration',
      );
    }
    previousFeedback.current = next;
    if (next.finished && !resultRef.current) {
      resultRef.current = {
        courseName: info.current.courseName,
        time: next.time,
        courseLength: info.current.courseLength * DELIVERY_RATIO,
        cargoRemaining: next.cargoRemaining,
        cargoTotal: next.cargoTotal,
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
    previousFeedback.current = null;
    audio.current?.update(0, false);
    let cancelled = false;
    import('./createScene')
      .then(({ createScene }) => {
        if (cancelled) return;
        scene.current = createScene(
          element,
          course,
          (next) => {
            handleStatus.current(next);
            setMapPosition({
              course,
              point: next.position,
              droppedCargo: next.droppedCargo,
            });
          },
          () => remoteInput.current?.() ?? null,
          () => paused.current,
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
    <div
      className="course-preview"
      onPointerDownCapture={unlockAudio}
      onKeyDownCapture={(event) => {
        unlockAudio();
        if (event.code === 'KeyR') setDismissedPhoto(minimapPhoto ?? null);
      }}
    >
      <div className="course-toolbar">
        <div className="toolbar-info">
          <GameHud
            time={status.time}
            cargoRemaining={status.cargoRemaining}
            cargoTotal={status.cargoTotal}
            speed={status.speed}
            message={
              status.introducing
                ? 'コースを見渡しています…'
                : status.finished
                  ? '配送完了！'
                  : status.wrongWay
                    ? '逆走防止中 — ハンドル＋アクセルで向きを戻してください'
                    : status.collided
                      ? '壁に接触 — ハンドルを切ってアクセルで復帰'
                      : status.active
                        ? '配達中'
                        : '画面をクリックして操作'
            }
          />
          <details className="drive-help">
            <summary>操作方法</summary>
            <p>
              ↑ / W：加速 / ↓ / S / Space：ブレーキ
              <br />← → / A D：ハンドル / R：STARTへ
            </p>
          </details>
        </div>
        <div className="hud-extras">{toolbarExtra}</div>
        <div className="drive-actions">
          <button
            aria-pressed={soundEnabled}
            onClick={() => {
              const enabled = !soundPreference.current;
              soundPreference.current = enabled;
              setSoundEnabled(enabled);
              soundSettings.enabled = enabled;
              audio.current?.setEnabled(enabled);
              if (enabled) unlockAudio();
            }}
          >
            {soundEnabled ? 'サウンド：ON' : 'サウンド：OFF'}
          </button>
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
              setDismissedPhoto(minimapPhoto ?? null);
              scene.current?.resetTruck();
              container.current?.focus();
            }}
          >
            STARTに戻す
          </button>
        </div>
      </div>
      {status.introducing && (
        <div className="intro-camera-notice">
          <p>この道を、ふたりで届けよう。</p>
        </div>
      )}
      {status.countdown != null && (
        <div className="start-countdown" role="status" aria-live="polite">
          <span key={status.countdown}>
            {status.countdown === 0 ? 'Go!' : status.countdown}
          </span>
        </div>
      )}
      {status.finished && (
        <div className="goal-overlay" role="status">
          <div className="delivery-celebration" aria-hidden="true">
            📦 ✓
          </div>
          <p className="goal-title">配送完了！</p>
          <p>お届け先まで、ふたりで運びきりました！</p>
          <p className="goal-time">{formatTime(status.time)}</p>
          <div className="goal-actions">
            {onFinish && result && (
              <button onClick={() => onFinish(result)}>伝票を見る</button>
            )}
            <button
              onClick={() => {
                setDismissedPhoto(minimapPhoto ?? null);
                scene.current?.resetTruck();
                container.current?.focus();
              }}
            >
              もう一度
            </button>
          </div>
        </div>
      )}
      {/* 一時停止の表示はスタート前だけ。レース中は止めずに走り続ける */}
      {pausedReason && !status.finished && status.time === 0 && (
        <div
          className="goal-overlay pause-overlay"
          role="alertdialog"
          aria-labelledby="pause-title"
          aria-describedby="pause-reason"
        >
          <p className="pause-title" id="pause-title">
            一時停止中
          </p>
          <p id="pause-reason">{pausedReason}</p>
          <div className="goal-actions">
            {onKeyboardContinue && (
              <button
                onClick={() => {
                  onKeyboardContinue();
                  container.current?.focus();
                }}
              >
                キーボードで続ける
              </button>
            )}
            <button
              onClick={() => {
                setDismissedPhoto(minimapPhoto ?? null);
                scene.current?.resetTruck();
              }}
            >
              STARTに戻す
            </button>
            {onLobby && <button onClick={onLobby}>受付に戻る</button>}
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
      <CourseMinimap
        photo={minimapPhoto !== dismissedPhoto ? minimapPhoto : null}
        droppedCargo={
          mapPosition?.course === course ? mapPosition.droppedCargo : []
        }
        wallColorStops={course.wallColorStops}
        points={course.points}
        position={
          mapPosition?.course === course ? mapPosition.point : course.points[0]
        }
      />
      <p className="course-caption">
        反時計回りに走り、赤い屋根のお家へ配送します。Rでリセット。右下のミニマップで届け先を確認できます。
      </p>
    </div>
  );
}

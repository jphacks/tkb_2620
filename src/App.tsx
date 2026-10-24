import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { controllerLossReason, validateCourseData } from './game/safety';
import type { CapturedPerson } from './capture/capture';
import { Button } from './components/Button';
import { ConnectionStatus } from './components/ConnectionStatus';
import { RoomPanel } from './components/RoomPanel';
import { useRoom } from './socket/useRoom';
import type { DeliveryResult } from './game/score';
import { useRemoteInput } from './socket/useRemoteInput';
import type { ControllerRole } from '../shared/socket';
import type { CourseData } from '../shared/course';
import CourseReadyPage from './pages/CourseReadyPage';
import HomePage from './pages/HomePage';
import CapturePage from './pages/CapturePage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';
import SteeringPage from './pages/SteeringPage';
import PedalPage from './pages/PedalPage';

const pages = [
  { label: 'ホーム', View: HomePage },
  { label: '写真', View: null },
  { label: 'ゲーム', View: GamePage },
  { label: '結果', View: ResultPage },
];
const PHOTO_PAGE = 1;
const GAME_PAGE = 2;
const RESULT_PAGE = 3;

// QRコードのURL（?room=XXXX&role=steering|pedal）から参加情報を読む
function readJoinParams(): { roomId: string; role: ControllerRole } | null {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  const role = params.get('role');
  if (roomId && (role === 'steering' || role === 'pedal'))
    return { roomId, role };
  return null;
}

const roleLabels: Record<ControllerRole, string> = {
  steering: 'ハンドル',
  pedal: 'アクセル・ブレーキ',
};

export default function App() {
  const [active, setActive] = useState(0);
  const [firstPlayPhoto, setFirstPlayPhoto] = useState<CapturedPerson | null>(
    null,
  );
  const [captured, setCaptured] = useState<CapturedPerson | null>(null);
  // Photo tab: 'capture' picks the photo, 'course' generates and names the course.
  const [photoStep, setPhotoStep] = useState<'capture' | 'course'>('capture');
  const [course, setCourse] = useState<{
    data: CourseData;
    name: string;
  } | null>(null);
  // 直近の配送結果（#21）。ゴールすると結果画面へ移る
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const { connected, room, role, error, createRoom, joinRoom } = useRoom();
  const { getInput: getRemoteInput, getLastInputAt } = useRemoteInput(room);
  // 写真・コースの処理に失敗して撮影画面へ戻したときの説明（#22）
  const [captureNotice, setCaptureNotice] = useState('');
  // このゲームで操作に使ったスマホの担当。抜けたら一時停止する（#22）
  const [usedRoles, setUsedRoles] = useState<ReadonlySet<ControllerRole>>(
    () => new Set(),
  );
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [join] = useState(readJoinParams);
  const roomRequested = useRef(false);

  // スマホ: 接続（再接続）するたびにQRのルームへ参加する
  useEffect(() => {
    if (connected && join) joinRoom(join.roomId, join.role);
  }, [connected, join, joinRoom]);

  // PC: 接続したらルームを1つ作る
  useEffect(() => {
    if (!connected) {
      roomRequested.current = false;
      return;
    }
    if (join || room || roomRequested.current) return;
    roomRequested.current = true;
    createRoom();
  }, [connected, join, room, createRoom]);

  // ゲーム画面にいる間、参加しているスマホを「使っている担当」として覚える
  useEffect(() => {
    if (active !== GAME_PAGE || !room) return;
    const joined = (['steering', 'pedal'] as const).filter((r) => room[r]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- room updates arrive as events
    setUsedRoles((used) =>
      joined.every((r) => used.has(r)) ? used : new Set([...used, ...joined]),
    );
  }, [active, room]);
  // 使っていたスマホとの通信が切れたら一時停止の理由を出す。戻れば自動で消える
  useEffect(() => {
    if (active !== GAME_PAGE || !usedRoles.size) return;
    const check = () =>
      setPausedReason(
        controllerLossReason({
          used: usedRoles,
          room,
          connected,
          lastInputAt: getLastInputAt(),
          now: performance.now(),
        }),
      );
    check();
    const timer = window.setInterval(check, 300);
    return () => window.clearInterval(timer);
  }, [active, usedRoles, room, connected, getLastInputAt]);

  function goTo(page: number) {
    if (active === GAME_PAGE && page !== GAME_PAGE) setFirstPlayPhoto(null);
    // ゲームを出たら、次のゲームでは改めてスマホの参加を見る
    if (page !== GAME_PAGE) setUsedRoles(new Set());
    setActive(page);
  }
  /** 写真・コースが使えないとき、理由を添えて撮影画面へ戻す（#22） */
  function backToCapture(reason: string) {
    setCaptured(null);
    setPhotoStep('capture');
    setCaptureNotice(reason);
    goTo(PHOTO_PAGE);
  }

  const header = (
    <header>
      <a href="/" className="brand">
        BODY ROAD
      </a>
      <ConnectionStatus connected={connected} />
    </header>
  );

  if (join) {
    const Controller = join.role === 'steering' ? SteeringPage : PedalPage;
    const statusText = error
      ? error
      : role && room
        ? `ROOM ${room.roomId} に「${roleLabels[role]}」担当で参加中`
        : `ROOM ${join.roomId} に参加しています...`;
    return (
      <div className="app">
        {header}
        <main>
          <p className="controller-room" role="status">
            {statusText}
          </p>
          <Controller joined={Boolean(role && room)} statusText={statusText} />
        </main>
      </div>
    );
  }

  const View = pages[active].View;
  return (
    <div className={active === GAME_PAGE ? 'app app-game' : 'app'}>
      {header}
      <nav aria-label="画面プレビュー">
        {pages.map((page, index) => (
          <Button
            key={page.label}
            aria-pressed={index === active}
            onClick={() => goTo(index)}
          >
            {page.label}
          </Button>
        ))}
      </nav>
      <main>
        <ErrorBoundary
          onRetake={() =>
            backToCapture(
              '問題が起きたため、写真の選択からやり直します。別の写真も試してください。',
            )
          }
          onHome={() => goTo(0)}
        >
          {active === GAME_PAGE ? (
            <GamePage
              minimapPhoto={firstPlayPhoto}
              course={course?.data}
              courseName={course?.name}
              roomSlot={<RoomPanel connected={connected} room={room} />}
              getRemoteInput={getRemoteInput}
              onFinish={(finished) => {
                setResult(finished);
                goTo(RESULT_PAGE);
              }}
              pausedReason={usedRoles.size ? pausedReason : null}
              onKeyboardContinue={() => setUsedRoles(new Set())}
              onLobby={() => goTo(0)}
            />
          ) : active === RESULT_PAGE ? (
            <ResultPage result={result} onRetry={() => goTo(GAME_PAGE)} />
          ) : View ? (
            <View />
          ) : photoStep === 'course' && captured ? (
            <CourseReadyPage
              key={captured.capturedAt}
              captured={captured}
              onPlay={(data, name) => {
                const problem = validateCourseData(data);
                if (problem) {
                  backToCapture(
                    `コースを作れませんでした（${problem}）。別の写真を選んでください。`,
                  );
                  return;
                }
                setFirstPlayPhoto(captured);
                setCourse({ data, name });
                goTo(GAME_PAGE);
              }}
              onRetake={() => {
                setCaptured(null);
                setPhotoStep('capture');
                setCaptureNotice('');
              }}
              onFailed={(message) =>
                backToCapture(
                  `${message} 別の写真を選ぶか、ポーズを変えて撮り直してください。`,
                )
              }
            />
          ) : (
            <CapturePage
              captured={captured}
              notice={captureNotice}
              onConfirm={(image) => {
                setCaptured(image);
                // Confirming a photo moves on to course generation; null only clears it.
                if (image) {
                  setCaptureNotice('');
                  setPhotoStep('course');
                }
              }}
            />
          )}
        </ErrorBoundary>
        {error && <p className="error-text">{error}</p>}
      </main>
      <footer>開発用のひな形です。ゲーム機能はこれから実装します。</footer>
    </div>
  );
}

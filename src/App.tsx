import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { controllerLossReason, validateCourseData } from './game/safety';
import type { CapturedPerson } from './capture/capture';
import { BrandMark } from './components/BrandMark';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useRoom } from './socket/useRoom';
import type { DeliveryResult } from './game/score';
import { useRemoteInput } from './socket/useRemoteInput';
import type { ControllerRole } from '../shared/socket';
import type { CourseData } from '../shared/course';
import CourseReadyPage from './pages/CourseReadyPage';
import { isDatabaseConfigured, recordPlay, saveCourse } from './db/supabase';
import { SAMPLE_COURSE_ID } from './db/courseRow';
import HomePage from './pages/HomePage';
import CapturePage from './pages/CapturePage';
import GamePage from './pages/GamePage';
import MemoriesPage from './pages/MemoriesPage';
import ConnectPage from './pages/ConnectPage';
import { sampleCourse } from './fixtures/sampleCourse';
import ResultPage from './pages/ResultPage';
import SteeringPage from './pages/SteeringPage';
import PedalPage from './pages/PedalPage';

/**
 * 画面の流れ（#26）。タブはなくし、受付から順に進む。
 *   home ─┬─ photo → (コース完成) ─┐
 *         └─ memories ─────────────┴→ connect → game → result
 */
type Screen = 'home' | 'photo' | 'memories' | 'connect' | 'game' | 'result';

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
  steering: 'ハンドル係',
  pedal: 'ペダル係',
};

export default function App() {
  const [active, setActive] = useState<Screen>('home');
  const [firstPlayPhoto, setFirstPlayPhoto] = useState<CapturedPerson | null>(
    null,
  );
  const [captured, setCaptured] = useState<CapturedPerson | null>(null);
  // Photo tab: 'capture' picks the photo, 'course' generates and names the course.
  const [photoStep, setPhotoStep] = useState<'capture' | 'course'>('capture');
  const [course, setCourse] = useState<{
    data: CourseData;
    name: string;
    /** DB に保存されていれば、その id（#25） */
    id?: string;
  } | null>(null);
  // コースの保存がうまくいかなかったときの案内（ゲームはそのまま遊べる）
  const [saveNotice, setSaveNotice] = useState('');
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
    if (active !== 'game' || !room) return;
    const joined = (['steering', 'pedal'] as const).filter((r) => room[r]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- room updates arrive as events
    setUsedRoles((used) =>
      joined.every((r) => used.has(r)) ? used : new Set([...used, ...joined]),
    );
  }, [active, room]);
  // 使っていたスマホとの通信が切れたら一時停止の理由を出す。戻れば自動で消える
  useEffect(() => {
    if (active !== 'game' || !usedRoles.size) return;
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

  function goTo(page: Screen) {
    if (active === 'game' && page !== 'game') setFirstPlayPhoto(null);
    // ゲームを出たら、次のゲームでは改めてスマホの参加を見る
    if (page !== 'game') setUsedRoles(new Set());
    setActive(page);
    window.scrollTo(0, 0);
  }
  /** 写真の画面を最初からにする */
  function startNewCourse() {
    setCaptured(null);
    setPhotoStep('capture');
    setCaptureNotice('');
    goTo('photo');
  }
  const bothJoined = Boolean(room?.steering && room?.pedal);
  // 接続画面の「戻る」で帰る先（コースを選んだ画面）
  const [connectBack, setConnectBack] = useState<Screen>('home');
  function goToConnect(from: Screen) {
    setConnectBack(from);
    goTo('connect');
  }
  /** 写真・コースが使えないとき、理由を添えて撮影画面へ戻す（#22） */
  function backToCapture(reason: string) {
    setCaptured(null);
    setPhotoStep('capture');
    setCaptureNotice(reason);
    goTo('photo');
  }

  // サーバーの状態は、つながっていないときだけ出す
  const header = (
    <header>
      <BrandMark onHome={join ? undefined : () => goTo('home')} />
      {!connected && <ConnectionStatus connected={connected} />}
    </header>
  );
  // 選んだコースの人物の色を、画面のアクセントにする（#26）
  const accent = course?.data.themeColor ?? sampleCourse.themeColor;

  if (join) {
    const Controller = join.role === 'steering' ? SteeringPage : PedalPage;
    const statusText = error
      ? error
      : role && room
        ? `${roleLabels[role]}として登録しました`
        : '配送センターに接続しています…';
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

  const courseData = course?.data ?? sampleCourse;
  const courseLabel = course?.name ?? 'サンプルコース（楕円）';
  return (
    <div
      className={active === 'game' ? 'app app-game' : 'app'}
      style={{ '--course-accent': accent } as CSSProperties}
    >
      {header}
      <main>
        {active === 'photo' && (
          <button
            type="button"
            className="link-button back"
            onClick={() => goTo('home')}
          >
            ← 受付に戻る
          </button>
        )}
        <ErrorBoundary
          onRetake={() =>
            backToCapture(
              '問題が起きたため、写真の選択からやり直します。別の写真も試してください。',
            )
          }
          onHome={() => goTo('home')}
        >
          {active === 'game' ? (
            <GamePage
              minimapPhoto={firstPlayPhoto}
              course={course?.data}
              courseName={course?.name}
              getRemoteInput={getRemoteInput}
              onFinish={(finished) => {
                // ランキング用にコースの id を付ける（#29）。写真なしならサンプルの id
                setResult({
                  ...finished,
                  courseId: course ? course.id : SAMPLE_COURSE_ID,
                });
                goTo('result');
              }}
              pausedReason={usedRoles.size ? pausedReason : null}
              onKeyboardContinue={() => setUsedRoles(new Set())}
              onLobby={() => goTo('home')}
            />
          ) : active === 'result' ? (
            <ResultPage
              result={result}
              // スマホがつながったままなら、そのままもう一度走る
              onRetry={() => goTo(bothJoined ? 'game' : 'connect')}
              onHome={() => goTo('home')}
            />
          ) : active === 'connect' ? (
            <ConnectPage
              connected={connected}
              room={room}
              course={courseData}
              courseName={courseLabel}
              onStart={() => goTo('game')}
              onBack={() => goTo(connectBack)}
            />
          ) : active === 'memories' ? (
            <MemoriesPage
              onBack={() => goTo('home')}
              onPlay={(saved) => {
                // 保存したコースで遊ぶ（#25）
                setCourse({ data: saved.data, name: saved.name, id: saved.id });
                setFirstPlayPhoto(null);
                setSaveNotice('');
                goToConnect('memories');
                recordPlay(saved.id).catch(() => {});
              }}
            />
          ) : active === 'home' ? (
            <HomePage
              hasMemories={isDatabaseConfigured}
              onNewCourse={startNewCourse}
              onMemories={() => goTo('memories')}
              onSample={() => {
                setCourse(null);
                setFirstPlayPhoto(null);
                setSaveNotice('');
                goToConnect('home');
              }}
            />
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
                setSaveNotice('');
                goToConnect('photo');
                // 遊び始めると同時に裏で保存する（#25）。失敗してもゲームは続ける
                if (isDatabaseConfigured)
                  saveCourse(data, name)
                    .then((saved) => {
                      setCourse((current) =>
                        current?.data === data
                          ? { ...current, id: saved.id }
                          : current,
                      );
                      return recordPlay(saved.id);
                    })
                    .catch((cause: unknown) =>
                      setSaveNotice(
                        `コースを保存できませんでした。配達はそのまま続けられます。${cause instanceof Error ? `（${cause.message}）` : ''}`,
                      ),
                    );
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
        {saveNotice && <p className="error-text">{saveNotice}</p>}
      </main>
    </div>
  );
}

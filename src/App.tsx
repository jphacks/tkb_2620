import { useEffect, useRef, useState } from 'react';
import type { CapturedPerson } from './capture/capture';
import { Button } from './components/Button';
import { ConnectionStatus } from './components/ConnectionStatus';
import { RoomPanel } from './components/RoomPanel';
import { useRoom } from './socket/useRoom';
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
const GAME_PAGE = 2;

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
  const [captured, setCaptured] = useState<CapturedPerson | null>(null);
  // Photo tab: 'capture' picks the photo, 'course' generates and names the course.
  const [photoStep, setPhotoStep] = useState<'capture' | 'course'>('capture');
  const [course, setCourse] = useState<{
    data: CourseData;
    name: string;
  } | null>(null);
  const { connected, room, role, error, createRoom, joinRoom } = useRoom();
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
    return (
      <div className="app">
        {header}
        <main>
          <p className="controller-room" role="status">
            {error
              ? error
              : role && room
                ? `ROOM ${room.roomId} に「${roleLabels[role]}」担当で参加中`
                : `ROOM ${join.roomId} に参加しています...`}
          </p>
          <Controller />
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
            onClick={() => setActive(index)}
          >
            {page.label}
          </Button>
        ))}
      </nav>
      <main>
        {active === GAME_PAGE ? (
          <GamePage
            course={course?.data}
            courseName={course?.name}
            roomSlot={<RoomPanel connected={connected} room={room} />}
          />
        ) : View ? (
          <View />
        ) : photoStep === 'course' && captured ? (
          <CourseReadyPage
            key={captured.capturedAt}
            captured={captured}
            onPlay={(data, name) => {
              setCourse({ data, name });
              setActive(GAME_PAGE);
            }}
            onRetake={() => {
              setCaptured(null);
              setPhotoStep('capture');
            }}
          />
        ) : (
          <CapturePage
            captured={captured}
            onConfirm={(image) => {
              setCaptured(image);
              // Confirming a photo moves on to course generation; null only clears it.
              if (image) setPhotoStep('course');
            }}
          />
        )}
        {error && <p className="error-text">{error}</p>}
      </main>
      <footer>開発用のひな形です。ゲーム機能はこれから実装します。</footer>
    </div>
  );
}

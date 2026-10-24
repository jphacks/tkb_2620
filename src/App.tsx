import { useState } from 'react';
import type { CapturedPerson } from './capture/capture';
import { Button } from './components/Button';
import { ConnectionStatus } from './components/ConnectionStatus';
import { useRoom } from './socket/useRoom';
import HomePage from './pages/HomePage';
import CapturePage from './pages/CapturePage';
import GamePage from './pages/GamePage';
import SteeringPage from './pages/SteeringPage';
import PedalPage from './pages/PedalPage';
import ResultPage from './pages/ResultPage';
const pages = [
  { label: 'ホーム', View: HomePage },
  { label: '写真', View: null },
  { label: 'ゲーム', View: GamePage },
  { label: 'ハンドル', View: SteeringPage },
  { label: 'ペダル', View: PedalPage },
  { label: '結果', View: ResultPage },
];
export default function App() {
  const [active, setActive] = useState(0);
  const [captured, setCaptured] = useState<CapturedPerson | null>(null);
  const { connected } = useRoom();
  const View = pages[active].View;
  return (
    <div className="app">
      <header>
        <a href="/" className="brand">
          BODY ROAD
        </a>
        <ConnectionStatus connected={connected} />
      </header>
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
        {View ? (
          <View />
        ) : (
          <CapturePage captured={captured} onConfirm={setCaptured} />
        )}
      </main>
      <footer>開発用のひな形です。ゲーム機能はこれから実装します。</footer>
    </div>
  );
}

import { useState } from 'react';
import { DeliveryGuide } from '../components/DeliveryGuide';

/**
 * ホーム＝配送センターの受付（#26）。
 * 新しいコースをつくる（新規受付）か、前につくったコースで走る（再配達）かを選ぶ。
 * 写真を使わずに試すサンプルコースは「おためし便」。
 */
export default function HomePage({
  onNewCourse,
  onMemories,
  onSample,
  hasMemories = true,
}: {
  onNewCourse: () => void;
  onMemories: () => void;
  onSample: () => void;
  /** DB が使えないときは「再配達」を出さない */
  hasMemories?: boolean;
}) {
  const [guide, setGuide] = useState(false);
  return (
    <section className="home" aria-labelledby="home-title">
      <p className="eyebrow">ふたりの配送センター</p>
      <h1 id="home-title" className="home-title">
        今日は、どの道で届ける？
      </h1>
      <div className="route-choices">
        <button type="button" className="route-card" onClick={onNewCourse}>
          <span className="route-card-label">新規受付</span>
          <strong className="route-card-title">新しいコースで遊ぶ</strong>
          <span className="route-card-go" aria-hidden="true">
            写真を選ぶ →
          </span>
        </button>
        {hasMemories && (
          <button type="button" className="route-card" onClick={onMemories}>
            <span className="route-card-label">再配達</span>
            <strong className="route-card-title">思い出のコースで遊ぶ</strong>
            <span className="route-card-go" aria-hidden="true">
              コースを選ぶ →
            </span>
          </button>
        )}
      </div>
      <p className="home-sub">
        <button
          type="button"
          className="guide-button"
          onClick={() => setGuide(true)}
        >
          はじめての配達
        </button>
        <button type="button" className="link-button" onClick={onSample}>
          おためし便：サンプルコースで走る
        </button>
      </p>
      {guide && <DeliveryGuide onClose={() => setGuide(false)} />}
    </section>
  );
}

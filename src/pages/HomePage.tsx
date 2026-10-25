import { useState } from 'react';
import { DeliveryGuide } from '../components/DeliveryGuide';

/**
 * ホーム＝配送センターの受付（#26）。
 * 大きな2枚の荷札から、新しいコースをつくる（新規受付）か、前につくったコースで走る（再配達）かを選ぶ。
 * 写真を使わずに試すサンプルコースは「おためし便」。右上に「はじめての配達」（チュートリアル）。
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
    <section className="home" aria-label="受付">
      <div className="home-top">
        <button
          type="button"
          className="guide-button"
          onClick={() => setGuide(true)}
        >
          はじめての配達
        </button>
      </div>
      <div className="route-choices">
        <button
          type="button"
          className="route-card route-card-big"
          onClick={onNewCourse}
        >
          <span className="route-card-label">新規受付</span>
          <svg
            className="route-card-art"
            viewBox="0 0 120 90"
            aria-hidden="true"
          >
            <rect x="8" y="10" width="54" height="70" rx="5" />
            <path d="M35 24c4 0 7 3 7 7s-2 6-5 7l10 4-3 6-7-3 1 10 6 12h-7l-4-9-4 9h-7l6-12 1-10-7 3-3-6 10-4c-3-1-5-3-5-7s3-7 7-7Z" />
            <path d="M70 45h12m-5-5 5 5-5 5" />
            <path
              className="route-card-art-road"
              d="M100 16c8 3 10 10 5 15s3 13 0 21-10 13-18 8-10-15-5-23 10-24 18-21Z"
              transform="translate(8 0)"
            />
          </svg>
          <strong className="route-card-title">新しいコースで遊ぶ</strong>
          <span className="route-card-go" aria-hidden="true">
            写真を選ぶ →
          </span>
        </button>
        <div className="route-side">
          {hasMemories && (
            <button
              type="button"
              className="route-card route-card-big"
              onClick={onMemories}
            >
              <span className="route-card-label">再配達</span>
              <svg
                className="route-card-art"
                viewBox="0 0 120 90"
                aria-hidden="true"
              >
                <path d="M30 20h40l10 10v50H30z" transform="rotate(-8 55 50)" />
                <path d="M42 16h40l10 10v50H42z" transform="rotate(4 67 46)" />
                <circle cx="70" cy="28" r="4" />
                <path
                  className="route-card-art-road"
                  d="M60 44c6-4 14-2 16 4s-4 10 0 14-6 10-14 6-10-10-6-14 0-6 4-10Z"
                />
              </svg>
              <strong className="route-card-title">思い出のコースで遊ぶ</strong>
              <span className="route-card-go" aria-hidden="true">
                コースを選ぶ →
              </span>
            </button>
          )}
          <button type="button" className="sample-ticket" onClick={onSample}>
            <span className="sample-ticket-label">おためし便</span>
            <span>サンプルコースで走る →</span>
          </button>
        </div>
      </div>
      {guide && <DeliveryGuide onClose={() => setGuide(false)} />}
    </section>
  );
}

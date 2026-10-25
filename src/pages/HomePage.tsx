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
            viewBox="0 0 175 90"
            aria-hidden="true"
          >
            <rect x="8" y="10" width="54" height="70" rx="5" />
            <path d="M35 24c4 0 7 3 7 7s-2 6-5 7l10 4-3 6-7-3 1 10 6 12h-7l-4-9-4 9h-7l6-12 1-10-7 3-3-6 10-4c-3-1-5-3-5-7s3-7 7-7Z" />
            <path d="M70 45h12m-5-5 5 5-5 5" />
            <path
              className="route-card-art-road"
              d="M20 4c3.3 0 5.6 2.5 5.6 5.4 0 2.2-1.2 3.8-2.8 4.7l8.6 3.4c1.5.6 1.8 2.6.5 3.5-.8.6-1.9.6-2.7.1l-4.6-2.6.6 6.4 4.4 8.4c.7 1.4-.3 3.1-1.9 3.1-.8 0-1.6-.5-2-1.2L20 27.6l-5.7 7.6c-.4.7-1.2 1.2-2 1.2-1.6 0-2.6-1.7-1.9-3.1l4.4-8.4.6-6.4-4.6 2.6c-.8.5-1.9.5-2.7-.1-1.3-.9-1-2.9.5-3.5l8.6-3.4c-1.6-.9-2.8-2.5-2.8-4.7C14.4 6.5 16.7 4 20 4Z"
              transform="translate(95 4) scale(2.05)"
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
                  d="M20 4c3.3 0 5.6 2.5 5.6 5.4 0 2.2-1.2 3.8-2.8 4.7l8.6 3.4c1.5.6 1.8 2.6.5 3.5-.8.6-1.9.6-2.7.1l-4.6-2.6.6 6.4 4.4 8.4c.7 1.4-.3 3.1-1.9 3.1-.8 0-1.6-.5-2-1.2L20 27.6l-5.7 7.6c-.4.7-1.2 1.2-2 1.2-1.6 0-2.6-1.7-1.9-3.1l4.4-8.4.6-6.4-4.6 2.6c-.8.5-1.9.5-2.7-.1-1.3-.9-1-2.9.5-3.5l8.6-3.4c-1.6-.9-2.8-2.5-2.8-4.7C14.4 6.5 16.7 4 20 4Z"
                  transform="translate(50 36) scale(0.95)"
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

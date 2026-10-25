import { useEffect, useState } from 'react';

/**
 * 読み込み中の表示（#26）。道路の上をトラックが左から右へ進み、どこまで進んだかで進み具合を見せる。
 * target は今の段階で進める上限（0〜1）。処理の中の細かい進み具合はわからないので、
 * 上限に向かって少しずつ近づけ、段階が進んだら上限を上げる。1 で右端（届け先）に着く。
 */
export function TruckRoad({
  target,
  label,
}: {
  target: number;
  /** 読み上げ用の、今していること */
  label: string;
}) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((p) => {
        const goal = Math.min(1, Math.max(0, target));
        if (goal <= p) return goal >= 1 ? 1 : p;
        // 上限に近づくほどゆっくり進む
        return Math.min(goal, p + Math.max((goal - p) * 0.06, 0.002));
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [target]);
  const percent = Math.round(progress * 100);
  return (
    <div
      className="truck-road"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="truck-road-lane">
        <div className="truck-road-done" style={{ width: `${percent}%` }} />
        <svg
          className="truck-road-truck"
          style={{ left: `${percent}%` }}
          viewBox="0 0 48 30"
          aria-hidden="true"
        >
          {/* 右向きの配送トラック（荷台が左、運転席が右） */}
          <rect x="2" y="4" width="28" height="18" rx="2" />
          <path d="M30 10h9l6 7v5H30z" />
          <path d="M33 12h5l3.5 4H33z" className="truck-road-window" />
          <circle cx="11" cy="24" r="4.5" className="truck-road-wheel" />
          <circle cx="37" cy="24" r="4.5" className="truck-road-wheel" />
        </svg>
        <span className="truck-road-goal" aria-hidden="true">
          🏠
        </span>
      </div>
      <span className="truck-road-percent">{percent}%</span>
    </div>
  );
}

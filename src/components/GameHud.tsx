import type { CSSProperties } from 'react';
import { formatTime } from '../game/lap';
import { CHECKPOINTS } from '../game/checkpoints';

/** Race information only; never intercepts driving input. */
export function GameHud({
  time,
  cargoRemaining,
  cargoTotal,
  speed,
  message,
  route = 0,
  notice = null,
}: {
  time: number;
  cargoRemaining: number;
  cargoTotal: number;
  speed: number;
  message: string;
  /** お家までの道のりのうち、進んだ割合（0〜1） */
  route?: number;
  /** 看板を通過した直後だけ出す短い知らせ（「1/4 通過！」など） */
  notice?: string | null;
}) {
  // 看板で4つに分けた区間ごとに、どれだけ進んだか（0〜1）
  const edges = [0, ...CHECKPOINTS.map((c) => c.ratio), 1];
  const parts = edges.slice(1).map((end, i) => {
    const start = edges[i];
    return Math.max(0, Math.min(1, (route - start) / (end - start)));
  });
  return (
    <section className="game-hud" aria-label="走行情報">
      <dl className="hud-readouts">
        <div>
          <dt>
            TIME <span>タイム</span>
          </dt>
          <dd>{formatTime(time)}</dd>
        </div>
        <div
          className={
            cargoTotal > 0 && cargoRemaining < cargoTotal
              ? 'hud-cargo-reduced'
              : ''
          }
        >
          <dt>
            CARGO <span>積荷</span>
          </dt>
          <dd>
            {cargoRemaining}
            <small> / {cargoTotal} 個</small>
          </dd>
        </div>
        <div>
          <dt>
            SPEED <span>速度</span>
          </dt>
          <dd>
            {Math.round(Math.max(0, speed) * 3.6)}
            <small> km/h</small>
          </dd>
        </div>
      </dl>
      <div className="hud-status">
        <p className={notice ? 'hud-message hud-notice' : 'hud-message'}>
          {notice ?? message}
        </p>
        <div
          className="hud-route"
          role="progressbar"
          aria-label="お家までの道のり"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(route * 100)}
        >
          <span className="hud-route-label">お家まで</span>
          <span className="hud-route-bar">
            {parts.map((part, i) => (
              <span
                key={i}
                className={part >= 1 ? 'done' : undefined}
                style={{ '--part': part } as CSSProperties}
              />
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}

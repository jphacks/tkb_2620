import { formatTime } from '../game/lap';

/** Race information only; never intercepts driving input. */
export function GameHud({
  time,
  cargoRemaining,
  cargoTotal,
  speed,
  message,
}: {
  time: number;
  cargoRemaining: number;
  cargoTotal: number;
  speed: number;
  message: string;
}) {
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
      <p className="hud-message">{message}</p>
    </section>
  );
}

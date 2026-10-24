import { Button } from '../components/Button';
import { formatTime } from '../game/lap';
import {
  CARGO_POINTS,
  computeScore,
  slipNumber,
  TIME_POINTS,
  type DeliveryResult,
} from '../game/score';

/** 配送完了伝票風のリザルト画面（#21） */
export default function ResultPage({
  result,
  onRetry,
}: {
  result?: DeliveryResult | null;
  onRetry?: () => void;
}) {
  if (!result)
    return (
      <section>
        <p className="eyebrow">RESULT</p>
        <h1>走行結果</h1>
        <p>
          まだ結果がありません。「ゲーム」でコースを一周すると、ここに配送伝票が届きます。
        </p>
      </section>
    );

  const score = computeScore(result);
  return (
    <section className="result-page">
      <article className="delivery-slip" aria-label="配送完了伝票">
        <header className="slip-header">
          <span className="slip-title">配送完了伝票</span>
          <span className="slip-number">
            No. {slipNumber(result.finishedAt)}
          </span>
        </header>
        <div className="slip-stamp" aria-hidden="true">
          配達
          <br />
          完了
        </div>
        <dl className="slip-rows">
          <div>
            <dt>お届け日時</dt>
            <dd>
              {new Date(result.finishedAt).toLocaleString('ja-JP', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </dd>
          </div>
          <div>
            <dt>コース</dt>
            <dd>{result.courseName}</dd>
          </div>
          <div>
            <dt>所要時間</dt>
            <dd className="slip-strong">{formatTime(result.time)}</dd>
          </div>
          <div>
            <dt>積荷</dt>
            <dd>
              {score.cargoTracked
                ? `${result.cargoRemaining} / ${result.cargoTotal} 個`
                : '—'}
            </dd>
          </div>
        </dl>
        <div className="slip-score">
          <span>総合スコア</span>
          <strong>{score.total}</strong>
          <small>/ {TIME_POINTS + CARGO_POINTS}</small>
        </div>
        <p className="slip-breakdown">
          タイム {score.timePoints}/{TIME_POINTS}（基準{' '}
          {formatTime(score.parTime)}）・積荷 {score.cargoPoints}/{CARGO_POINTS}
          {!score.cargoTracked && '（積荷は準備中のため満点）'}
        </p>
      </article>
      {onRetry && <Button onClick={onRetry}>もう一度走る</Button>}
    </section>
  );
}

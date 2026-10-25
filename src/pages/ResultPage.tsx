import { useEffect } from 'react';
import { playStampSound } from '../game/feedback';
import { Button } from '../components/Button';
import { RankingEntryForm } from '../components/RankingEntryForm';
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
  onHome,
}: {
  result?: DeliveryResult | null;
  onRetry?: () => void;
  onHome?: () => void;
}) {
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(playStampSound, 260);
    return () => window.clearTimeout(timer);
  }, [result]);
  if (!result)
    return (
      <section>
        <p className="eyebrow">配送伝票</p>
        <h1>まだ伝票がありません</h1>
        <p>届け先まで荷物を運ぶと、ここに配送伝票が届きます。</p>
      </section>
    );

  const score = computeScore(result);
  const deliveryDate = new Date(result.finishedAt)
    .toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Tokyo',
    })
    .replaceAll('/', '.');
  return (
    <section className="result-page">
      <article className="delivery-slip" aria-label="配送完了伝票">
        <header className="slip-header">
          <span className="slip-title">配送完了伝票</span>
          <span className="slip-number">
            No. {slipNumber(result.finishedAt)}
          </span>
        </header>
        <dl className="slip-rows">
          <div>
            <dt>お届け日</dt>
            <dd>
              <time
                key={result.finishedAt}
                className="slip-date-stamp"
                dateTime={deliveryDate.replaceAll('.', '-')}
                aria-label={`配達完了日 ${deliveryDate}`}
              >
                <span className="slip-date-stamp-heading">配達完了</span>
                <strong>{deliveryDate}</strong>
                <span className="slip-date-stamp-office">Bodrive</span>
              </time>
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
      {/* 同じ結果で二重に登録しないよう、結果ごとに作り直す */}
      <RankingEntryForm key={result.finishedAt} result={result} />
      <div className="result-actions">
        {onRetry && (
          <Button className="primary-button" onClick={onRetry}>
            もう一度配達する
          </Button>
        )}
        {onHome && <Button onClick={onHome}>受付に戻る</Button>}
      </div>
    </section>
  );
}

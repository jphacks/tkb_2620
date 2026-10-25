import { formatTime } from '../game/lap';
import type { RankingEntry } from '../db/courseRow';

/** コース別TOP3（#29）：順位・名前・スコア・タイム・残り荷物数。highlight は今登録した順位（1〜3） */
export function RankingTable({
  entries,
  highlight,
}: {
  entries: readonly RankingEntry[];
  highlight?: number | null;
}) {
  if (!entries.length)
    return <p className="ranking-empty">まだ配達記録はありません。</p>;
  return (
    <ol className="ranking-table">
      {entries.map((entry, index) => (
        <li
          key={`${entry.createdAt}-${index}`}
          className={highlight === index + 1 ? 'mine' : undefined}
        >
          <span className="ranking-place">{index + 1}位</span>
          <span className="ranking-name">{entry.displayName}</span>
          <span className="ranking-score">{entry.score}点</span>
          <span className="ranking-time">
            {formatTime(entry.clearTimeMs / 1000)}
          </span>
          <span className="ranking-cargo">
            積荷 {entry.remainingCargo}/{entry.cargoTotal}
          </span>
        </li>
      ))}
    </ol>
  );
}

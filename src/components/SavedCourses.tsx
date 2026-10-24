import { useEffect, useState } from 'react';
import { Button } from './Button';
import { CourseThumbnail } from './CourseThumbnail';
import { RankingTable } from './RankingTable';
import {
  isDatabaseConfigured,
  listCourses,
  listTopRankings,
} from '../db/supabase';
import type { RankingEntry, SavedCourse } from '../db/courseRow';
import {
  FORGOTTEN_AFTER_DAYS,
  memoryScore,
  sortByMemory,
  timeAgo,
} from '../game/memoryScore';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      courses: SavedCourse[];
      rankings: Map<string, RankingEntry[]>;
    };

/**
 * 保存したコースの一覧（#25 #28）。思い出度（Memory Score、#30）の高い順に並べ（#31）、
 * コースごとのTOP3を出す（#29）。31日遊ばれないコースはDBで一覧から外れる（#32）。
 */
export function SavedCourses({
  onPlay,
}: {
  onPlay: (course: SavedCourse) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  // 思い出度は時間で下がるので、1分ごとに描き直す
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isDatabaseConfigured) return;
    let cancelled = false;
    listCourses()
      .then(async (courses) => {
        // ランキングが読めなくても一覧は出す
        const rankings = await listTopRankings(courses.map((c) => c.id)).catch(
          () => new Map<string, RankingEntry[]>(),
        );
        if (!cancelled) setState({ kind: 'ready', courses, rankings });
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setState({
            kind: 'error',
            message:
              cause instanceof Error
                ? cause.message
                : 'コースを読み込めませんでした。',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (!isDatabaseConfigured)
    return (
      <div className="card saved-courses">
        <h2>思い出のコース</h2>
        <p>
          データベースの接続先が設定されていません。.env に VITE_SUPABASE_URL と
          VITE_SUPABASE_PUBLISHABLE_KEY（Publishable
          key）を入れると、作ったコースを保存して、また遊べます。
        </p>
      </div>
    );

  return (
    <div className="card saved-courses">
      <h2>思い出のコース</h2>
      <p className="saved-courses-note">
        遊ぶほど思い出に残り、遊ばないと少しずつ忘れていきます（エビングハウスの忘却曲線）。
        {FORGOTTEN_AFTER_DAYS}日遊ばれないコースは一覧から消えます。
      </p>
      {state.kind === 'loading' && <p>読み込み中…</p>}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <Button
            onClick={() => {
              setState({ kind: 'loading' });
              setReload((n) => n + 1);
            }}
          >
            もう一度読み込む
          </Button>
        </>
      )}
      {state.kind === 'ready' &&
        (state.courses.length ? (
          <ul className="saved-course-list">
            {sortByMemory(state.courses, now).map((course) => {
              const memory = memoryScore(course, now);
              return (
                <li key={course.id} className="saved-course">
                  <CourseThumbnail course={course.data} />
                  <div className="saved-course-body">
                    <p className="saved-course-name">{course.name}</p>
                    <div
                      className="memory-meter"
                      role="meter"
                      aria-label="思い出度"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(memory)}
                    >
                      <span
                        style={{
                          width: `${memory}%`,
                          background: course.data.themeColor,
                        }}
                      />
                    </div>
                    <small>
                      思い出度 {Math.round(memory)} ・ 最後に遊んだ{' '}
                      {timeAgo(course.lastPlayedAt ?? course.createdAt, now)} ・{' '}
                      {course.playCount}回
                    </small>
                    <RankingTable
                      entries={state.rankings.get(course.id) ?? []}
                      compact
                    />
                  </div>
                  <Button onClick={() => onPlay(course)}>
                    このコースで遊ぶ
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>
            まだ保存したコースはありません。「写真」からコースを作ってみよう。
          </p>
        ))}
    </div>
  );
}

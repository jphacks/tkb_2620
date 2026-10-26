import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './Button';
import { CourseThumbnail } from './CourseThumbnail';
import { RankingTable } from './RankingTable';
import {
  isDatabaseConfigured,
  listCourses,
  listTopRankings,
} from '../db/supabase';
import {
  SAMPLE_COURSE_ID,
  type RankingEntry,
  type SavedCourse,
} from '../db/courseRow';
import {
  memoryFade,
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
 * 遊ばれていないコースほどカードを色あせさせる（数字は出さない）。コースごとのTOP3を出す（#29）。
 * 31日遊ばれないコースはDBから消える（#32）。サンプルは忘れられないので、色あせさせず最後に置く。
 */
export function SavedCourses({
  onPlay,
}: {
  onPlay: (course: SavedCourse) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [rankingFor, setRankingFor] = useState<SavedCourse | null>(null);
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
            {[
              ...sortByMemory(
                state.courses.filter((c) => c.id !== SAMPLE_COURSE_ID),
                now,
              ),
              ...state.courses.filter((c) => c.id === SAMPLE_COURSE_ID),
            ].map((course) => {
              const isSample = course.id === SAMPLE_COURSE_ID;
              const fade = isSample ? 0 : memoryFade(memoryScore(course, now));
              return (
                <li
                  key={course.id}
                  className={isSample ? 'saved-course sample' : 'saved-course'}
                  style={{ '--fade': fade } as CSSProperties}
                >
                  <CourseThumbnail course={course.data} />
                  {course.comment && (
                    <p className="saved-course-comment">{course.comment}</p>
                  )}
                  <div className="saved-course-body">
                    <p className="saved-course-name">
                      {course.name}
                      {isSample && (
                        <span className="saved-course-tag">おためし便</span>
                      )}
                    </p>
                    <dl className="saved-course-meta">
                      {!isSample && (
                        <div>
                          <dt>最後の配達</dt>
                          <dd>
                            {timeAgo(
                              course.lastPlayedAt ?? course.createdAt,
                              now,
                            )}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>配達回数</dt>
                        <dd>{course.playCount}回</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="saved-course-actions">
                    <Button
                      className="saved-course-ranking"
                      onClick={() => setRankingFor(course)}
                    >
                      ランキング
                    </Button>
                    <Button
                      className="saved-course-play"
                      onClick={() => onPlay(course)}
                    >
                      再配達する
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>まだコースがありません。</p>
        ))}
      {rankingFor && state.kind === 'ready' && (
        <CourseRankingDialog
          courseName={rankingFor.name}
          entries={state.rankings.get(rankingFor.id) ?? []}
          onClose={() => setRankingFor(null)}
        />
      )}
    </div>
  );
}

/** コースごとのTOP3を、チーム名を省略せずに見せるポップアップ */
function CourseRankingDialog({
  courseName,
  entries,
  onClose,
}: {
  courseName: string;
  entries: readonly RankingEntry[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ranking-popup course-ranking"
      aria-labelledby="course-ranking-title"
      onClose={onClose}
      onClick={(event) => {
        // 枠の外（背景）を押したら閉じる
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="ranking-popup-sheet">
        <p className="ranking-popup-stamp">TOP3</p>
        <h2 id="course-ranking-title">{courseName}</h2>
        <RankingTable entries={entries} />
        <div className="ranking-popup-actions">
          <span />
          <button
            type="button"
            className="primary-button"
            onClick={() => dialog.current?.close()}
          >
            閉じる
          </button>
        </div>
      </div>
    </dialog>
  );
}

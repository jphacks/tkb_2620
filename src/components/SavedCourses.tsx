import { useEffect, useState } from 'react';
import { Button } from './Button';
import { isDatabaseConfigured, listCourses } from '../db/supabase';
import type { SavedCourse } from '../db/courseRow';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; courses: SavedCourse[] };

/**
 * 保存したコースの一覧（Issue #25）。選ぶとそのコースでゲームを始める。
 * 並び替え（Memory Score）や見た目の作り込みは #28 #31 で行う。
 */
export function SavedCourses({
  onPlay,
}: {
  onPlay: (course: SavedCourse) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isDatabaseConfigured) return;
    let cancelled = false;
    listCourses()
      .then((courses) => {
        if (!cancelled) setState({ kind: 'ready', courses });
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
        <h2>保存したコース</h2>
        <p>
          データベースの接続先が設定されていません。.env に VITE_SUPABASE_URL と
          VITE_SUPABASE_ANON_KEY
          を入れると、作ったコースを保存して、また遊べます。
        </p>
      </div>
    );

  return (
    <div className="card saved-courses">
      <h2>保存したコース</h2>
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
            {state.courses.map((course) => (
              <li key={course.id}>
                <span
                  className="saved-course-swatch"
                  style={{ background: course.data.themeColor }}
                  aria-hidden="true"
                />
                <span className="saved-course-name">{course.name}</span>
                <small>
                  {course.playCount}回 ・{' '}
                  {new Date(course.createdAt).toLocaleDateString('ja-JP')}
                </small>
                <Button onClick={() => onPlay(course)}>このコースで遊ぶ</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            まだ保存したコースはありません。「写真」からコースを作ってみよう。
          </p>
        ))}
    </div>
  );
}

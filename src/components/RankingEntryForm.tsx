import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { RankingTable } from './RankingTable';
import {
  DISPLAY_NAME_MAX,
  entersTopRankings,
  normalizeDisplayName,
  type RankingEntry,
} from '../db/courseRow';
import {
  isDatabaseConfigured,
  listTopRankings,
  submitRanking,
} from '../db/supabase';
import { computeScore, type DeliveryResult } from '../game/score';

const NAME_STORAGE = 'bodrive:display-name';
/** 旧名（BODY ROAD）のころのキー。覚えていた名前は新しいキーへ引き継ぐ */
const OLD_NAME_STORAGE = 'body-road:display-name';

function rememberedName() {
  try {
    const name =
      localStorage.getItem(NAME_STORAGE) ??
      localStorage.getItem(OLD_NAME_STORAGE) ??
      '';
    if (name && localStorage.getItem(NAME_STORAGE) === null) {
      localStorage.setItem(NAME_STORAGE, name);
      localStorage.removeItem(OLD_NAME_STORAGE);
    }
    return name;
  } catch {
    return '';
  }
}

type State =
  | { kind: 'checking' }
  | { kind: 'outside' }
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; rank: number | null; top: RankingEntry[] };

/**
 * 結果画面のあと、TOP3 に入る記録だけポップアップでチーム名の登録をすすめる（#29 #26）。
 * 入らない記録・保存できていないコースでは何も出さない。
 */
export function RankingEntryForm({ result }: { result: DeliveryResult }) {
  const [name, setName] = useState(rememberedName);
  const [state, setState] = useState<State>({ kind: 'checking' });
  const dialog = useRef<HTMLDialogElement>(null);
  const courseId = result.courseId;
  const score = computeScore(result).total;
  const clearTimeMs = Math.round(result.time * 1000);

  // 今の TOP3 を読み、入るときだけ開く。伝票のスタンプを見せてから出す
  useEffect(() => {
    if (!isDatabaseConfigured || !courseId) return;
    let cancelled = false;
    let timer = 0;
    listTopRankings([courseId])
      .then((map) => {
        if (cancelled) return;
        const top = map.get(courseId) ?? [];
        if (!entersTopRankings(top, score, clearTimeMs)) {
          setState({ kind: 'outside' });
          return;
        }
        setState({ kind: 'idle' });
        timer = window.setTimeout(() => dialog.current?.showModal(), 1200);
      })
      .catch(() => {
        // ランキングが読めないときは、すすめずに伝票だけにする
        if (!cancelled) setState({ kind: 'outside' });
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [courseId, score, clearTimeMs]);

  if (!isDatabaseConfigured || !courseId) return null;
  if (state.kind === 'checking' || state.kind === 'outside') return null;

  const trimmed = normalizeDisplayName(name);
  return (
    <dialog
      ref={dialog}
      className="ranking-popup"
      aria-labelledby="ranking-popup-title"
    >
      <div className="ranking-popup-sheet">
        {state.kind === 'done' ? (
          <>
            <p className="ranking-popup-stamp">
              {state.rank ? `${state.rank}位` : '登録'}
            </p>
            <h2 id="ranking-popup-title">
              {state.rank
                ? `配達ランキング ${state.rank}位に登録しました`
                : 'ほかのチームが先にTOP3に入りました'}
            </h2>
            <RankingTable entries={state.top} highlight={state.rank} />
            <Button
              className="primary-button"
              onClick={() => dialog.current?.close()}
            >
              閉じる
            </Button>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!trimmed || state.kind === 'sending') return;
              setState({ kind: 'sending' });
              try {
                localStorage.setItem(NAME_STORAGE, trimmed);
              } catch {
                /* 名前を覚えられなくても登録はできる */
              }
              try {
                const rank = await submitRanking({
                  courseId,
                  displayName: trimmed,
                  score,
                  clearTimeMs,
                  remainingCargo: result.cargoRemaining,
                  cargoTotal: result.cargoTotal,
                });
                const top =
                  (await listTopRankings([courseId])).get(courseId) ?? [];
                setState({ kind: 'done', rank, top });
              } catch (cause) {
                setState({
                  kind: 'error',
                  message:
                    cause instanceof Error
                      ? cause.message
                      : '登録できませんでした。',
                });
              }
            }}
          >
            <p className="ranking-popup-stamp">TOP3</p>
            <h2 id="ranking-popup-title">配達ランキングに入りました！</h2>
            <label className="ranking-popup-field">
              チーム名
              <input
                value={name}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="例：あやか＆ゆりえ"
                autoFocus
                onChange={(event) => setName(event.target.value)}
                disabled={state.kind === 'sending'}
              />
              <small className="ranking-popup-note">
                チーム名はランキングに公開され、ほかの人にも表示されます。
              </small>
            </label>
            {state.kind === 'error' && <p role="alert">{state.message}</p>}
            <div className="ranking-popup-actions">
              <button
                type="button"
                className="link-button back"
                onClick={() => dialog.current?.close()}
              >
                登録しない
              </button>
              <Button
                type="submit"
                className="primary-button"
                disabled={!trimmed || state.kind === 'sending'}
              >
                {state.kind === 'sending' ? '登録中…' : '登録する'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

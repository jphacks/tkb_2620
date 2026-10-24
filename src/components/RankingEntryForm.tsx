import { useState } from 'react';
import { Button } from './Button';
import { RankingTable } from './RankingTable';
import {
  DISPLAY_NAME_MAX,
  normalizeDisplayName,
  type RankingEntry,
} from '../db/courseRow';
import {
  isDatabaseConfigured,
  listTopRankings,
  submitRanking,
} from '../db/supabase';
import { computeScore, type DeliveryResult } from '../game/score';

const NAME_STORAGE = 'body-road:display-name';

function rememberedName() {
  try {
    return localStorage.getItem(NAME_STORAGE) ?? '';
  } catch {
    return '';
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; rank: number | null; top: RankingEntry[] };

/** 結果画面：名前を入れてコース別ランキングに登録し、順位とTOP3を見せる（#29） */
export function RankingEntryForm({ result }: { result: DeliveryResult }) {
  const [name, setName] = useState(rememberedName);
  const [state, setState] = useState<State>({ kind: 'idle' });

  if (!isDatabaseConfigured) return null;
  if (!result.courseId)
    return (
      <p className="ranking-note">
        このコースは保存できていないため、ランキングには登録できません。
      </p>
    );
  const courseId = result.courseId;

  if (state.kind === 'done')
    return (
      <div className="ranking-result card">
        <h2>
          {state.rank
            ? `${state.rank}位でランクイン！`
            : 'TOP3には届きませんでした'}
        </h2>
        <RankingTable entries={state.top} highlight={state.rank} />
      </div>
    );

  const trimmed = normalizeDisplayName(name);
  return (
    <form
      className="ranking-form card"
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
            score: computeScore(result).total,
            clearTimeMs: result.time * 1000,
            remainingCargo: result.cargoRemaining,
            cargoTotal: result.cargoTotal,
          });
          const top = (await listTopRankings([courseId])).get(courseId) ?? [];
          setState({ kind: 'done', rank, top });
        } catch (cause) {
          setState({
            kind: 'error',
            message:
              cause instanceof Error ? cause.message : '登録できませんでした。',
          });
        }
      }}
    >
      <h2>ランキングに登録</h2>
      <label>
        なまえ
        <input
          value={name}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={`${DISPLAY_NAME_MAX}文字まで`}
          onChange={(event) => setName(event.target.value)}
          disabled={state.kind === 'sending'}
        />
      </label>
      <Button type="submit" disabled={!trimmed || state.kind === 'sending'}>
        {state.kind === 'sending' ? '登録中…' : '登録する'}
      </Button>
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
    </form>
  );
}

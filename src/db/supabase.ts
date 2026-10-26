/**
 * Supabase との通信（Issue #25）。ライブラリは使わず、Supabase の REST API を fetch で呼ぶ。
 * 接続先と公開キーは .env の VITE_SUPABASE_URL・VITE_SUPABASE_PUBLISHABLE_KEY
 * （Project Settings → API Keys の Publishable key、sb_publishable_...）。
 * 旧形式の anon キー（VITE_SUPABASE_ANON_KEY、eyJ... の JWT）でも動く。
 * Secret key（sb_secret_...）・service_role キーは絶対に入れない（ブラウザに公開されるため）。
 */
import type { CourseData } from '../../shared/course';
import {
  fromRow,
  groupTopRankings,
  normalizeDisplayName,
  toInsertRow,
  type CourseRow,
  type RankingEntry,
  type RankingRow,
  type SavedCourse,
} from './courseRow';

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const API_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';
/** 旧形式の anon キーは JWT。新形式の Publishable key は JWT ではない */
const IS_LEGACY_JWT_KEY = API_KEY.startsWith('eyJ');

/** .env に接続先が書かれているか。なければ保存・一覧は使わずに遊べる */
export const isDatabaseConfigured = Boolean(URL_BASE && API_KEY);

const COURSE_COLUMNS =
  'id,name,comment,course_points,wall_color_stops,theme_color,road_width,capture_mode,play_count,created_at,last_played_at';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isDatabaseConfigured)
    throw new Error('データベースの接続先が設定されていません。');
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      // 新形式のキーは apikey ヘッダーだけで渡す（Authorization に入れると JWT として拒否される）
      apikey: API_KEY,
      ...(IS_LEGACY_JWT_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    // 詳しい内容は開発者向けにコンソールへ。画面にはDBの生のエラーを出さない
    const detail = await response.text().catch(() => '');
    console.error('Supabase request failed', response.status, detail);
    throw new Error(
      `データベースとの通信に失敗しました（${response.status}）。時間をおいて、もう一度お試しください。`,
    );
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 完成したコースを保存し、DB が決めた id などを含めて返す */
export async function saveCourse(
  data: CourseData,
  name: string,
  comment?: string,
): Promise<SavedCourse> {
  const rows = await request<CourseRow[]>(`courses?select=${COURSE_COLUMNS}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(toInsertRow(data, name, comment)),
  });
  const saved = rows?.[0] && fromRow(rows[0]);
  if (!saved) throw new Error('保存したコースを読み直せませんでした。');
  return saved;
}

/** 保存済みのコース（公開中のもの）を、最後に遊ばれた順・新しい順に返す。壊れた行は除く */
export async function listCourses(limit = 50): Promise<SavedCourse[]> {
  const rows = await request<CourseRow[]>(
    `courses?select=${COURSE_COLUMNS}&order=last_played_at.desc.nullslast,created_at.desc&limit=${limit}`,
  );
  return (rows ?? []).flatMap((row) => fromRow(row) ?? []);
}

/** 1件読み込む。見つからない・壊れていれば null */
export async function loadCourse(id: string): Promise<SavedCourse | null> {
  const rows = await request<CourseRow[]>(
    `courses?select=${COURSE_COLUMNS}&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows?.[0] ? fromRow(rows[0]) : null;
}

/** 遊び始めたことを記録する（プレイ回数と最終プレイ日時、#30 の Memory Score に使う） */
/** どのコースで遊んだか（遊ばれた回数の記録、play_events） */
export type PlaySource = 'photo' | 'memory' | 'sample';
/** どうやって操作したか */
export type PlayController = 'phones' | 'keyboard';

/** 走り出したことを記録し、記録の番号を返す。DBが使えない・失敗したら null（ゲームは止めない） */
export async function logPlayStart(
  courseId: string | null,
  source: PlaySource,
  controller: PlayController,
): Promise<number | null> {
  if (!isDatabaseConfigured) return null;
  try {
    const id = await request<number>('rpc/log_play_start', {
      method: 'POST',
      body: JSON.stringify({
        p_course_id: courseId,
        p_course_source: source,
        p_controller: controller,
      }),
    });
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

/** ゴールしたことを記録する。失敗しても何もしない */
export async function logPlayFinish(id: number | null): Promise<void> {
  if (id === null || !isDatabaseConfigured) return;
  try {
    await request<null>('rpc/log_play_finish', {
      method: 'POST',
      body: JSON.stringify({ p_id: id }),
    });
  } catch {
    // 記録できなくても遊びには関係ない
  }
}

export async function recordPlay(id: string): Promise<void> {
  await request<null>('rpc/record_play', {
    method: 'POST',
    body: JSON.stringify({ p_course_id: id }),
  });
}

/** いくつかのコースのTOP3をまとめて読む（#29）。コースの id → 上位3件 */
export async function listTopRankings(
  courseIds: readonly string[],
): Promise<Map<string, RankingEntry[]>> {
  if (!courseIds.length) return new Map();
  const ids = courseIds.map(encodeURIComponent).join(',');
  const rows = await request<RankingRow[]>(
    `rankings?select=course_id,display_name,score,clear_time_ms,remaining_cargo,cargo_total,created_at&course_id=in.(${ids})&order=score.desc,clear_time_ms.asc,created_at.asc&limit=${courseIds.length * 3}`,
  );
  return groupTopRankings(rows ?? []);
}

/** ゴールの記録を登録する（#29）。TOP3 に入れば順位（1〜3）、入らなければ null */
export async function submitRanking(entry: {
  courseId: string;
  displayName: string;
  score: number;
  clearTimeMs: number;
  remainingCargo: number;
  cargoTotal: number;
}): Promise<number | null> {
  const name = normalizeDisplayName(entry.displayName);
  if (!name) throw new Error('名前を入れてください。');
  return request<number | null>('rpc/submit_ranking', {
    method: 'POST',
    body: JSON.stringify({
      p_course_id: entry.courseId,
      p_display_name: name,
      p_score: Math.round(entry.score),
      p_clear_time_ms: Math.max(1, Math.round(entry.clearTimeMs)),
      p_remaining_cargo: entry.remainingCargo,
      p_cargo_total: entry.cargoTotal,
    }),
  });
}

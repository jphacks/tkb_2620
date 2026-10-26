/**
 * DBの courses の行と、ゲームのコース（CourseData）の変換（Issue #25）。
 * 通信やブラウザに依存しないので、テストできる。列名は docs/course-data.md の対応表のとおり。
 */
import type { CourseData } from '../../shared/course';
import { validateCourseData } from '../game/safety.ts';

/** サンプルの楕円コース。DBにこのIDで常に入っている（supabase/migrations、#23 #24） */
export const SAMPLE_COURSE_ID = '00000000-0000-4000-8000-000000000001';
/** コース名の上限（完成画面と DB の制約に合わせる） */
export const COURSE_NAME_MAX = 20;
export const UNNAMED_COURSE = 'なまえのないコース';
/** コースに一言の上限。思い出のコースのカードの吹き出しに2行で収まる長さ */
export const COURSE_COMMENT_MAX = 30;

/** courses テーブルの1行（読むとき） */
export type CourseRow = {
  id: string;
  name: string;
  course_points: unknown;
  wall_color_stops: unknown;
  theme_color: string;
  road_width: number;
  capture_mode: string;
  /** コースに一言（どんなときの写真か）。書かなければ null */
  comment?: string | null;
  play_count: number;
  created_at: string;
  last_played_at: string | null;
};

/** 保存したコース。画面ではこの形で扱う */
export type SavedCourse = {
  id: string;
  name: string;
  /** コースに一言。なければ null */
  comment: string | null;
  data: CourseData;
  playCount: number;
  createdAt: string;
  lastPlayedAt: string | null;
};

/** 名前の前後の空白を除き、空なら既定の名前、長ければ切る */
export function normalizeCourseName(name: string): string {
  const trimmed = [...(name ?? '').trim()].slice(0, COURSE_NAME_MAX).join('');
  return trimmed || UNNAMED_COURSE;
}

/** 一言の前後の空白と改行を除き、30文字に切る。空なら null（書かなかった） */
export function normalizeCourseComment(comment?: string | null): string | null {
  const trimmed = [...(comment ?? '').replace(/\s+/g, ' ').trim()]
    .slice(0, COURSE_COMMENT_MAX)
    .join('');
  return trimmed || null;
}

/** 保存するときに送る列。id・回数・日時・status は DB が決める。元の写真は送らない */
export function toInsertRow(data: CourseData, name: string, comment?: string) {
  const note = normalizeCourseComment(comment);
  return {
    name: normalizeCourseName(name),
    // 一言は書いたときだけ送る
    ...(note ? { comment: note } : {}),
    course_points: data.points.map(({ x, z }) => ({ x, z })),
    wall_color_stops: data.wallColorStops.map(({ progress, color }) => ({
      progress,
      color,
    })),
    theme_color: data.themeColor,
    road_width: data.roadWidth,
    capture_mode: data.captureMode,
  };
}

/** DB の行をゲームのコースに戻す。壊れていれば null（ゲームに渡さない、#22） */
export function fromRow(row: CourseRow): SavedCourse | null {
  if (!row || typeof row.id !== 'string') return null;
  const data = {
    points: row.course_points,
    wallColorStops: row.wall_color_stops,
    themeColor: row.theme_color,
    roadWidth: Number(row.road_width),
    captureMode: row.capture_mode,
  } as CourseData;
  if (validateCourseData(data)) return null;
  return {
    id: row.id,
    name: row.name,
    comment: normalizeCourseComment(row.comment),
    data,
    playCount: row.play_count ?? 0,
    createdAt: row.created_at,
    lastPlayedAt: row.last_played_at ?? null,
  };
}

/** rankings テーブルの1行（読むとき） */
export type RankingRow = {
  course_id: string;
  display_name: string;
  score: number;
  clear_time_ms: number;
  remaining_cargo: number;
  cargo_total: number;
  created_at: string;
};

/** ランキングの1件。画面ではこの形で扱う */
export type RankingEntry = {
  displayName: string;
  score: number;
  clearTimeMs: number;
  remainingCargo: number;
  cargoTotal: number;
  createdAt: string;
};

/** ランキングの名前の上限（DB の制約に合わせる） */
export const DISPLAY_NAME_MAX = 16;

/** チーム名の前後の空白を除き、16文字に切る。空なら空文字（登録させない） */
export function normalizeDisplayName(name: string): string {
  return [...(name ?? '').trim()].slice(0, DISPLAY_NAME_MAX).join('');
}

/** コースごとに分け、スコアが高い→タイムが短い→先に出した順に上位3件にする（#29） */
export function groupTopRankings(
  rows: readonly RankingRow[],
): Map<string, RankingEntry[]> {
  const byCourse = new Map<string, RankingEntry[]>();
  const sorted = [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      a.clear_time_ms - b.clear_time_ms ||
      Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  for (const row of sorted) {
    const list = byCourse.get(row.course_id) ?? [];
    if (list.length < 3)
      list.push({
        displayName: row.display_name,
        score: row.score,
        clearTimeMs: row.clear_time_ms,
        remainingCargo: row.remaining_cargo,
        cargoTotal: row.cargo_total,
        createdAt: row.created_at,
      });
    byCourse.set(row.course_id, list);
  }
  return byCourse;
}

/**
 * この記録が今の TOP3 に入るか（#29）。3件未満なら必ず入る。
 * 並びは groupTopRankings と同じ：スコアが高い→タイムが短い（同点同タイムは先に出した記録が上なので入らない）。
 */
export function entersTopRankings(
  top: readonly Pick<RankingEntry, 'score' | 'clearTimeMs'>[],
  score: number,
  clearTimeMs: number,
): boolean {
  if (top.length < 3) return true;
  const third = top[2];
  return (
    score > third.score ||
    (score === third.score && clearTimeMs < third.clearTimeMs)
  );
}

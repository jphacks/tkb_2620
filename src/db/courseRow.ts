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

/** courses テーブルの1行（読むとき） */
export type CourseRow = {
  id: string;
  name: string;
  course_points: unknown;
  wall_color_stops: unknown;
  theme_color: string;
  road_width: number;
  capture_mode: string;
  play_count: number;
  created_at: string;
  last_played_at: string | null;
};

/** 保存したコース。画面ではこの形で扱う */
export type SavedCourse = {
  id: string;
  name: string;
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

/** 保存するときに送る列。id・回数・日時・status は DB が決める。元の写真は送らない */
export function toInsertRow(data: CourseData, name: string) {
  return {
    name: normalizeCourseName(name),
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
    data,
    playCount: row.play_count ?? 0,
    createdAt: row.created_at,
    lastPlayedAt: row.last_played_at ?? null,
  };
}

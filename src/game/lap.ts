/**
 * 周回とゴールの判定（Issue #19）。Three.js・画面に依存しない。
 *
 * コースの中心線に沿った「進み具合」を毎フレーム足し合わせ（前進で増え、逆走で減る）、
 * 一周分のほぼ全部が貯まった状態で、トラックの先端がSTARTラインを前向きに
 * 越えたときだけゴールにする。STARTラインの行き来や逆走ではゴールにならない。
 */
import { deliveryDestination } from './deliveryDestination.ts';
import type { CoursePoint } from '../../shared/course';

export type LapTrack = {
  points: CoursePoint[];
  /** 各点までの累積距離（points[0] が 0） */
  cumulative: number[];
  /** 一周の長さ（最後→最初の区間を含む） */
  length: number;
  roadWidth: number;
};

export type LapState = {
  /** 前回いた区間の番号（近くだけ探すため） */
  segment: number;
  /** 前回の中心線上の位置（0〜length） */
  position: number;
  /** STARTからの進み具合の合計（逆走で減る） */
  progress: number;
  /** 前回のトラック先端の、STARTラインからの前後位置（前が正） */
  frontAlong: number;
  finished: boolean;
};

/** ゴールに必要な進み具合（一周の割合）。先端が越える分と、内側を走る分の余裕 */
export const REQUIRED_LAP_RATIO = 0.75;
/** 前回の区間から前後この数だけ探す（近くの別の道に飛ばない） */
const SEARCH_WINDOW = 12;

export function createLapTrack(
  points: CoursePoint[],
  roadWidth: number,
): LapTrack {
  if (points.length < 3) throw new Error('コースの点が足りません。');
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(
      cumulative[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].z - points[i - 1].z,
        ),
    );
  const last = points[points.length - 1];
  const length =
    cumulative[points.length - 1] +
    Math.hypot(points[0].x - last.x, points[0].z - last.z);
  return { points, cumulative, length, roadWidth };
}

/** 区間 i（点 i → i+1）への最寄り点。中心線上の位置と距離を返す */
function project(track: LapTrack, i: number, p: CoursePoint) {
  const n = track.points.length;
  const a = track.points[i],
    b = track.points[(i + 1) % n];
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2),
  );
  const x = a.x + dx * t,
    z = a.z + dz * t;
  return {
    distance: Math.hypot(p.x - x, p.z - z),
    position: track.cumulative[i] + Math.sqrt(len2) * t,
  };
}

/** 中心線上でいちばん近い位置。around を渡すとその前後だけ探す */
export function locate(track: LapTrack, p: CoursePoint, around?: number) {
  const n = track.points.length;
  const candidates =
    around === undefined
      ? Array.from({ length: n }, (_, i) => i)
      : Array.from(
          { length: Math.min(n, SEARCH_WINDOW * 2 + 1) },
          (_, k) => (((around - SEARCH_WINDOW + k) % n) + n) % n,
        );
  let best = { segment: 0, distance: Infinity, position: 0 };
  for (const i of candidates) {
    const hit = project(track, i, p);
    if (hit.distance < best.distance) best = { segment: i, ...hit };
  }
  return best;
}

/** STARTラインに対する前後位置（前が正）と横ずれ */
function relativeToStart(track: LapTrack, p: CoursePoint, goalRatio = 1) {
  const goal =
    goalRatio < 1 ? deliveryDestination(track.points, goalRatio) : null;
  const a = goal ?? track.points[0];
  const b = goal
    ? { x: goal.x + goal.dx, z: goal.z + goal.dz }
    : track.points[1];
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / len,
    dz = (b.z - a.z) / len;
  const rx = p.x - a.x,
    rz = p.z - a.z;
  return { along: rx * dx + rz * dz, across: Math.abs(-rx * dz + rz * dx) };
}

export function startLap(
  track: LapTrack,
  center: CoursePoint,
  front: CoursePoint,
  goalRatio = 1,
): LapState {
  const hit = locate(track, center);
  return {
    segment: hit.segment,
    position: hit.position,
    progress: 0,
    frontAlong: relativeToStart(track, front, goalRatio).along,
    finished: false,
  };
}

/** 1フレーム分の移動を反映する。ゴールした瞬間に finished が true になる */
export function updateLap(
  track: LapTrack,
  state: LapState,
  center: CoursePoint,
  front: CoursePoint,
  goalRatio = 1,
): LapState {
  if (state.finished) return state;
  const hit = locate(track, center, state.segment);
  // 一周の継ぎ目（STARTの前後）をまたいでも、近い向きの差にする
  let delta = hit.position - state.position;
  if (delta > track.length / 2) delta -= track.length;
  if (delta < -track.length / 2) delta += track.length;
  const progress = state.progress + delta;
  const start = relativeToStart(track, front, goalRatio);
  const crossedForward =
    state.frontAlong < 0 &&
    start.along >= 0 &&
    start.across <= track.roadWidth / 2 + 0.5;
  return {
    segment: hit.segment,
    position: hit.position,
    progress,
    frontAlong: start.along,
    finished:
      crossedForward &&
      progress >= track.length * goalRatio * REQUIRED_LAP_RATIO,
  };
}

/** 秒を「分:秒.小数1桁」に */
export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  return `${minutes}:${(s - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

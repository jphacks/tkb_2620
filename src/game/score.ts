/**
 * 配送結果とスコア（Issue #21）。画面に依存しない。
 * 総合スコア = タイム点（50）＋ 積荷点（50）の100点満点。
 */
export type DeliveryResult = {
  courseName: string;
  /** 一周にかかった秒数 */
  time: number;
  /** コース一周の長さ（基準タイムの計算に使う） */
  courseLength: number;
  /** 残った積荷と、最初に積んだ数。積荷が未実装の間は total 0 */
  cargoRemaining: number;
  cargoTotal: number;
  /** ゴールした時刻（ミリ秒） */
  finishedAt: number;
};

/** 基準タイムの速さ。最高速（18）の2/3で一周した時間を満点の目安にする。#27で調整 */
export const PAR_SPEED = 12;
export const TIME_POINTS = 50;
export const CARGO_POINTS = 50;

export type Score = {
  total: number;
  timePoints: number;
  cargoPoints: number;
  /** 満点になるタイム（秒） */
  parTime: number;
  /** 積荷を数えているか（未実装の間は false で、積荷点は満点扱い） */
  cargoTracked: boolean;
};

export function computeScore(result: DeliveryResult): Score {
  const parTime = Math.max(result.courseLength / PAR_SPEED, 1);
  // 基準タイム以内なら満点、遅いほど（基準÷タイム）の割合で減る
  const timeRatio =
    result.time > 0 && Number.isFinite(result.time)
      ? Math.min(1, parTime / result.time)
      : 0;
  const cargoTracked = result.cargoTotal > 0;
  const cargoRatio = cargoTracked
    ? Math.max(0, Math.min(1, result.cargoRemaining / result.cargoTotal))
    : 1;
  const timePoints = Math.round(TIME_POINTS * timeRatio);
  const cargoPoints = Math.round(CARGO_POINTS * cargoRatio);
  return {
    total: timePoints + cargoPoints,
    timePoints,
    cargoPoints,
    parTime,
    cargoTracked,
  };
}

/** 伝票番号。ゴールした日時から作る（例: BR-20261024-1530-27） */
export function slipNumber(finishedAt: number): string {
  const d = new Date(finishedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `BR-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

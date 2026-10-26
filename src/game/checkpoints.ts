/**
 * お家までの道のりの 1/4・1/2・3/4 に置く看板と、どこまで進んだか。Three.js・画面に依存しない。
 *
 * お家は一周の DELIVERY_RATIO（約9割）の地点にあるので、看板は「お家までの道のり」を
 * 4つに分けた地点に置く。進み具合は周回判定（lap.ts）の progress（中心線に沿って前へ
 * 進んだ距離。逆走で減る）を使い、一番先まで進んだところを覚えておく。戻っても減らさない。
 */
import { DELIVERY_RATIO } from './deliveryDestination.ts';

export const CHECKPOINTS = [
  { ratio: 0.25, label: '1/4 通過', note: '安全運転で！' },
  { ratio: 0.5, label: '折り返し', note: '荷物は無事？' },
  { ratio: 0.75, label: 'あと少し', note: 'お家はもうすぐ' },
] as const;

/** 一周の長さから、各看板の中心線に沿った位置 */
export function checkpointPositions(length: number) {
  return CHECKPOINTS.map((c) => c.ratio * DELIVERY_RATIO * length);
}

/** お家までの道のりのうち、進んだ割合（0〜1） */
export function routeProgress(progress: number, length: number) {
  const route = DELIVERY_RATIO * length;
  if (!(route > 0) || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress / route));
}

/** 進んだ割合までに通過した看板の数 */
export function passedCheckpoints(route: number) {
  return CHECKPOINTS.filter((c) => route >= c.ratio).length;
}

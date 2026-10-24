/**
 * START地点の決定と周回方向の統一（Issue #7）。
 *
 * 入力は画像座標（左上原点・右が+x・下が+y）の閉じた輪郭。
 * 数学座標（上が+y）で「y最大＝最も上、同じ高さなら x最大＝最も右」をSTARTにする。
 * 画像座標では「yが最小、同じなら xが最大」。
 * 周回方向は docs/course-data.md に合わせ、真上（画面）から見て反時計回りにする。
 */
export type ContourPoint = { x: number; y: number };

// 輪郭は画素の縁から作るため同じ高さの点は完全に一致するが、計算誤差の分だけ許容する
const SAME_HEIGHT = 1e-9;

/** 画像座標での符号付き面積。負なら画面上で反時計回り、正なら時計回り。 */
export function signedImageArea(points: readonly ContourPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** START地点の番号。最も上（画像の y が最小）、同じ高さなら最も右（x が最大）。 */
export function findStartIndex(points: readonly ContourPoint[]): number {
  if (points.length === 0) throw new Error('輪郭の点がありません。');
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      b = points[best];
    if (
      p.y < b.y - SAME_HEIGHT ||
      (Math.abs(p.y - b.y) <= SAME_HEIGHT && p.x > b.x)
    )
      best = i;
  }
  return best;
}

/**
 * 反時計回りにそろえ、START地点が points[0] になるよう点列を回転した新しい配列を返す。
 * 点の座標と、各点に付いた他の値は変えない。入力の配列も変更しない。
 */
export function orderFromStart<T extends ContourPoint>(
  points: readonly T[],
): T[] {
  if (points.length < 3)
    throw new Error('輪郭の点が少なすぎてSTARTを決められません。');
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    throw new Error('輪郭に不正な座標が含まれています。');
  const area = signedImageArea(points);
  if (Math.abs(area) < 1e-12)
    throw new Error('輪郭に面積がないため、周回方向を決められません。');
  const ordered = area > 0 ? [...points].reverse() : [...points];
  const start = findStartIndex(ordered);
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

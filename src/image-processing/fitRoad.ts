/**
 * 道路が重ならない一本道に整える（Issue #10 のコース生成）。
 *
 * 写真の輪郭には指・指の間のすき間など、道幅より細かい形がある。そのまま道路にすると、
 * 細い部分の行きと帰りの道路や、すき間の両側の道路が重なってしまう。
 * そこでコースを格子に塗り、次の順に形を整えてから外周を取り直す。
 * 1. 膨張（grow）：細い部分を太らせ、細いすき間を埋める。出っ張った角（手先・足先）も半径 grow で丸くなる。
 * 2. 閉じる（膨張→収縮）：へこんだ角と残ったすき間を、半径 concaveRadius 以上に丸める。
 * 出っ張りを削る処理（開く）はしない。細い腕や手先が短くなり、人型に見えなくなるため。
 * 最後に軽く平滑化・等間隔化し、残った急カーブを補正する。
 */
import type { CoursePoint } from '../../shared/course';
import { correctSharpCurves } from './correctCurves.ts';
import type { CurveCheck } from './correctCurves';
import { extractOuterContour } from './extractContour.ts';
import type { OutlinePoint } from './extractContour';
import { smoothClosedContour } from './previewContour.ts';
import { resampleClosedContour } from './resampleContour.ts';

export type RoadFitOptions = {
  roadWidth: number;
  /** Grow the shape by this many game units: thin parts get thicker, narrow gaps close,
   * and outside corners round to this radius. */
  grow: number;
  /** Inside corners and gaps are rounded to at least this radius (game units). */
  concaveRadius: number;
  /** Remaining turns tighter than this are relaxed afterwards (game units). */
  minTurnRadius: number;
  /** How far that last relaxing may move a point (game units). */
  maxDisplacement: number;
};
export const DEFAULT_ROAD_FIT = {
  // With courseSize 110: the person stays recognizable and no turn is tighter than about 8.
  grow: 8,
  concaveRadius: 14,
  // The truck's turning radius; the shaping above already keeps most turns wider.
  minTurnRadius: 6,
  maxDisplacement: 2,
};
export type RoadFitResult = {
  points: CoursePoint[];
  curves: CurveCheck;
  warning?: string;
};

/** Even-odd fill of a closed polygon onto a grid of unit cells (cell centers). */
function rasterize(points: OutlinePoint[], width: number, height: number) {
  const grid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5,
      crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if (a.y <= cy !== b.y <= cy)
        crossings.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2)
      for (
        let x = Math.max(0, Math.ceil(crossings[k] - 0.5));
        x < Math.min(width, Math.ceil(crossings[k + 1] - 0.5));
        x++
      )
        grid[y * width + x] = 1;
  }
  return grid;
}

/** Dilate (grow) or erode (shrink) with a disk of the given radius in cells. */
function morph(
  grid: Uint8Array,
  width: number,
  height: number,
  radius: number,
  grow: boolean,
) {
  const r = Math.max(0, Math.round(radius));
  if (!r) return grid;
  const offsets: number[][] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy]);
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = grow ? 0 : 1;
      for (const [dx, dy] of offsets) {
        const nx = x + dx,
          ny = y + dy;
        const inside =
          nx >= 0 && ny >= 0 && nx < width && ny < height
            ? grid[ny * width + nx]
            : 0;
        if (grow ? inside : !inside) {
          value = grow ? 1 : 0;
          break;
        }
      }
      out[y * width + x] = value;
    }
  return out;
}

/** Reshape a game-space course into one non-overlapping loop with gentle curves.
 * The input runs counterclockwise from START; the output may start anywhere and
 * is re-aligned to START by the color mapping.
 */
export function fitRoad(
  course: readonly CoursePoint[],
  roadWidth: number,
  options: Partial<RoadFitOptions> = {},
): RoadFitResult {
  const o = { ...DEFAULT_ROAD_FIT, roadWidth, ...options };
  if (!(o.roadWidth > 0) || course.length < 3)
    throw new Error('道路を作るコースが不正です。');
  // One grid cell per game unit; leave room for growing.
  const margin = Math.ceil(o.grow + o.concaveRadius + o.roadWidth) + 2;
  const xs = course.map((p) => p.x),
    zs = course.map((p) => p.z);
  const left = Math.floor(Math.min(...xs)) - margin,
    top = Math.floor(Math.min(...zs)) - margin;
  const width = Math.ceil(Math.max(...xs)) + margin - left,
    height = Math.ceil(Math.max(...zs)) + margin - top;
  if (width * height > 4_000_000)
    throw new Error('コースが大きすぎて道路を作れません。');
  const shape = rasterize(
    course.map((p) => ({ x: p.x - left, y: p.z - top })),
    width,
    height,
  );
  const grown = morph(shape, width, height, o.grow, true);
  const closed = morph(
    morph(grown, width, height, o.concaveRadius, true),
    width,
    height,
    o.concaveRadius,
    false,
  );
  // Largest connected region only, so the road is a single loop.
  const outline = extractOuterContour(closed, width, height);
  const smoothed = smoothClosedContour(
    outline.map((p) => ({ x: p.x / width, y: p.y / height })),
    width,
    height,
    { iterations: 6, strength: 0.5 },
  ).points.map((p) => ({ x: p.x * width, y: p.y * height }));
  const spaced = resampleClosedContour(smoothed, o.roadWidth / 2);
  const corrected = correctSharpCurves(spaced, {
    minTurnRadius: o.minTurnRadius,
    maxCorrectionIterations: 30,
    maxDisplacement: o.maxDisplacement,
  });
  return {
    points: corrected.contour.points.map((p) => ({
      x: p.x + left,
      z: p.y + top,
    })),
    curves: corrected.after,
    warning: corrected.warning,
  };
}

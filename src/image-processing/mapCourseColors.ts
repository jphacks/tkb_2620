/**
 * 元輪郭の代表色を補正後コースへ対応づける（Issue #9）。
 *
 * 色の区間（Issue #8）は元輪郭上の距離割合 t（0〜1）で持つ。
 * 補正後コース（Issue #6）の各点にも始点からの距離割合 t を計算する。
 * 両方とも START から反時計回り（Issue #7）。補正後の各点は、元輪郭上で最も近い位置
 * （前の点の位置から先だけを探す）の距離割合 sourceT の色を受け取る。
 * 区間の境界だけ、区間の長さ×blendRatio の幅で隣の色と線形に混ぜる。
 */
import type { WallColorStop } from '../../shared/course';
import type { RGB, RepresentativeColor } from './extractColors';
import type { OutlinePoint } from './extractContour';
import { signedImageArea } from './normalizeContour.ts';

export const DEFAULT_COLOR_MAPPING = { blendRatio: 0.2 };
export type ColorMappingOptions = {
  /** Width of each boundary gradient, as a fraction of the shorter neighboring segment. */
  blendRatio: number;
};
export type CourseColorPoint = OutlinePoint & {
  /** Distance fraction from START along the course, 0 to 1. */
  t: number;
  /** Distance fraction on the original outline where this point's color comes from. */
  sourceT: number;
  rgb: RGB;
  color: string;
};
export type CourseColors = {
  points: CourseColorPoint[];
  /** Ready for CourseData: progress order, only where the color changes. */
  wallColorStops: WallColorStop[];
  /** The course was reversed to match the original direction. */
  reversed: boolean;
  /** The course was rotated by this many points to start where the original starts. */
  rotated: number;
  blendRatio: number;
};

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Distance fraction of each point from points[0], including the closing edge. */
export function distanceFractions(points: OutlinePoint[]): number[] {
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[points.length];
  if (!(total > 0)) throw new Error('コースの長さがありません。');
  return points.map((_, i) => cumulative[i] / total);
}

/** Reverse and rotate the course so it runs like the reference and starts at its points[0].
 * Both must use the same coordinates (e.g. meters on the photo).
 */
export function alignToReference<T extends OutlinePoint>(
  course: readonly T[],
  reference: readonly OutlinePoint[],
): { points: T[]; reversed: boolean; rotated: number } {
  if (course.length < 3 || reference.length < 3)
    throw new Error('輪郭の点が少なすぎて向きをそろえられません。');
  const reversed =
    Math.sign(signedImageArea(course)) !==
    Math.sign(signedImageArea(reference));
  // Reversing keeps points[0] first, so only the travel direction changes.
  const ordered = reversed
    ? [course[0], ...course.slice(1).reverse()]
    : [...course];
  const start = reference[0];
  let rotated = 0;
  ordered.forEach((p, i) => {
    const best = ordered[rotated];
    if (
      Math.hypot(p.x - start.x, p.y - start.y) <
      Math.hypot(best.x - start.x, best.y - start.y)
    )
      rotated = i;
  });
  return {
    points: [...ordered.slice(rotated), ...ordered.slice(0, rotated)],
    reversed,
    rotated,
  };
}

/**
 * For each course point, the distance fraction of the nearest place on the reference,
 * searched forward from the previous match. Plain fractions drift where the jagged
 * original and the smoothed course differ in length (staircase edges, rounded corners).
 */
export function matchToReference(
  course: readonly OutlinePoint[],
  reference: readonly OutlinePoint[],
  lookAhead = 0.25,
): number[] {
  const n = reference.length;
  const fractions = distanceFractions([...reference]);
  const endOf = (i: number) => (i + 1 < n ? fractions[i + 1] : 1);
  let previous = 0;
  return course.map((p, index) => {
    if (index === 0) return 0;
    let best = previous,
      bestDistance = Infinity;
    // Edges are visited in loop order starting from the one holding the previous match.
    let edge = fractions.findIndex(
      (t, i) => t <= previous && previous < endOf(i),
    );
    if (edge < 0) edge = n - 1;
    for (let k = 0; k < n; k++) {
      const i = (edge + k) % n,
        start = fractions[i] + (i < edge ? 1 : 0);
      if (start - previous > lookAhead) break;
      const a = reference[i],
        b = reference[(i + 1) % n],
        dx = b.x - a.x,
        dy = b.y - a.y,
        length2 = dx * dx + dy * dy;
      let ratio =
        length2 > 0
          ? Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2),
            )
          : 0;
      let t = start + (endOf(i) - fractions[i]) * ratio;
      // Never step backwards along the original.
      if (t < previous) {
        t = previous;
        ratio = (t - start) / (endOf(i) - fractions[i] || 1);
      }
      const distance = Math.hypot(
        a.x + dx * ratio - p.x,
        a.y + dy * ratio - p.y,
      );
      if (distance < bestDistance - 1e-9) {
        best = t;
        bestDistance = distance;
      }
    }
    previous = best;
    return best % 1;
  });
}

/** Color at distance fraction t, blending only near segment boundaries (closed loop). */
export function colorAt(
  segments: readonly RepresentativeColor[],
  t: number,
  blendRatio = DEFAULT_COLOR_MAPPING.blendRatio,
): RGB {
  const n = segments.length;
  const u = ((t % 1) + 1) % 1;
  let index = segments.findIndex((s) => u >= s.startT && u < s.endT);
  // Only rounding can leave t past the last endT; that belongs to the last segment.
  if (index < 0) index = n - 1;
  const segment = segments[index];
  const length = (s: RepresentativeColor) => s.endT - s.startT;
  // Distance to the nearer boundary of this segment, and the neighbor across it.
  const toStart = u - segment.startT,
    toEnd = segment.endT - u;
  const neighbor =
    toStart < toEnd ? segments[(index - 1 + n) % n] : segments[(index + 1) % n];
  const half = (blendRatio * Math.min(length(segment), length(neighbor))) / 2;
  const gap = Math.min(toStart, toEnd);
  if (n < 2 || half <= 0 || gap >= half) return [...segment.color] as RGB;
  // 0.5 on the boundary itself, rising to 1 (own color) at the edge of the blend zone.
  const own = 0.5 + gap / (2 * half);
  return segment.color.map((v, c) =>
    Math.round(v * own + neighbor.color[c] * (1 - own)),
  ) as RGB;
}

/**
 * 補正後コースの各点に色を割り当てる。
 * course と reference は同じ座標系（例：写真上のメートル）。reference[0] が START。
 */
export function mapCourseColors(
  segments: readonly RepresentativeColor[],
  course: readonly OutlinePoint[],
  reference: readonly OutlinePoint[],
  options: ColorMappingOptions = DEFAULT_COLOR_MAPPING,
): CourseColors {
  if (
    !Number.isFinite(options.blendRatio) ||
    options.blendRatio < 0 ||
    options.blendRatio > 1
  )
    throw new Error('グラデーションの幅は0〜1で指定してください。');
  if (!segments.length) throw new Error('人物の色がありません。');
  const sorted = [...segments].sort((a, b) => a.startT - b.startT);
  if (
    sorted.some(
      (s, i) =>
        !(s.endT > s.startT) ||
        (i > 0 && Math.abs(s.startT - sorted[i - 1].endT) > 1e-9),
    ) ||
    Math.abs(sorted[0].startT) > 1e-9 ||
    Math.abs(sorted[sorted.length - 1].endT - 1) > 1e-9
  )
    throw new Error('色の区間が0〜1を隙間なく覆っていません。');
  const aligned = alignToReference(
    course.map(({ x, y }) => ({ x, y })),
    reference,
  );
  const fractions = distanceFractions(aligned.points);
  const sources = matchToReference(aligned.points, reference);
  const points = aligned.points.map((p, i) => {
    const rgb = colorAt(sorted, sources[i], options.blendRatio);
    return {
      x: p.x,
      y: p.y,
      t: fractions[i],
      sourceT: sources[i],
      rgb,
      color: rgbToHex(rgb),
    };
  });
  // Keep both ends of each run of one color so the game interpolates only inside gradients.
  const wallColorStops = points
    .filter(
      (p, i) =>
        i === 0 ||
        i === points.length - 1 ||
        p.color !== points[i - 1].color ||
        p.color !== points[i + 1].color,
    )
    .map((p) => ({ progress: p.t, color: p.color }));
  return {
    points,
    wallColorStops,
    reversed: aligned.reversed,
    rotated: aligned.rotated,
    blendRatio: options.blendRatio,
  };
}

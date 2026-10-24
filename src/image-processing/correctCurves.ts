import { validateContour } from './extractContour.ts';
import type { OutlinePoint } from './extractContour';
import { resampleClosedContour } from './resampleContour.ts';
import type { ResampledContour } from './resampleContour';

export const DEFAULT_CURVE_CORRECTION = {
  minTurnRadius: 6.0,
  maxCorrectionIterations: 30,
  maxDisplacement: 3.0,
};
export type CurveCorrectionOptions = {
  /** Meters. Turns tighter than this are sharp. */
  minTurnRadius: number;
  maxCorrectionIterations: number;
  /** Meters from the uncorrected contour. */
  maxDisplacement: number;
};
export type CurveCheck = {
  /** Radius through points i-1, i, i+1 in meters; Infinity on a straight line. */
  radii: number[];
  /** Indices whose radius is below minTurnRadius. */
  sharp: number[];
  minRadius: number;
};
export type CurveCorrectionResult = {
  contour: ResampledContour;
  before: CurveCheck;
  after: CurveCheck;
  iterationsApplied: number;
  /** Largest distance of a corrected point from the uncorrected contour, meters. */
  maxShift: number;
  warning?: string;
};

/** Radius of the circle through three points. Infinity when they are collinear. */
export function circleRadius(
  a: OutlinePoint,
  b: OutlinePoint,
  c: OutlinePoint,
) {
  const ab = Math.hypot(b.x - a.x, b.y - a.y),
    bc = Math.hypot(c.x - b.x, c.y - b.y),
    ca = Math.hypot(a.x - c.x, a.y - c.y);
  const twiceArea = Math.abs(
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  );
  return twiceArea < 1e-12 ? Infinity : (ab * bc * ca) / (2 * twiceArea);
}

/** Local curvature of a closed contour from each run of three consecutive points. */
export function detectSharpCurves(
  points: OutlinePoint[],
  minTurnRadius = DEFAULT_CURVE_CORRECTION.minTurnRadius,
): CurveCheck {
  const n = points.length;
  const radii = points.map((p, i) =>
    circleRadius(points[(i - 1 + n) % n], p, points[(i + 1) % n]),
  );
  return {
    radii,
    sharp: radii.flatMap((r, i) => (r < minTurnRadius ? [i] : [])),
    minRadius: Math.min(...radii),
  };
}

function arcLengths(polygon: OutlinePoint[]) {
  const cumulative = [0];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cumulative;
}

/** Same loop starting at index `start`; t and distance are measured from the new start. */
function rotateContour(
  contour: ResampledContour,
  start: number,
): ResampledContour {
  const n = contour.points.length;
  return {
    ...contour,
    points: contour.points.map((_, i) => {
      const { x, y } = contour.points[(i + start) % n];
      return { x, y, t: i / n, distance: i * contour.actualSpacing };
    }),
  };
}

/** How far a check is from passing: tight turns weigh far more than near misses. */
function deficit(check: CurveCheck, minTurnRadius: number) {
  return check.sharp.reduce(
    (sum, i) => sum + minTurnRadius / Math.max(check.radii[i], 1e-6) - 1,
    0,
  );
}

/** Relax sharp curves on a resampled closed contour (meters).
 * Each iteration pulls points around sharp curves toward their neighbors' midpoint,
 * keeps every point within maxDisplacement of its own original position,
 * rejects self-intersections, then resamples at the original spacing and checks again.
 * Direction is kept, and points[0] is the corrected point at the original start.
 */
export function correctSharpCurves(
  contour: ResampledContour,
  options: CurveCorrectionOptions = DEFAULT_CURVE_CORRECTION,
): CurveCorrectionResult {
  if (
    !Number.isFinite(options.minTurnRadius) ||
    options.minTurnRadius <= 0 ||
    !Number.isInteger(options.maxCorrectionIterations) ||
    options.maxCorrectionIterations < 0 ||
    options.maxCorrectionIterations > 100 ||
    !Number.isFinite(options.maxDisplacement) ||
    options.maxDisplacement < 0
  )
    throw new Error('急カーブ補正の設定が範囲外です。');
  const original = contour.points.map(({ x, y }) => ({ x, y })),
    n = original.length,
    before = detectSharpCurves(original, options.minTurnRadius);
  // Points keep their index while being moved, so each is limited against its own original
  // position. Resampled copies are only for checking curvature and for the result.
  let moved = original,
    current = contour,
    check = before,
    step = 1,
    iterationsApplied = 0;
  let best = {
    moved,
    contour,
    check,
    score: deficit(check, options.minTurnRadius),
  };
  // A turn of radius R spans roughly R..2R of arc, so widen it over that many points.
  const window = Math.max(
    2,
    Math.round((options.minTurnRadius * 1.5) / contour.actualSpacing),
  );
  while (
    check.sharp.length &&
    iterationsApplied < options.maxCorrectionIterations &&
    step > 0.02
  ) {
    iterationsApplied++;
    // Map sharp points of the resampled check back to the moved points they lie between.
    const arc = arcLengths(moved),
      weight = new Float64Array(n);
    for (const j of check.sharp) {
      const d = current.points[j].t * arc[n];
      let index = 0;
      while (index < n - 1 && arc[index + 1] <= d) index++;
      for (let k = -window; k <= window; k++) {
        const i = (index + k + n) % n;
        weight[i] = Math.max(weight[i], 1 - Math.abs(k) / (window + 1));
      }
    }
    // Cap curvature: move each too-sharp point toward its neighbors' midpoint until the circle
    // through the three has the minimum radius. Repeating this spreads a corner into an arc.
    // Aim a little wider than required; resampling the arc tightens it slightly.
    const target = options.minTurnRadius * 1.25;
    let next = moved.map((p) => ({ ...p }));
    for (let pass = 0; pass < window * 4; pass++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        if (!weight[i]) continue;
        const a = next[(i - 1 + n) % n],
          b = next[i],
          c = next[(i + 1) % n];
        if (circleRadius(a, b, c) >= target) continue;
        const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 },
          half = Math.hypot(c.x - a.x, c.y - a.y) / 2,
          offset = Math.hypot(b.x - m.x, b.y - m.y);
        // Sagitta of an arc of the minimum radius over chord a-c.
        const sagitta =
          half < target ? target - Math.sqrt(target ** 2 - half ** 2) : 0;
        const goal =
          offset > 1e-12
            ? {
                x: m.x + ((b.x - m.x) * sagitta) / offset,
                y: m.y + ((b.y - m.y) * sagitta) / offset,
              }
            : m;
        next[i] = {
          x: b.x + (goal.x - b.x) * step * weight[i],
          y: b.y + (goal.y - b.y) * step * weight[i],
        };
        changed = true;
      }
      if (!changed) break;
    }
    next = next.map((p, i) => {
      const anchor = original[i],
        distance = Math.hypot(p.x - anchor.x, p.y - anchor.y);
      if (distance <= options.maxDisplacement) return p;
      const scale = options.maxDisplacement / distance;
      return {
        x: anchor.x + (p.x - anchor.x) * scale,
        y: anchor.y + (p.y - anchor.y) * scale,
      };
    });
    let resampled: ResampledContour | null = null;
    if (validateContour(next).valid)
      try {
        resampled = resampleClosedContour(next, contour.requestedSpacing);
      } catch {
        resampled = null;
      }
    if (!resampled) {
      // The move crossed the contour; retry the same curves more gently.
      step /= 2;
      continue;
    }
    moved = next;
    current = resampled;
    check = detectSharpCurves(current.points, options.minTurnRadius);
    const score = deficit(check, options.minTurnRadius);
    // Keep the best pass, and never one whose tightest turn is worse than the input's.
    if (score < best.score && check.minRadius >= before.minRadius)
      best = { moved, contour: current, check, score };
  }
  // Resampled points lie on segments between moved points, each within the limit of its
  // own original, so every result point is within the limit of the original chord.
  const maxShift = best.moved.reduce(
    (max, p, i) =>
      Math.max(max, Math.hypot(p.x - original[i].x, p.y - original[i].y)),
    0,
  );
  const result: CurveCorrectionResult = {
    contour: {
      ...rotateContour(best.contour, 0),
      metersPerPixel: contour.metersPerPixel,
      imageWidth: contour.imageWidth,
      imageHeight: contour.imageHeight,
    },
    before,
    after: best.check,
    iterationsApplied,
    maxShift,
  };
  if (best.check.sharp.length)
    result.warning = `半径${options.minTurnRadius}m未満の急カーブが${best.check.sharp.length}点残りました（最小半径${best.check.minRadius.toFixed(2)}m）。元の形から${options.maxDisplacement}m以内では補正しきれません。`;
  return result;
}

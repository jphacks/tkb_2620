import { validateContour } from './extractContour.ts';
import type { OutlinePoint } from './extractContour';

export const DEFAULT_SMOOTHING = { iterations: 3, strength: 0.4 };
export type SmoothingOptions = { iterations: number; strength: number };
export type SmoothingResult = {
  points: OutlinePoint[];
  iterationsApplied: number;
  warning?: string;
};

/** Aspect-correct, bounded smoothing; original points remain untouched. */
export function smoothClosedContour(
  points: OutlinePoint[],
  width: number,
  height: number,
  options: SmoothingOptions = DEFAULT_SMOOTHING,
): SmoothingResult {
  const validation = validateContour(points);
  if (!validation.valid) throw new Error(validation.reason);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error('画像の寸法が不正です。');
  if (
    !Number.isInteger(options.iterations) ||
    options.iterations < 0 ||
    options.iterations > 30 ||
    !Number.isFinite(options.strength) ||
    options.strength < 0 ||
    options.strength > 1
  )
    throw new Error('平滑化の設定が範囲外です。');
  if (options.iterations === 0 || options.strength === 0)
    return { points: points.map((p) => ({ ...p })), iterationsApplied: 0 };
  const spacing = Math.max(width, height) / 180;
  const samples: OutlinePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const count = Math.max(
      1,
      Math.ceil(
        Math.hypot((b.x - a.x) * width, (b.y - a.y) * height) / spacing,
      ),
    );
    if (samples.length + count > 3000)
      return {
        points: points.map((p) => ({ ...p })),
        iterationsApplied: 0,
        warning: '輪郭が複雑なため補正を行いませんでした。',
      };
    for (let j = 0; j < count; j++)
      samples.push({
        x: a.x + ((b.x - a.x) * j) / count,
        y: a.y + ((b.y - a.y) * j) / count,
      });
  }
  let current = samples;
  const maxMove = Math.max(width, height) * 0.018;
  let iterationsApplied = 0;
  let warning: string | undefined;
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const next = current.map((point, i) => {
      let x = 0,
        y = 0;
      for (let offset = -2; offset <= 2; offset++) {
        const p = current[(i + offset + current.length) % current.length];
        x += p.x / 5;
        y += p.y / 5;
      }
      x = point.x + (x - point.x) * options.strength;
      y = point.y + (y - point.y) * options.strength;
      const origin = samples[i];
      const distance = Math.hypot(
        (x - origin.x) * width,
        (y - origin.y) * height,
      );
      if (distance > maxMove) {
        x = origin.x + ((x - origin.x) * maxMove) / distance;
        y = origin.y + ((y - origin.y) * maxMove) / distance;
      }
      // Keep clipped edges on the actual image boundary.
      if (origin.x === 0 || origin.x === 1) x = origin.x;
      if (origin.y === 0 || origin.y === 1) y = origin.y;
      return { x, y };
    });
    if (!validateContour(next).valid) {
      warning = '輪郭の交差を防ぐため、最後に有効だった形で補正を止めました。';
      break;
    }
    current = next;
    iterationsApplied++;
  }
  return { points: current, iterationsApplied, warning };
}

/** Compatibility wrapper for existing preview callers. */
export function smoothPreviewContour(
  points: OutlinePoint[],
  width: number,
  height: number,
  options: SmoothingOptions = DEFAULT_SMOOTHING,
): OutlinePoint[] {
  if (!validateContour(points).valid) return points;
  return smoothClosedContour(points, width, height, options).points;
}

/** Midpoint quadratic curve, shared by SVG and Canvas. */
export function previewContourPath(
  points: OutlinePoint[],
  width = 1,
  height = 1,
): string {
  if (points.length < 3) return '';
  const last = points[points.length - 1],
    first = points[0];
  return (
    `M ${((last.x + first.x) * width) / 2} ${((last.y + first.y) * height) / 2} ` +
    points
      .map((p, i) => {
        const q = points[(i + 1) % points.length];
        return `Q ${p.x * width} ${p.y * height} ${((p.x + q.x) * width) / 2} ${((p.y + q.y) * height) / 2}`;
      })
      .join(' ') +
    ' Z'
  );
}

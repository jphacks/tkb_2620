import { validateContour } from './extractContour.ts';
import type { OutlinePoint } from './extractContour';

/** Display only: aspect-correct, bounded smoothing. The extraction result is untouched. */
export function smoothPreviewContour(
  points: OutlinePoint[],
  width: number,
  height: number,
): OutlinePoint[] {
  if (!validateContour(points).valid || !(width > 0 && height > 0))
    return points;
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
    if (samples.length + count > 3000) return points;
    for (let j = 0; j < count; j++)
      samples.push({
        x: a.x + ((b.x - a.x) * j) / count,
        y: a.y + ((b.y - a.y) * j) / count,
      });
  }
  let current = samples;
  const maxMove = Math.max(width, height) * 0.018;
  for (let iteration = 0; iteration < 6; iteration++) {
    const next = current.map((point, i) => {
      let x = 0,
        y = 0;
      for (let offset = -3; offset <= 3; offset++) {
        const p = current[(i + offset + current.length) % current.length];
        x += p.x / 7;
        y += p.y / 7;
      }
      x = point.x + (x - point.x) * 0.55;
      y = point.y + (y - point.y) * 0.55;
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
    if (!validateContour(next).valid) break;
    current = next;
  }
  return current;
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

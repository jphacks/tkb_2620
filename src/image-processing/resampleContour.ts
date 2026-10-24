import { validateContour } from './extractContour.ts';
import type { OutlinePoint } from './extractContour';

export const DEFAULT_RESAMPLING = { spacing: 0.5, metersPerPixel: 0.05 };
export type ResamplingOptions = { spacing: number; metersPerPixel: number };
export type DistancePoint = OutlinePoint & { t: number; distance: number };
export type ResampledContour = {
  points: DistancePoint[];
  totalLength: number;
  actualSpacing: number;
  requestedSpacing: number;
  metersPerPixel?: number;
  imageWidth?: number;
  imageHeight?: number;
};

/** Input/output in meters. No duplicated closing point; t follows original arc distance. */
export function resampleClosedContour(
  points: OutlinePoint[],
  spacing = 0.5,
): ResampledContour {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new Error('点間隔は0より大きい値を指定してください。');
  const clean: OutlinePoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw new Error('輪郭に不正な座標があります。');
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-7)
      clean.push({ ...p });
  }
  if (
    clean.length > 1 &&
    Math.hypot(
      clean[0].x - clean[clean.length - 1].x,
      clean[0].y - clean[clean.length - 1].y,
    ) <= 1e-7
  )
    clean.pop();
  const valid = validateContour(clean);
  if (!valid.valid) throw new Error(valid.reason);
  const cumulative = [0];
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i],
      b = clean[(i + 1) % clean.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLength = cumulative[cumulative.length - 1];
  const count = Math.max(3, Math.ceil(totalLength / spacing));
  if (count > 5000)
    throw new Error(
      '点数が多すぎます。点間隔を広げるか、変換倍率を下げてください。',
    );
  const actualSpacing = totalLength / count;
  const output: DistancePoint[] = [];
  let edge = 0;
  for (let i = 0; i < count; i++) {
    const distance = i * actualSpacing;
    while (edge < clean.length - 1 && cumulative[edge + 1] <= distance) edge++;
    const a = clean[edge],
      b = clean[(edge + 1) % clean.length];
    const ratio =
      (distance - cumulative[edge]) / (cumulative[edge + 1] - cumulative[edge]);
    output.push({
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      t: i / count,
      distance,
    });
  }
  const outputValid = validateContour(output);
  if (!outputValid.valid)
    throw new Error(
      '点間隔が大きすぎて形を維持できません。間隔を小さくしてください。',
    );
  return {
    points: output,
    totalLength,
    actualSpacing,
    requestedSpacing: spacing,
  };
}

/** Adapter from normalized photo coordinates. Origin and direction are preserved. */
export function resamplePhotoContour(
  points: OutlinePoint[],
  width: number,
  height: number,
  options: ResamplingOptions = DEFAULT_RESAMPLING,
): ResampledContour {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(options.metersPerPixel) ||
    options.metersPerPixel <= 0
  )
    throw new Error('画像寸法またはメートル変換倍率が不正です。');
  const result = resampleClosedContour(
    points.map((p) => ({
      x: p.x * width * options.metersPerPixel,
      y: p.y * height * options.metersPerPixel,
    })),
    options.spacing,
  );
  return {
    ...result,
    metersPerPixel: options.metersPerPixel,
    imageWidth: width,
    imageHeight: height,
  };
}

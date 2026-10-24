import { validateContour } from './extractContour.ts';
import type { OutlinePoint, BinaryPersonMask } from './extractContour';
export type RGB = [number, number, number];
export type PixelImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
export type ColorConfig = {
  segmentCount: number;
  samplesPerSegment: number;
  inwardOffsets: number[];
  defaultColor: RGB;
};
export const COLOR_CONFIG: ColorConfig = {
  segmentCount: 16,
  samplesPerSegment: 3,
  inwardOffsets: [3, 6, 10],
  defaultColor: [160, 160, 160],
};
export type ColorProbe = OutlinePoint & {
  t: number;
  segmentIndex: number;
  color: RGB;
};
export type RepresentativeColor = {
  t: number;
  startT: number;
  endT: number;
  color: RGB;
  sampleCount: number;
  interpolated: boolean;
};
export type ColorExtraction = {
  colorSamples: RepresentativeColor[];
  probes: ColorProbe[];
  warnings: string[];
  config: ColorConfig;
};

export function calculateMedianColor(colors: RGB[]): RGB {
  if (!colors.length) throw new Error('代表色を計算する色がありません。');
  return [0, 1, 2].map((channel) => {
    const sorted = colors.map((c) => c[channel]).sort((a, b) => a - b),
      mid = Math.floor(sorted.length / 2);
    return Math.round(
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    );
  }) as RGB;
}
export function splitContourIntoSegments(points: OutlinePoint[], count = 16) {
  const valid = validateContour(points);
  if (!valid.valid) throw new Error(valid.reason);
  if (!Number.isInteger(count) || count < 1 || count > 128)
    throw new Error('区間数は1〜128の整数にしてください。');
  const cumulative = [0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLength = cumulative.at(-1)!;
  function at(t: number): OutlinePoint {
    const distance = (((t % 1) + 1) % 1) * totalLength;
    let low = 0,
      high = points.length;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (cumulative[mid] <= distance) low = mid;
      else high = mid;
    }
    const a = points[low],
      b = points[(low + 1) % points.length],
      fraction =
        (distance - cumulative[low]) / (cumulative[low + 1] - cumulative[low]);
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  }
  return {
    totalLength,
    at,
    segments: Array.from({ length: count }, (_, segmentIndex) => ({
      segmentIndex,
      startT: segmentIndex / count,
      endT: (segmentIndex + 1) / count,
    })),
  };
}
function inside(
  point: OutlinePoint,
  mask: BinaryPersonMask,
  width: number,
  height: number,
) {
  if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)
    return false;
  const x = Math.floor((point.x / width) * mask.width),
    y = Math.floor((point.y / height) * mask.height);
  return mask.data[y * mask.width + x] === 1;
}
export function getInwardDirection(
  point: OutlinePoint,
  tangent: OutlinePoint,
  mask: BinaryPersonMask,
  width: number,
  height: number,
): OutlinePoint | null {
  const length = Math.hypot(tangent.x, tangent.y);
  if (length < 1e-8) return null;
  const normal = { x: -tangent.y / length, y: tangent.x / length };
  const score = (sign: number) =>
    [1, 2, 3].reduce(
      (sum, d) =>
        sum +
        (inside(
          {
            x: point.x + sign * normal.x * d,
            y: point.y + sign * normal.y * d,
          },
          mask,
          width,
          height,
        )
          ? 1
          : 0),
      0,
    );
  const plus = score(1),
    minus = score(-1);
  if (Math.max(plus, minus) === 0 || plus === minus) return null;
  const sign = plus > minus ? 1 : -1;
  return { x: normal.x * sign, y: normal.y * sign };
}
export function sampleInnerColors(
  image: PixelImage,
  mask: BinaryPersonMask,
  point: OutlinePoint,
  direction: OutlinePoint,
  offsets: number[],
) {
  const samples: (OutlinePoint & { color: RGB })[] = [];
  for (const offset of offsets) {
    const p = {
      x: point.x + direction.x * offset,
      y: point.y + direction.y * offset,
    };
    if (!inside(p, mask, image.width, image.height)) continue;
    const x = Math.floor(p.x),
      y = Math.floor(p.y);
    // Test the actual sampled pixel center too, especially when mask resolution differs.
    if (!inside({ x: x + 0.5, y: y + 0.5 }, mask, image.width, image.height))
      continue;
    const index = (y * image.width + x) * 4;
    if (!image.data[index + 3]) continue;
    samples.push({
      x: x + 0.5,
      y: y + 0.5,
      color: [image.data[index], image.data[index + 1], image.data[index + 2]],
    });
  }
  return samples;
}
export function extractRepresentativeColors(
  image: PixelImage,
  mask: BinaryPersonMask,
  originalContour: OutlinePoint[],
  options: Partial<ColorConfig> = {},
): ColorExtraction {
  const config = {
    ...COLOR_CONFIG,
    ...options,
    inwardOffsets: [...(options.inwardOffsets ?? COLOR_CONFIG.inwardOffsets)],
    defaultColor: [
      ...(options.defaultColor ?? COLOR_CONFIG.defaultColor),
    ] as RGB,
  };
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.data.length !== image.width * image.height * 4 ||
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0 ||
    mask.data.length !== mask.width * mask.height
  )
    throw new Error('画像または人物マスクの寸法が不正です。');
  if (
    !Number.isInteger(config.samplesPerSegment) ||
    config.samplesPerSegment < 1 ||
    config.samplesPerSegment > 10 ||
    !config.inwardOffsets.length ||
    config.inwardOffsets.length > 20 ||
    config.inwardOffsets.some(
      (d) => !Number.isFinite(d) || d <= 0 || d > 100,
    ) ||
    config.defaultColor.length !== 3 ||
    config.defaultColor.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw new Error('色抽出の設定が不正です。');
  const path = splitContourIntoSegments(originalContour, config.segmentCount);
  const probes: ColorProbe[] = [];
  const colorSamples = path.segments.map((segment) => {
    const colors: RGB[] = [];
    for (let sample = 1; sample <= config.samplesPerSegment; sample++) {
      const t =
          segment.startT +
          ((segment.endT - segment.startT) * sample) /
            (config.samplesPerSegment + 1),
        point = path.at(t);
      const delta = Math.min(0.001, 1 / path.totalLength),
        before = path.at(t - delta),
        after = path.at(t + delta);
      const direction = getInwardDirection(
        point,
        { x: after.x - before.x, y: after.y - before.y },
        mask,
        image.width,
        image.height,
      );
      if (!direction) continue;
      for (const color of sampleInnerColors(
        image,
        mask,
        point,
        direction,
        config.inwardOffsets,
      )) {
        colors.push(color.color);
        probes.push({ ...color, t, segmentIndex: segment.segmentIndex });
      }
    }
    return {
      ...segment,
      t: (segment.startT + segment.endT) / 2,
      color: colors.length
        ? calculateMedianColor(colors)
        : ([...config.defaultColor] as RGB),
      sampleCount: colors.length,
      interpolated: !colors.length,
    };
  });
  const valid = colorSamples
      .map((s, i) => (s.sampleCount ? i : -1))
      .filter((i) => i >= 0),
    warnings: string[] = [];
  if (!valid.length)
    warnings.push(
      '人物の色を取得できませんでした。全区間に既定のグレーを使用しています。',
    );
  else {
    let missing = 0;
    for (let i = 0; i < colorSamples.length; i++)
      if (!colorSamples[i].sampleCount) {
        missing++;
        let left = 1,
          right = 1;
        while (
          !colorSamples[(i - left + config.segmentCount) % config.segmentCount]
            .sampleCount
        )
          left++;
        while (!colorSamples[(i + right) % config.segmentCount].sampleCount)
          right++;
        const a =
            colorSamples[(i - left + config.segmentCount) % config.segmentCount]
              .color,
          b = colorSamples[(i + right) % config.segmentCount].color;
        colorSamples[i].color = a.map((v, c) =>
          Math.round(v + ((b[c] - v) * left) / (left + right)),
        ) as RGB;
      }
    if (missing)
      warnings.push(`${missing}区間の色を隣接する有効区間から補完しました。`);
  }
  return { colorSamples, probes, warnings, config };
}

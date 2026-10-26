/**
 * 写真の色の明るさで、コースに上り坂・下り坂をつける。Three.js・画面に依存しない。
 *
 * 壁の色（人物の色）が明るいところほど高く、暗いところほど低くする。高さは色から毎回計算し、
 * データベースには保存しない（保存済みのコースにもそのまま坂がつく）。
 *
 * 1. 中心線に沿って1mごとに、壁の色の明るさ（CIE L*）を取る
 * 2. コースの中で一番暗いところを0、一番明るいところを1にそろえ、maxHeight をかける
 * 3. STARTとお家のまわりは高さ0の平らな場所にする（配送センターとお家を地面に置くため）
 * 4. 坂の急さを maxGrade 以下に抑える（高いほうだけを削る）
 * 5. 幅 2×maxGrade×minCurveRadius で移動平均し、坂の頂上・底の丸みを minCurveRadius 以上にする
 *    （坂の急さが maxGrade 以下の形を幅 W でならすと、坂の変わり方は 2×maxGrade/W 以下になる）
 *
 * 坂の急さと丸みは、道路構造令の設計速度40km/hの値（縦断勾配7%・縦断曲線半径450m）。
 */
import type { CourseData } from '../../shared/course';
import { DELIVERY_RATIO } from './deliveryDestination.ts';

export const SLOPE = {
  /** 坂の急さの上限（高さ÷距離）。道路構造令・設計速度40km/hの縦断勾配 */
  maxGrade: 0.07,
  /** 坂の頂上・底の丸みの最小半径。道路構造令・設計速度40km/hの縦断曲線半径 */
  minCurveRadius: 450,
  /** 一番明るいところの高さ（そろえたあとの最大） */
  maxHeight: 10,
  /** START・お家の前後で、平らにする長さ（片側） */
  startFlat: 30,
  houseFlat: 20,
  /** 計算に使う間隔 */
  step: 1,
};

export type Elevation = {
  /** 一周の長さ（中心線に沿った距離） */
  length: number;
  /** 中心線に沿った位置（0〜length）での高さ */
  heightAt: (position: number) => number;
  /** 中心線に沿った位置での坂の急さ（進む向きに上りが正） */
  gradeAt: (position: number) => number;
  /** コースの各点の高さ（course.points と同じ順番） */
  pointHeights: number[];
};

/** #RRGGBB の明るさ（CIE L*、0〜100） */
export function lightness(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** 壁の色の明るさを、一周の割合（0〜1）で取る。createRoad の色と同じ補間 */
function lightnessAlong(course: CourseData) {
  const stops = course.wallColorStops
    .map((s) => ({
      progress: s.progress === 1 ? 0 : s.progress,
      value: lightness(s.color),
    }))
    .sort((a, b) => a.progress - b.progress)
    .filter((s, i, all) => i === 0 || s.progress !== all[i - 1].progress);
  return (progress: number) => {
    const t = ((progress % 1) + 1) % 1;
    const nextIndex = stops.findIndex((s) => s.progress > t);
    const a =
      stops[(nextIndex === -1 ? stops.length : nextIndex) - 1] ??
      stops[stops.length - 1];
    const b = stops[nextIndex === -1 ? 0 : nextIndex];
    let start = a.progress,
      end = b.progress;
    if (nextIndex === 0) start -= 1;
    if (nextIndex === -1) end += 1;
    const w = end === start ? 0 : (t - start) / (end - start);
    return a.value + (b.value - a.value) * w;
  };
}

/** 一周の中での、2つの位置の近いほうの距離 */
function loopDistance(a: number, b: number, length: number) {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

export function createElevation(
  course: CourseData,
  options: Partial<typeof SLOPE> = {},
): Elevation {
  const o = { ...SLOPE, ...options };
  const { points } = course;
  const cumulative = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1],
      b = points[i % points.length];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cumulative[points.length];
  const count = Math.max(16, Math.round(length / o.step));
  const ds = length / count;
  const at = lightnessAlong(course);
  const raw = Array.from({ length: count }, (_, k) => at(k / count));
  const low = Math.min(...raw),
    high = Math.max(...raw);
  const heights = raw.map((v) =>
    high - low > 1e-6 ? ((v - low) / (high - low)) * o.maxHeight : 0,
  );
  // 移動平均でならしても平らなまま残るよう、ならす幅の半分（と計算の間隔2つ分）だけ広く0にする
  const window = 2 * o.maxGrade * o.minCurveRadius;
  const margin = window / 2 + 2 * ds;
  const house = DELIVERY_RATIO * length;
  for (let k = 0; k < count; k++) {
    const s = k * ds;
    if (
      loopDistance(s, 0, length) <= o.startFlat + margin ||
      loopDistance(s, house, length) <= o.houseFlat + margin
    )
      heights[k] = 0;
  }
  // 坂の急さを抑える：前後から何周かたどり、隣より maxGrade×ds 以上高いところを削る
  const rise = o.maxGrade * ds;
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 1; k <= count; k++)
      heights[k % count] = Math.min(heights[k % count], heights[k - 1] + rise);
    for (let k = count - 2; k >= -1; k--) {
      const i = (k + count) % count;
      heights[i] = Math.min(
        heights[i],
        heights[(k + 1 + count) % count] + rise,
      );
    }
  }
  // 坂の頂上・底を丸める：幅 window の移動平均（一周つながっている）
  const half = Math.max(1, Math.round(window / ds / 2));
  const span = half * 2 + 1;
  const smooth = heights.map((_, k) => {
    let sum = 0;
    for (let j = -half; j <= half; j++)
      sum += heights[(((k + j) % count) + count) % count];
    return sum / span;
  });
  const heightAt = (position: number) => {
    const u = ((((position % length) + length) % length) / ds) % count;
    const k = Math.floor(u),
      t = u - k;
    return smooth[k] + (smooth[(k + 1) % count] - smooth[k]) * t;
  };
  const gradeAt = (position: number) =>
    (heightAt(position + ds / 2) - heightAt(position - ds / 2)) / ds;
  return {
    length,
    heightAt,
    gradeAt,
    pointHeights: cumulative.slice(0, points.length).map(heightAt),
  };
}

/**
 * 写真の処理結果からゲーム用の CourseData を作る（Issue #10）。
 *
 * 補正後コース（Issue #6）は写真上のメートルで、画像と同じく右が+x・下が+y。
 * ゲーム空間は画面の上が−Z・右が+X（docs/course-data.md）なので、x→x・y→z とそのまま対応させ、
 * コースの中心を原点に移す。向きは反転しないので、START から反時計回りのまま。
 * 写真の倍率（1px=何m）は仮の値で、そのままだと人物が小さく道路同士が重なるため、
 * いちばん長い辺が courseSize になるよう拡大・縮小する。拡大するとカーブの半径も同じ割合で大きくなる。
 */
import type {
  CourseData,
  CoursePoint,
  WallColorStop,
} from '../../shared/course';
import type { CapturedPerson } from '../capture/capture';
import type { CourseColors } from './mapCourseColors';
import type { OutlinePoint } from './extractContour';

/** Sample value shared with the fixture course; tune in Issue #27. */
export const DEFAULT_ROAD_WIDTH = 6.0;
/** Longest side of the course in game units. Limbs then fit a 6-wide road; tune in Issue #27. */
export const DEFAULT_COURSE_SIZE = 140;
/** Used when no person colors are available. */
export const DEFAULT_WALL_COLOR = '#a0a0a0';
export const DEFAULT_THEME_COLOR = '#f2a65a';

/** Photo-meter points to game space, centered on the course's bounding box.
 * With courseSize, the longest side is scaled to that many game units.
 */
export function toGameSpace(
  points: readonly OutlinePoint[],
  courseSize?: number,
): CoursePoint[] {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const longest = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const scale = courseSize && longest > 0 ? courseSize / longest : 1;
  return points.map((p) => ({ x: (p.x - cx) * scale, z: (p.y - cy) * scale }));
}

/** The color covering the longest stretch of wall, as the course's theme color. */
export function dominantColor(colors: CourseColors): string {
  const share = new Map<string, number>();
  colors.points.forEach((p, i) => {
    const next = i + 1 < colors.points.length ? colors.points[i + 1].t : 1;
    share.set(p.color, (share.get(p.color) ?? 0) + (next - p.t));
  });
  let best = DEFAULT_THEME_COLOR,
    bestShare = -1;
  for (const [color, value] of share)
    if (value > bestShare) {
      best = color;
      bestShare = value;
    }
  return best;
}

export function generateCourse(
  person: CapturedPerson,
  {
    roadWidth = DEFAULT_ROAD_WIDTH,
    courseSize = DEFAULT_COURSE_SIZE,
  }: { roadWidth?: number; courseSize?: number } = {},
): CourseData {
  const corrected = person.curveCorrection?.contour.points;
  if (!corrected || corrected.length < 3)
    throw new Error(
      'コースの形がまだできていません。写真を選び直してください。',
    );
  const colors = person.courseColors;
  // Colored points are the corrected course aligned to START; use them when present.
  const points = toGameSpace(colors?.points ?? corrected, courseSize);
  const wallColorStops: WallColorStop[] = colors?.wallColorStops.length
    ? colors.wallColorStops.map((s) => ({ ...s }))
    : [{ progress: 0, color: DEFAULT_WALL_COLOR }];
  return {
    points,
    wallColorStops,
    themeColor: colors ? dominantColor(colors) : DEFAULT_THEME_COLOR,
    roadWidth,
    captureMode: person.bodyStatus === 'full_body' ? 'full_body' : 'clipped',
  };
}

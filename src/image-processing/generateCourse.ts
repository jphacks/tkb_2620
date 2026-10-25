/**
 * 写真の処理結果からゲーム用の CourseData を作る（Issue #10）。
 *
 * 補正後コース（Issue #6）は写真上のメートルで、画像と同じく右が+x・下が+y。
 * ゲーム空間は画面の上が−Z・右が+X（docs/course-data.md）なので、x→x・y→z とそのまま対応させ、
 * コースの中心を原点に移す。
 * 写真の倍率（1px=何m）は仮の値で、そのままだと人物が小さく道路同士が重なるため、
 * いちばん長い辺が courseSize になるよう拡大・縮小する。
 * そのあと fitRoad で、指やすき間など道幅より細かい形をならし、重ならない一本道にする。
 * 色は、整えた形に元輪郭の代表色（Issue #8）を対応づけ直す（Issue #9 と同じ方法）。
 * START（Issue #7）と反時計回りの向きは、この対応づけで元輪郭にそろう。
 */
import type {
  CourseData,
  CoursePoint,
  WallColorStop,
} from '../../shared/course';
import type { CapturedPerson } from '../capture/capture';
import type { OutlinePoint } from './extractContour';
import { fitRoad } from './fitRoad.ts';
import type { RoadFitOptions } from './fitRoad';
import { alignToReference, mapCourseColors } from './mapCourseColors.ts';
import type { CourseColors } from './mapCourseColors';

/** Sample value shared with the fixture course; tune in Issue #27. */
export const DEFAULT_ROAD_WIDTH = 6.0;
/** Longest side of the course in game units. Large enough that arms and legs fit the
 * 6-wide road with only light reshaping (fitRoad), so the person's shape stays (#27).
 * About 1100 around for a person with arms out, a lap of a minute and a half to two. */
export const DEFAULT_COURSE_SIZE = 300;
/** Used when no person colors are available. */
export const DEFAULT_WALL_COLOR = '#a0a0a0';
export const DEFAULT_THEME_COLOR = '#f2a65a';

/** Maps photo-meter points to game space: centered on the bounding box of `points`,
 * and with courseSize, scaled so its longest side is that many game units.
 */
export function gameTransform(
  points: readonly OutlinePoint[],
  courseSize?: number,
): (p: OutlinePoint) => CoursePoint {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const longest = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const scale = courseSize && longest > 0 ? courseSize / longest : 1;
  return (p) => ({ x: (p.x - cx) * scale, z: (p.y - cy) * scale });
}

/** Photo-meter points to game space (see gameTransform). */
export function toGameSpace(
  points: readonly OutlinePoint[],
  courseSize?: number,
): CoursePoint[] {
  return points.map(gameTransform(points, courseSize));
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

const toXY = (p: CoursePoint) => ({ x: p.x, y: p.z });
const toXZ = (p: OutlinePoint) => ({ x: p.x, z: p.y });

export type CourseBuildOptions = {
  roadWidth?: number;
  courseSize?: number;
  /** How coarsely the photo outline is reshaped into a road (see fitRoad). */
  fit?: Partial<Omit<RoadFitOptions, 'roadWidth'>>;
};

export type CourseBuild = {
  course: CourseData;
  /** Set when some turns are still tighter than the truck can take. */
  warning?: string;
};

export function buildCourse(
  person: CapturedPerson,
  {
    roadWidth = DEFAULT_ROAD_WIDTH,
    courseSize = DEFAULT_COURSE_SIZE,
    fit,
  }: CourseBuildOptions = {},
): CourseBuild {
  const corrected = person.curveCorrection?.contour;
  if (!corrected || corrected.points.length < 3)
    throw new Error(
      'コースの形がまだできていません。写真を選び直してください。',
    );
  const toGame = gameTransform(corrected.points, courseSize);
  const shaped = corrected.points.map(toGame);
  const fitted = fitRoad(shaped, roadWidth, fit);
  // Original outline (START first, counterclockwise) in the same game space.
  const mpp = corrected.metersPerPixel ?? 1;
  const reference = person.outline
    ? person.outline.points.map((p) =>
        toXY(
          toGame({ x: p.x * person.width * mpp, y: p.y * person.height * mpp }),
        ),
      )
    : shaped.map(toXY);
  const segments = person.colorExtraction?.colorSamples;
  let points: CoursePoint[],
    wallColorStops: WallColorStop[],
    themeColor = DEFAULT_THEME_COLOR;
  if (segments?.length) {
    const colors = mapCourseColors(
      segments,
      fitted.points.map(toXY),
      reference,
    );
    points = colors.points.map(toXZ);
    wallColorStops = colors.wallColorStops.map((s) => ({ ...s }));
    themeColor = dominantColor(colors);
  } else {
    points = alignToReference(fitted.points.map(toXY), reference).points.map(
      toXZ,
    );
    wallColorStops = [{ progress: 0, color: DEFAULT_WALL_COLOR }];
  }
  return {
    course: {
      points,
      wallColorStops,
      themeColor,
      roadWidth,
      captureMode: person.bodyStatus === 'full_body' ? 'full_body' : 'clipped',
    },
    warning: fitted.warning,
  };
}

export function generateCourse(
  person: CapturedPerson,
  options: CourseBuildOptions = {},
): CourseData {
  return buildCourse(person, options).course;
}

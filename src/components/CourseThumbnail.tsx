import type { CourseData } from '../../shared/course';

/** コースの形を上から見た小さな図（#28）。赤い点がSTART */
export function CourseThumbnail({
  course,
  size = 64,
}: {
  course: CourseData;
  size?: number;
}) {
  const xs = course.points.map((p) => p.x),
    zs = course.points.map((p) => p.z);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ, 1);
  const pad = 6,
    scale = (size - pad * 2) / span;
  const offsetX = (size - (Math.max(...xs) - minX) * scale) / 2,
    offsetZ = (size - (Math.max(...zs) - minZ) * scale) / 2;
  const toSvg = (p: { x: number; z: number }) =>
    `${((p.x - minX) * scale + offsetX).toFixed(1)},${((p.z - minZ) * scale + offsetZ).toFixed(1)}`;
  const [start] = course.points;
  const [sx, sz] = toSvg(start).split(',');
  return (
    <svg
      className="course-thumbnail"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <polygon
        points={course.points.map(toSvg).join(' ')}
        fill="none"
        stroke={course.themeColor}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx={sx} cy={sz} r={3.5} fill="#e5322d" />
    </svg>
  );
}

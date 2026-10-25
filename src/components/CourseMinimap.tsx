import { deliveryDestination } from '../game/deliveryDestination';
import { useMemo } from 'react';
import type { WallColorStop } from '../../shared/course';
import type { CapturedPerson } from '../capture/capture';
import { useMapPhoto } from '../capture/useMapPhoto';
import { createMinimapProjection, type MapPoint } from '../game/minimap';

export function CourseMinimap({
  points,
  position,
  photo,
  wallColorStops,
  droppedCargo,
}: {
  droppedCargo: readonly (MapPoint & { id: number })[];
  points: readonly MapPoint[];
  position: MapPoint;
  photo?: CapturedPerson | null;
  wallColorStops: readonly WallColorStop[];
}) {
  const map = useMemo(() => createMinimapProjection(points, 180, 26), [points]);
  const segments = useMemo(() => {
    const lengths = points.map((p, i) => {
      const q = points[(i + 1) % points.length];
      return Math.hypot(q.x - p.x, q.z - p.z);
    });
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const cumulative = [0];
    for (const length of lengths)
      cumulative.push(cumulative[cumulative.length - 1] + length);
    return points.map((p, i) => {
      const progress = total ? cumulative[i] / total : 0;
      let color = wallColorStops[0]?.color ?? '#a0a0a0';
      for (const stop of wallColorStops)
        if (stop.progress <= progress) color = stop.color;
      const a = map.project(p),
        b = map.project(points[(i + 1) % points.length]);
      return { path: `M${a.x},${a.y} L${b.x},${b.y}`, color };
    });
  }, [points, wallColorStops, map]);
  const image = useMapPhoto(photo);
  const imageFrom = image ? map.project(image.from) : null;
  const imageTo = image ? map.project(image.to) : null;
  const start = map.project(points[0]);
  const destination = map.project(deliveryDestination(points));
  const current = map.project(position);
  return (
    <aside className="course-minimap" aria-label="コースのミニマップ">
      <svg
        viewBox={`0 0 ${map.size} ${map.size}`}
        role="img"
        aria-label="固定方向のコース図。赤いピンが現在位置、旗がスタート、お家が届け先、黄色いバツが荷物を落とした場所です。"
      >
        {image && imageFrom && imageTo && (
          <image
            href={image.url}
            x={imageFrom.x}
            y={imageFrom.y}
            width={imageTo.x - imageFrom.x}
            height={imageTo.y - imageFrom.y}
            preserveAspectRatio="none"
          />
        )}
        {segments.map((segment, i) => (
          <path
            key={i}
            d={segment.path}
            fill="none"
            stroke={segment.color}
            strokeWidth="9"
            strokeLinecap="round"
          />
        ))}
        <path
          d={map.path}
          fill="none"
          stroke="#4a4f4a"
          strokeWidth="6.67"
          strokeLinejoin="round"
        />
        {droppedCargo.map((drop) => {
          const point = map.project(drop);
          return (
            <g key={drop.id} transform={`translate(${point.x} ${point.y})`}>
              <title>荷物{drop.id + 1}を落とした場所</title>
              <path
                d="M-4 -4L4 4M4 -4L-4 4"
                stroke="#40380b"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M-4 -4L4 4M4 -4L-4 4"
                stroke="#ffdf32"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        <g transform={`translate(${start.x} ${start.y})`}>
          <title>START</title>
          <path
            d="M2 0V-22"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M2 0V-22" stroke="#182c27" strokeWidth="2" />
          <path
            d="M3 -22H17V-12H3Z"
            fill="white"
            stroke="#182c27"
            strokeWidth="1"
          />
          <path
            d="M3 -22H7.7V-17H3ZM12.3 -22H17V-17H12.3ZM7.7 -17H12.3V-12H7.7Z"
            fill="#182c27"
          />
        </g>
        <g transform={`translate(${destination.x} ${destination.y})`}>
          <title>届け先</title>
          <path d="M-7 0V-10H7V0Z" fill="#fff2d4" stroke="#384b3d" />
          <path
            d="M-10 -10L0 -19L10 -10Z"
            fill="#cf493c"
            stroke="white"
            strokeWidth="1"
          />
          <path d="M-2 0V-6H2V0" fill="#78563e" />
        </g>
        <g transform={`translate(${current.x} ${current.y})`}>
          <title>現在位置</title>
          <path
            d="M0 0C-2 -4 -7 -8 -7 -13A7 7 0 1 1 7 -13C7 -8 2 -4 0 0Z"
            fill="#ff2d2d"
            stroke="white"
            strokeWidth="1.8"
          />
          <circle cx="0" cy="-13" r="2.5" fill="white" />
        </g>
      </svg>
    </aside>
  );
}

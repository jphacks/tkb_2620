export type MapPoint = { x: number; z: number };

/** Fixed, uniformly scaled world x/z → map x/y. Negative z stays at the top. */
export function createMinimapProjection(
  points: readonly MapPoint[],
  size = 180,
  padding = 16,
) {
  if (
    !points.length ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
  )
    throw new Error('ミニマップの座標が不正です。');
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const scale = (size - padding * 2) / Math.max(maxX - minX, maxZ - minZ, 1);
  function project(point: MapPoint) {
    return {
      x: size / 2 + (point.x - (minX + maxX) / 2) * scale,
      y: size / 2 + (point.z - (minZ + maxZ) / 2) * scale,
    };
  }
  const path =
    points
      .map((p, i) => {
        const q = project(p);
        return `${i ? 'L' : 'M'}${q.x},${q.y}`;
      })
      .join(' ') + ' Z';
  return { project, path, size };
}

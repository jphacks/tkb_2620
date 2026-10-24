import type { CoursePoint } from '../../shared/course';

export const DELIVERY_RATIO = 0.9;
/** Closed-loop arc distance, shared by scene, finish detection and minimap. */
export function deliveryDestination(
  points: readonly CoursePoint[],
  ratio = DELIVERY_RATIO,
) {
  const lengths = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.hypot(q.x - p.x, q.z - p.z);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  let remaining = total * ratio;
  for (let i = 0; i < points.length; i++) {
    if (remaining <= lengths[i] || i === points.length - 1) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const length = lengths[i] || 1;
      const t = remaining / length;
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        dx: (b.x - a.x) / length,
        dz: (b.z - a.z) / length,
        distance: total * ratio,
      };
    }
    remaining -= lengths[i];
  }
  throw new Error('届け先を配置できません。');
}

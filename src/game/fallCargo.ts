import { BED, CARGO, bedToTruck, type CargoItem } from './cargo.ts';
import { CARGO_PHYSICS } from './slideCargo.ts';

/** Matches the visible ground plane in createScene. */
export const CARGO_GROUND_Y = -0.06;
export const CARGO_LANDING_Y = CARGO_GROUND_Y + (CARGO.size * 1.01) / 2;
export function isOutsideBed(position: { x: number; z: number }) {
  return (
    Math.abs(position.x) > BED.width / 2 ||
    Math.abs(position.z) > BED.length / 2
  );
}

/** Pure world-space simulation, independent of Three.js and later truck motion.
 * 坂のあるコースでは、truck.y にトラックのいる道路の高さを、groundAt に落ちた場所の
 * 高さ（道の上なら道路の高さ、道の外なら地面）を渡す。省略すると平らな地面。
 */
export function updateCargoFalls(
  items: readonly CargoItem[],
  truck: { x: number; z: number; yaw: number; speed: number; y?: number },
  groundAt: (x: number, z: number) => number = () => CARGO_GROUND_Y,
): CargoItem[] {
  const dt = CARGO_PHYSICS.step;
  const next: CargoItem[] = items.map((item) => {
    if (item.status === 'lost')
      return item.fall
        ? {
            ...item,
            fall: {
              ...item.fall,
              position: { ...item.fall.position },
              velocity: { ...item.fall.velocity },
            },
          }
        : item;
    if (item.status === 'falling' && item.fall) {
      const velocity = {
        ...item.fall.velocity,
        y: item.fall.velocity.y - CARGO_PHYSICS.gravity * dt,
      };
      const position = {
        x: item.fall.position.x + velocity.x * dt,
        y: item.fall.position.y + velocity.y * dt,
        z: item.fall.position.z + velocity.z * dt,
      };
      const elapsed = item.fall.elapsed + dt;
      const landing =
        groundAt(position.x, position.z) + (CARGO_LANDING_Y - CARGO_GROUND_Y);
      const landed = position.y <= landing;
      if (landed) {
        // 隣の高い道の土手に入っても、上へ飛び移らせない
        position.y = Math.min(landing, item.fall.position.y);
        velocity.x = velocity.y = velocity.z = 0;
      }
      return {
        ...item,
        status: landed ? 'lost' : 'falling',
        fall: { ...item.fall, position, velocity, elapsed },
      };
    }
    if (item.climb || !isOutsideBed(item.position)) return item;
    const local = bedToTruck(item.position);
    const sin = Math.sin(truck.yaw),
      cos = Math.cos(truck.yaw);
    return {
      ...item,
      status: 'falling',
      fall: {
        origin: {
          x: truck.x + local.x * cos + local.z * sin,
          z: truck.z - local.x * sin + local.z * cos,
        },
        position: {
          x: truck.x + local.x * cos + local.z * sin,
          y: (truck.y ?? 0) + local.y + CARGO.size / 2 + (item.lift ?? 0),
          z: truck.z - local.x * sin + local.z * cos,
        },
        velocity: {
          x: item.velocity.x * cos + (truck.speed + item.velocity.z) * sin,
          y: (item.lift ?? 0) > 0 ? 0.6 : 0,
          z: -item.velocity.x * sin + (truck.speed + item.velocity.z) * cos,
        },
        elapsed: 0,
        yaw: truck.yaw,
      },
    };
  });
  separateFallenCargo(next);
  return next;
}

/** Horizontal OBB contacts: respect each box's frozen world yaw.
 * Grounded boxes block airborne boxes; simultaneous landings share correction.
 * Resolve sideways rather than stacking, keeping the simple ground model.
 */
function separateFallenCargo(items: CargoItem[]) {
  const boxes = items.filter(
    (c) => c.fall && (c.status === 'falling' || c.status === 'lost'),
  );
  const size = CARGO.size * 1.01;
  const axes = (yaw: number) => [
    { x: Math.cos(yaw), z: -Math.sin(yaw) },
    { x: Math.sin(yaw), z: Math.cos(yaw) },
  ];
  for (let pass = 0; pass < 64; pass++) {
    let touching = false;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j],
          af = a.fall!,
          bf = b.fall!;
        if (Math.abs(af.position.y - bf.position.y) >= size) continue;
        const aa = axes(af.yaw),
          ba = axes(bf.yaw);
        const dx = bf.position.x - af.position.x,
          dz = bf.position.z - af.position.z;
        let depth = Infinity,
          normal = { x: 0, z: 0 };
        for (const axis of [...aa, ...ba]) {
          const radius = (basis: typeof aa) =>
            (size / 2) *
            basis.reduce(
              (sum, v) => sum + Math.abs(v.x * axis.x + v.z * axis.z),
              0,
            );
          const projection = dx * axis.x + dz * axis.z;
          const overlap = radius(aa) + radius(ba) - Math.abs(projection);
          if (overlap <= 1e-8) {
            depth = 0;
            break;
          }
          if (overlap < depth) {
            depth = overlap;
            const sign = projection < 0 ? -1 : 1;
            normal = { x: axis.x * sign, z: axis.z * sign };
          }
        }
        if (!depth) continue;
        touching = true;
        const weightA =
          a.status === 'lost' && b.status !== 'lost'
            ? 0
            : b.status === 'lost' && a.status !== 'lost'
              ? 1
              : 0.5;
        const weightB = 1 - weightA;
        for (const axis of ['x', 'z'] as const) {
          af.position[axis] -= normal[axis] * (depth + 1e-7) * weightA;
          bf.position[axis] += normal[axis] * (depth + 1e-7) * weightB;
        }
        const closing =
          (bf.velocity.x - af.velocity.x) * normal.x +
          (bf.velocity.z - af.velocity.z) * normal.z;
        if (closing < 0)
          for (const axis of ['x', 'z'] as const) {
            af.velocity[axis] += normal[axis] * closing * weightA;
            bf.velocity[axis] -= normal[axis] * closing * weightB;
          }
      }
    if (!touching) break;
  }
}

/** One fixed marker per dropped box; it does not follow the flight or landing. */
export function cargoDropLocations(items: readonly CargoItem[]) {
  return items
    .filter((c) => (c.status === 'falling' || c.status === 'lost') && c.fall)
    .map((c) => ({
      id: c.id,
      x: (c.fall!.origin ?? c.fall!.position).x,
      z: (c.fall!.origin ?? c.fall!.position).z,
    }));
}

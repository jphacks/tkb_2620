import { BED, CARGO, type CargoItem } from './cargo.ts';

export const RAIL_CONFIG = {
  height: 0.18,
  impactSpeed: 1.8,
  pressureAcceleration: 6,
  pressureTime: 0.75,
  climbDuration: 0.55,
};
const ease = (t: number) => t * t * (3 - 2 * t);

/** Bed rails catch gentle slides. A hard impact or sustained load lifts the box over. */
export function applyCargoRails(
  items: readonly CargoItem[],
  inertia: { x: number; z: number },
  dt: number,
): CargoItem[] {
  return items.map((item) => {
    if (item.status === 'falling' || item.status === 'lost') return item;
    if (item.climb) {
      const elapsed = item.climb.elapsed + dt;
      const t = Math.min(1, elapsed / RAIL_CONFIG.climbDuration);
      // Lift onto the rail before translating across it: no sideways penetration.
      const travel = ease(Math.max(0, (t - 0.3) / 0.7));
      const position = {
        x: item.climb.from.x + (item.climb.to.x - item.climb.from.x) * travel,
        z: item.climb.from.z + (item.climb.to.z - item.climb.from.z) * travel,
      };
      return {
        ...item,
        position,
        lift:
          RAIL_CONFIG.height * ease(Math.min(1, t / 0.3)) +
          0.08 * Math.sin(Math.PI * t),
        climb: t < 1 ? { ...item.climb, elapsed } : undefined,
      };
    }
    const position = { ...item.position },
      velocity = { ...item.velocity };
    // Cab is taller than a cardboard box: it is a solid front stop.
    const front = (BED.length - CARGO.size) / 2;
    if (position.z > front) {
      position.z = front;
      velocity.z = Math.min(0, velocity.z);
    }
    const side = (BED.width - CARGO.size) / 2;
    const rear = -front;
    const axis =
      Math.abs(position.x) > side ? 'x' : position.z < rear ? 'z' : null;
    if (!axis)
      return {
        ...item,
        position,
        velocity,
        ...(item.railPressure ? { railPressure: 0 } : {}),
      };
    const sign = axis === 'x' ? Math.sign(position.x) : -1;
    position[axis] = sign * (axis === 'x' ? side : front);
    const impact = Math.max(0, velocity[axis] * sign);
    const pressure =
      inertia[axis] * sign > RAIL_CONFIG.pressureAcceleration
        ? (item.railPressure ?? 0) + dt
        : 0;
    if (
      impact >= RAIL_CONFIG.impactSpeed ||
      pressure >= RAIL_CONFIG.pressureTime
    ) {
      const to = { ...position };
      to[axis] =
        sign *
        ((axis === 'x' ? BED.width : BED.length) / 2 + CARGO.size / 2 + 0.04);
      return {
        ...item,
        position,
        velocity: {
          x: axis === 'x' ? sign * 0.9 : 0,
          z: axis === 'z' ? sign * 0.9 : 0,
        },
        railPressure: 0,
        lift: 0,
        climb: { from: { ...position }, to, elapsed: 0 },
        status: 'sliding',
      };
    }
    // Gentle impacts rebound slightly instead of immediately dropping off.
    velocity[axis] = -sign * impact * 0.12;
    return {
      ...item,
      position,
      velocity,
      railPressure: pressure,
      status: Math.hypot(velocity.x, velocity.z) > 1e-8 ? 'sliding' : 'resting',
    };
  });
}

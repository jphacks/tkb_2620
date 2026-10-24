import { BED, CARGO, type CargoItem } from './cargo.ts';

export const CARGO_PHYSICS = {
  staticFriction: 0.25,
  kineticFriction: 0.18,
  gravity: 9.8,
  step: 1 / 60,
};
export type TruckMotion = {
  speed: number;
  acceleration: number;
  /** Positive yaw turns left; bed-local +x is left. */
  yawRate: number;
};

/** One fixed step. Inertia opposes acceleration and points outside a turn. */
export function slideCargo(
  items: readonly CargoItem[],
  motion: TruckMotion,
): CargoItem[] {
  if (!Object.values(motion).every(Number.isFinite))
    return items.map((c) => ({
      ...c,
      position: { ...c.position },
      velocity: { ...c.velocity },
    }));
  const { step: dt, gravity, staticFriction, kineticFriction } = CARGO_PHYSICS;
  const force = { x: -motion.speed * motion.yawRate, z: -motion.acceleration };
  const magnitude = Math.hypot(force.x, force.z);
  const next: CargoItem[] = items.map((item) => {
    if (item.status === 'falling' || item.status === 'lost') return item;
    let vx = item.velocity.x,
      vz = item.velocity.z;
    if (Math.hypot(vx, vz) < 1e-8 && magnitude <= staticFriction * gravity)
      return {
        ...item,
        position: { ...item.position },
        status: 'resting',
        velocity: { x: 0, z: 0 },
      };
    // Apply inertia first, then friction opposing the resulting motion.
    // Limiting the friction impulse prevents numerical oscillation at rest.
    vx += force.x * dt;
    vz += force.z * dt;
    const speed = Math.hypot(vx, vz);
    const factor =
      speed > 0 ? Math.max(0, 1 - (kineticFriction * gravity * dt) / speed) : 0;
    vx *= factor;
    vz *= factor;
    const limitX = (BED.width - CARGO.size) / 2;
    const limitZ = (BED.length - CARGO.size) / 2;
    const rawX = item.position.x + vx * dt;
    const rawZ = item.position.z + vz * dt;
    const x = Math.max(-limitX, Math.min(limitX, rawX));
    const z = Math.max(-limitZ, Math.min(limitZ, rawZ));
    // Temporary rail stop; falling is handled separately.
    if (x !== rawX) vx = 0;
    if (z !== rawZ) vz = 0;
    return {
      ...item,
      position: { x, z },
      velocity: { x: vx, z: vz },
      status: Math.hypot(vx, vz) > 1e-8 ? 'sliding' : 'resting',
    };
  });
  const boxes = next.filter(
    (c) => c.status === 'resting' || c.status === 'sliding',
  );
  const limits = {
    x: (BED.width - CARGO.size) / 2,
    z: (BED.length - CARGO.size) / 2,
  };
  // Axis-aligned boxes in bed coordinates. Resolve shallowest penetration first.
  // Transfer any correction blocked by a rail to the other box.
  for (let iteration = 0; iteration < 80; iteration++) {
    let overlap = false;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const dx = b.position.x - a.position.x,
          dz = b.position.z - a.position.z;
        const px = CARGO.size - Math.abs(dx),
          pz = CARGO.size - Math.abs(dz);
        if (px <= 1e-9 || pz <= 1e-9) continue;
        overlap = true;
        const axis = px < pz ? 'x' : 'z';
        const sign = b.position[axis] >= a.position[axis] ? 1 : -1;
        const depth = axis === 'x' ? px : pz;
        const roomA = limits[axis] + sign * a.position[axis];
        const roomB = limits[axis] - sign * b.position[axis];
        const moveA = Math.min(roomA, Math.max(depth / 2, depth - roomB));
        const moveB = Math.min(roomB, depth - moveA);
        a.position[axis] -= sign * moveA;
        b.position[axis] += sign * moveB;
        // Inelastic contact: remove only velocity that closes the gap.
        if ((b.velocity[axis] - a.velocity[axis]) * sign < 0) {
          const shared = (a.velocity[axis] + b.velocity[axis]) / 2;
          a.velocity[axis] = shared;
          b.velocity[axis] = shared;
        }
      }
    if (!overlap) break;
  }
  for (const box of boxes) {
    for (const axis of ['x', 'z'] as const)
      if (
        Math.abs(box.position[axis]) >= limits[axis] - 1e-9 &&
        box.position[axis] * box.velocity[axis] > 0
      )
        box.velocity[axis] = 0;
    box.status =
      Math.hypot(box.velocity.x, box.velocity.z) > 1e-8 ? 'sliding' : 'resting';
  }
  // A packed corner can fail to converge. Keep the last non-overlapping layout
  // rather than rendering an interpenetration.
  if (
    boxes.some((a, i) =>
      boxes
        .slice(i + 1)
        .some(
          (b) =>
            Math.abs(a.position.x - b.position.x) < CARGO.size - 1e-8 &&
            Math.abs(a.position.z - b.position.z) < CARGO.size - 1e-8,
        ),
    )
  )
    return items.map((c) =>
      c.status === 'resting' || c.status === 'sliding'
        ? {
            ...c,
            position: { ...c.position },
            velocity: { x: 0, z: 0 },
            status: 'resting',
          }
        : c,
    );
  return next;
}

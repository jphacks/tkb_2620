import { CARGO, type CargoItem } from './cargo.ts';
import { applyCargoRails } from './cargoRails.ts';

export const CARGO_PHYSICS = {
  staticFriction: 0.25,
  kineticFriction: 0.18,
  gravity: 9.8,
  step: 1 / 60,
  maxSpeed: 4,
  /** Forgive starts/restarts without changing braking or cornering. */
  launchInertiaScale: 0.25,
  launchProtectionSpeed: 12,
  launchFullInertiaSpeed: 24,
};
export type TruckMotion = {
  speed: number;
  acceleration: number;
  /** Positive yaw turns left; bed-local +x is left. */
  yawRate: number;
  /** 坂の急さ（トラックの向きに上りが正）。上り坂では荷物が後ろへ引かれる */
  grade?: number;
};

/** Gameplay assistance: positive acceleration only; smooth transition by speed. */
export function cargoLaunchScale(motion: TruckMotion): number {
  if (motion.acceleration <= 0) return 1;
  const t = Math.max(
    0,
    Math.min(
      1,
      (Math.abs(motion.speed) - CARGO_PHYSICS.launchProtectionSpeed) /
        (CARGO_PHYSICS.launchFullInertiaSpeed -
          CARGO_PHYSICS.launchProtectionSpeed),
    ),
  );
  return (
    CARGO_PHYSICS.launchInertiaScale +
    (1 - CARGO_PHYSICS.launchInertiaScale) * t * t * (3 - 2 * t)
  );
}

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
  const force = {
    x: -motion.speed * motion.yawRate,
    // 発進の補助（cargoLaunchScale）は加速の分だけ。坂の重力には補助をかけない
    z:
      -motion.acceleration * cargoLaunchScale(motion) -
      gravity * (motion.grade ?? 0),
  };
  const magnitude = Math.hypot(force.x, force.z);
  const next: CargoItem[] = items.map((item) => {
    if (item.status === 'falling' || item.status === 'lost') return item;
    if (item.climb)
      return {
        ...item,
        position: { ...item.position },
        velocity: { ...item.velocity },
      };
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
    const cappedFactor =
      speed > 0 ? Math.min(factor, CARGO_PHYSICS.maxSpeed / speed) : 0;
    vx *= cappedFactor;
    vz *= cappedFactor;
    const x = item.position.x + vx * dt;
    const z = item.position.z + vz * dt;
    return {
      ...item,
      position: { x, z },
      velocity: { x: vx, z: vz },
      status: Math.hypot(vx, vz) > 1e-8 ? 'sliding' : 'resting',
    };
  });
  const boxes = next.filter(
    (c) => !c.climb && (c.status === 'resting' || c.status === 'sliding'),
  );

  // Axis-aligned boxes in bed coordinates. Resolve shallowest penetration first.
  // Both boxes share the correction; the bed edge is open for falling.
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
        const moveA = depth / 2;
        const moveB = depth / 2;
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
  const supported = applyCargoRails(next, force, dt);
  const grounded = supported.filter(
    (c) => !c.climb && (c.status === 'resting' || c.status === 'sliding'),
  );
  if (
    grounded.some((a, i) =>
      grounded
        .slice(i + 1)
        .some(
          (b) =>
            Math.abs(a.position.x - b.position.x) < CARGO.size - 1e-8 &&
            Math.abs(a.position.z - b.position.z) < CARGO.size - 1e-8,
        ),
    )
  ) {
    return supported.map((c) => {
      if (c.climb || c.status === 'falling' || c.status === 'lost') return c;
      const previous = items.find((p) => p.id === c.id)!;
      return {
        ...c,
        position: { ...previous.position },
        velocity: { x: 0, z: 0 },
        status: 'resting',
      };
    });
  }
  return supported;
}

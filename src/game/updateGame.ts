import type { CourseData, CoursePoint } from '../../shared/course';
import { VEHICLE, FIXED_STEP } from './constants';
export type WallSegment = { a: CoursePoint; b: CoursePoint };
/** throttle・brake は 0〜1（キーボードは 0 か 1）、steering は -1（右）〜1（左）。 */
export type DriveInput = {
  throttle: number;
  brake: number;
  steering: number;
};
const unit = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
export type TruckState = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steering: number;
  collided: boolean;
  distance: number;
};
export function initialTruckState(course: CourseData): TruckState {
  const [p, next] = course.points;
  return {
    x: p.x,
    z: p.z,
    yaw: Math.atan2(next.x - p.x, next.z - p.z),
    speed: 0,
    steering: 0,
    collided: false,
    distance: 0,
  };
}
/** Segment vs vehicle OBB; includes front, sides and rear rather than center only. */
export function hitsWall(state: TruckState, walls: WallSegment[]) {
  const sin = Math.sin(state.yaw),
    cos = Math.cos(state.yaw);
  const halfWidth = VEHICLE.width / 2 + 0.025,
    halfLength = VEHICLE.length / 2 + 0.025;
  function local(p: CoursePoint) {
    const x = p.x - state.x,
      z = p.z - state.z;
    return [x * cos - z * sin, x * sin + z * cos];
  }
  return walls.some(({ a, b }) => {
    const start = local(a),
      end = local(b);
    let low = 0,
      high = 1;
    for (let axis = 0; axis < 2; axis++) {
      const limit = axis === 0 ? halfWidth : halfLength,
        delta = end[axis] - start[axis];
      if (Math.abs(delta) < 1e-10) {
        if (Math.abs(start[axis]) > limit) return false;
      } else {
        const t1 = (-limit - start[axis]) / delta,
          t2 = (limit - start[axis]) / delta;
        low = Math.max(low, Math.min(t1, t2));
        high = Math.min(high, Math.max(t1, t2));
        if (low > high) return false;
      }
    }
    return true;
  });
}
/** Small fixed substeps prevent a fast vehicle from tunnelling through a wall. */
export function updateGame(
  state: TruckState,
  input: DriveInput,
  elapsed: number,
  walls: WallSegment[],
): TruckState {
  let next = { ...state, collided: false };
  let remaining = Math.max(
    0,
    Math.min(Number.isFinite(elapsed) ? elapsed : 0, 0.1),
  );
  while (remaining > 1e-8) {
    const dt = Math.min(remaining, FIXED_STEP);
    remaining -= dt;
    const target = Math.max(
      -1,
      Math.min(1, Number.isFinite(input.steering) ? input.steering : 0),
    );
    next.steering +=
      (target - next.steering) * (1 - Math.exp(-VEHICLE.steeringResponse * dt));
    const throttle = unit(input.throttle),
      brake = unit(input.brake);
    // ブレーキ優先。踏み込みが浅いほど、自然な減速との差し引きで加速が弱くなる
    const accel =
      brake > 0
        ? -VEHICLE.brakeDeceleration * brake -
          VEHICLE.rollingDeceleration * (1 - brake)
        : throttle > 0
          ? VEHICLE.acceleration * throttle -
            VEHICLE.rollingDeceleration * (1 - throttle)
          : -VEHICLE.rollingDeceleration;
    let speed = next.speed + accel * dt;
    // クリープ現象：ブレーキを踏んでいなければ、AT車のようにゆっくり前へ進む
    if (brake === 0 && speed < VEHICLE.creepSpeed)
      speed = Math.min(
        VEHICLE.creepSpeed,
        Math.max(speed, next.speed + VEHICLE.creepAcceleration * dt),
      );
    speed = Math.max(0, Math.min(VEHICLE.maxSpeed, speed));
    const yaw =
      next.yaw + ((next.steering * speed) / VEHICLE.minTurnRadius) * dt;
    const candidate = {
      ...next,
      yaw,
      speed,
      x: next.x + Math.sin(yaw) * speed * dt,
      z: next.z + Math.cos(yaw) * speed * dt,
    };
    if (hitsWall(candidate, walls)) {
      next.speed = 0;
      next.collided = true;
      break;
    }
    candidate.distance += speed * dt;
    next = candidate;
  }
  return next;
}

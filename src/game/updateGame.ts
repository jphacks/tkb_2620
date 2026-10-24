import type { CourseData, CoursePoint } from '../../shared/course';
import { VEHICLE, FIXED_STEP } from './constants.ts';
import { isFiniteTruckState } from './safety.ts';
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
  /** ブレーキの効き（0〜1）。踏むとじわっと上がり、離すと素早く抜ける */
  brakePressure: number;
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
    brakePressure: 0,
  };
}

// 空気抵抗の係数。全開で最高速に達したとき、エンジンの力と抵抗がつり合うように決める
const AIR_DRAG =
  (VEHICLE.enginePower / VEHICLE.maxSpeed - VEHICLE.rollingResistance) /
  VEHICLE.maxSpeed ** 2;

/** 走行抵抗（転がり抵抗＋空気抵抗）による減速。アクセルを離すとこれだけで減速する */
export function dragDeceleration(speed: number) {
  return speed > 0 ? VEHICLE.rollingResistance + AIR_DRAG * speed * speed : 0;
}

/** エンジンの力による加速。低速は一定（タイヤの限界）、速くなるほど出力で頭打ち */
export function driveAcceleration(speed: number, throttle: number) {
  return (
    throttle *
    Math.min(
      VEHICLE.driveAcceleration,
      VEHICLE.enginePower / Math.max(speed, 0.1),
    )
  );
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
    // ブレーキは踏み込むにつれてじわっと効き、離すと素早く抜ける
    const pressure =
      brake > next.brakePressure
        ? Math.min(brake, next.brakePressure + VEHICLE.brakeRise * dt)
        : Math.max(brake, next.brakePressure - VEHICLE.brakeRelease * dt);
    next.brakePressure = pressure;
    // 力のつり合い：エンジン − 走行抵抗 − ブレーキ。踏み込み量に見合った速さで自然に頭打ちになる
    const accel =
      driveAcceleration(next.speed, throttle) -
      dragDeceleration(next.speed) -
      VEHICLE.brakeDeceleration * pressure;
    let speed = next.speed + accel * dt;
    // クリープ現象：ペダルを離していれば、ほんの少しだけ前へ進む（ブレーキで止まる）
    if (brake === 0 && pressure === 0 && speed < VEHICLE.creepSpeed)
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
  // 計算が壊れても（NaN・無限大）位置を飛ばさず、その場で止める（#22）
  if (!isFiniteTruckState(next))
    return {
      ...state,
      speed: 0,
      steering: 0,
      collided: false,
      brakePressure: 0,
    };
  return next;
}

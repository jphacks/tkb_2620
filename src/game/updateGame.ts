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
  wrongWay?: boolean;
  /** 壁に当たって跳ね返る速さ（ワールド座標、m/s）。少しずつ弱まる（BOUNCE） */
  knockX?: number;
  knockZ?: number;
};

/** 壁に当たったときの跳ね返り。壁から押し戻し、後輪などが壁に引っかかったままにならないようにする。
 * 跳ね返りはコースの進む向きと逆には動かさない（逆走させない）。
 */
export const BOUNCE = {
  /** 壁へ向かう速さのうち、跳ね返る割合 */
  restitution: 0.5,
  /** 壁に触れたら、少なくともこの速さで壁から離す */
  minPop: 0.8,
  /** 跳ね返る速さの上限 */
  maxSpeed: 6,
  /** 跳ね返る速さが半分になるまでの秒数 */
  halfLife: 0.22,
  /** 斜めに当たったとき、車の向きを壁に沿う向きへ近づける割合と上限（ラジアン） */
  turnRatio: 0.5,
  maxTurn: 0.3,
  /** この速さ（m/s）で壁へ向かっていたら、向きを目いっぱい変える */
  fullTurnSpeed: 4,
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
/** Resolve a contact on the same side of each wall as the previous safe pose.
 * Keep tangent movement, gently clear the rotated footprint, never cross a wall.
 */
function recoverWallContact(
  previous: TruckState,
  candidate: TruckState,
  walls: WallSegment[],
  dt: number,
): TruckState | null {
  const corrected = { ...candidate };
  for (let pass = 0; pass < 8; pass++) {
    const contacts = walls.filter((wall) => hitsWall(corrected, [wall]));
    if (!contacts.length) {
      const distance = Math.hypot(
        corrected.x - previous.x,
        corrected.z - previous.z,
      );
      // A contact may only nudge us locally, never teleport to the opposite side.
      if (
        distance >
        Math.max(previous.speed, candidate.speed) * dt + 2 * dt + 0.005
      )
        return null;
      return {
        ...corrected,
        speed: Math.min(candidate.speed, 2),
        collided: true,
        distance: previous.distance + distance,
      };
    }
    for (const { a, b } of contacts) {
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.hypot(dx, dz);
      if (length < 1e-9) return null;
      let nx = -dz / length,
        nz = dx / length;
      const side = (previous.x - a.x) * nx + (previous.z - a.z) * nz;
      if (side < 0) {
        nx = -nx;
        nz = -nz;
      }
      const sin = Math.sin(corrected.yaw),
        cos = Math.cos(corrected.yaw);
      const support =
        (VEHICLE.width / 2 + 0.025) * Math.abs(nx * cos - nz * sin) +
        (VEHICLE.length / 2 + 0.025) * Math.abs(nx * sin + nz * cos);
      const separation = (corrected.x - a.x) * nx + (corrected.z - a.z) * nz;
      const push = Math.max(0, support + 0.001 - separation);
      corrected.x += nx * push;
      corrected.z += nz * push;
    }
  }
  return null;
}

/** 坂の重力による加速（上り坂で減速、下り坂で加速）。grade はトラックの向きに上りが正 */
export const GRAVITY = 9.8;

/** コースの進む向きと逆の成分を取り除く（逆走させない） */
function withoutBackward(x: number, z: number, forward?: CoursePoint) {
  if (!forward) return { x, z };
  const along = x * forward.x + z * forward.z;
  return along < 0
    ? { x: x - along * forward.x, z: z - along * forward.z }
    : { x, z };
}

/** 当たった壁から離れる向き（もとの位置の側）と、その向きに跳ね返す速さ */
function bounceOff(
  previous: TruckState,
  candidate: TruckState,
  walls: WallSegment[],
  knock: { x: number; z: number },
  forward?: CoursePoint,
) {
  let nx = 0,
    nz = 0;
  for (const wall of walls) {
    if (!hitsWall(candidate, [wall])) continue;
    const dx = wall.b.x - wall.a.x,
      dz = wall.b.z - wall.a.z,
      length = Math.hypot(dx, dz);
    if (length < 1e-9) continue;
    let wx = -dz / length,
      wz = dx / length;
    if ((previous.x - wall.a.x) * wx + (previous.z - wall.a.z) * wz < 0) {
      wx = -wx;
      wz = -wz;
    }
    nx += wx;
    nz += wz;
  }
  const length = Math.hypot(nx, nz);
  if (length < 1e-9) return { ...knock, turn: 0 };
  nx /= length;
  nz /= length;
  // 壁へ向かっていた速さ（トラックの前進と、いまの跳ね返り）
  const heading = Math.sin(candidate.yaw) * nx + Math.cos(candidate.yaw) * nz;
  const knockInto = knock.x * nx + knock.z * nz;
  const into =
    Math.max(0, -heading) * candidate.speed + Math.max(0, -knockInto);
  const pop = Math.min(
    BOUNCE.maxSpeed,
    Math.max(BOUNCE.minPop, into * BOUNCE.restitution),
  );
  // 斜めに当たったら、車の向きを、いまの向きに近いほうの壁沿いの向きへ少し近づける
  const along = Math.sin(candidate.yaw) * -nz + Math.cos(candidate.yaw) * nx;
  const tangent = along >= 0 ? Math.atan2(-nz, nx) : Math.atan2(nz, -nx);
  let angle = tangent - candidate.yaw;
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  const strength = Math.min(
    1,
    (Math.max(0, -heading) * candidate.speed) / BOUNCE.fullTurnSpeed,
  );
  const turn =
    Math.sign(angle) *
    Math.min(BOUNCE.maxTurn, Math.abs(angle) * BOUNCE.turnRatio) *
    strength;
  // 壁に沿う向きの跳ね返りは残し、壁の向きだけを入れ替える
  return {
    ...withoutBackward(
      knock.x - knockInto * nx + pop * nx,
      knock.z - knockInto * nz + pop * nz,
      forward,
    ),
    turn,
  };
}

/** Small fixed substeps prevent a fast vehicle from tunnelling through a wall. */
export function updateGame(
  state: TruckState,
  input: DriveInput,
  elapsed: number,
  walls: WallSegment[],
  forward?: CoursePoint,
  grade = 0,
): TruckState {
  const slope = Number.isFinite(grade) ? grade : 0;
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
    // 力のつり合い：エンジン − 走行抵抗 − ブレーキ − 坂の重力。踏み込み量に見合った速さで自然に頭打ちになる
    // 坂の角度は小さい（7%まで）ので、重力の坂に沿った分は GRAVITY×grade で近似する
    const accel =
      driveAcceleration(next.speed, throttle) -
      dragDeceleration(next.speed) -
      VEHICLE.brakeDeceleration * pressure -
      GRAVITY * slope;
    let speed = next.speed + accel * dt;
    // クリープ現象：ペダルを離していれば、ほんの少しだけ前へ進む（ブレーキで止まる）。
    // 上り坂では重力の分だけ弱まり、坂に負けるときはその場で止まる（後ろへは下がらない）
    const creep = VEHICLE.creepAcceleration - GRAVITY * Math.max(0, slope);
    if (
      brake === 0 &&
      pressure === 0 &&
      speed < VEHICLE.creepSpeed &&
      creep > 0
    )
      speed = Math.min(
        VEHICLE.creepSpeed,
        Math.max(speed, next.speed + creep * dt),
      );
    speed = Math.max(0, Math.min(VEHICLE.maxSpeed, speed));
    // Gameplay assistance: while touching a wall, the wheel can turn a nearly
    // stopped truck under throttle. Braking still holds the vehicle stationary.
    const headingAgainstCourse = forward
      ? Math.sin(next.yaw) * forward.x + Math.cos(next.yaw) * forward.z < 0
      : false;
    const turningSpeed =
      (state.collided || next.collided || headingAgainstCourse) &&
      throttle > 0 &&
      brake === 0
        ? Math.max(speed, 2)
        : speed;
    const yaw =
      next.yaw + ((next.steering * turningSpeed) / VEHICLE.minTurnRadius) * dt;
    // 壁からの跳ね返りは少しずつ弱める。進む向きと逆には動かさない
    const decay = 0.5 ** (dt / BOUNCE.halfLife);
    const knock = withoutBackward(
      Number.isFinite(next.knockX) ? next.knockX! * decay : 0,
      Number.isFinite(next.knockZ) ? next.knockZ! * decay : 0,
      forward,
    );
    const candidate = {
      ...next,
      yaw,
      speed,
      x: next.x + Math.sin(yaw) * speed * dt + knock.x * dt,
      z: next.z + Math.cos(yaw) * speed * dt + knock.z * dt,
      knockX: knock.x,
      knockZ: knock.z,
    };
    candidate.wrongWay = forward
      ? Math.sin(yaw) * forward.x + Math.cos(yaw) * forward.z < -1e-8
      : false;
    if (candidate.wrongWay) {
      candidate.x = next.x + knock.x * dt;
      candidate.z = next.z + knock.z * dt;
      candidate.speed = 0;
    }
    if (hitsWall(candidate, walls)) {
      const bounce = bounceOff(next, candidate, walls, knock, forward);
      const recovered = recoverWallContact(next, candidate, walls, dt);
      if (recovered) {
        const backwards =
          forward &&
          (recovered.x - next.x) * forward.x +
            (recovered.z - next.z) * forward.z <
            -1e-8;
        if (!backwards) next = recovered;
        else {
          const rotationOnly = {
            ...recovered,
            x: next.x,
            z: next.z,
            speed: 0,
            distance: next.distance,
          };
          next = hitsWall(rotationOnly, walls)
            ? { ...next, speed: 0, collided: true }
            : rotationOnly;
        }
      } else next = { ...next, speed: 0, collided: true };
      next = { ...next, knockX: bounce.x, knockZ: bounce.z };
      // 向きを変えても壁に入らず、逆向きにもならないときだけ、壁に沿う向きへ曲げる
      if (bounce.turn) {
        const turned = { ...next, yaw: next.yaw + bounce.turn };
        const reversed =
          forward &&
          Math.sin(turned.yaw) * forward.x + Math.cos(turned.yaw) * forward.z <
            -1e-8;
        if (!reversed && !hitsWall(turned, walls)) next = turned;
      }
      continue;
    }
    candidate.collided = next.collided;
    candidate.distance += candidate.speed * dt;
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

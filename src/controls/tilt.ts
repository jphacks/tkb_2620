/**
 * スマホの傾きから操作値を作る計算（Issue #14）。React・ブラウザAPIに依存しない。
 *
 * DeviceOrientationEvent の beta（前後）・gamma（左右）から、スマホの座標系
 * （右が+x、画面の上端方向が+y、画面の手前が+z）で見た「真上」の向きを求める。
 * オイラー角のままだと縦持ち・横持ちで値が跳ぶため、重力の向きから角度を出す。
 */
export type Vec3 = { x: number; y: number; z: number };

const RAD = Math.PI / 180;

/** スマホ座標で見た真上の向き（単位ベクトル）。W3Cの回転順序 Z-X'-Y'' による。 */
export function upVector(beta: number, gamma: number): Vec3 {
  const b = beta * RAD,
    g = gamma * RAD;
  return {
    x: -Math.cos(b) * Math.sin(g),
    y: Math.sin(b),
    z: Math.cos(b) * Math.cos(g),
  };
}

/** 角度の差を -180〜180 に収める。 */
export function wrapDegrees(angle: number): number {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

/**
 * 画面と平行な回転（ハンドルを回す動き）の角度。右に回すと小さくなる。
 * スマホを寝かせると定まらないので、そのときは null。
 */
export function wheelAngle(up: Vec3): number | null {
  if (Math.hypot(up.x, up.y) < 0.35) return null;
  return Math.atan2(up.x, up.y) / RAD;
}

/** 画面の上端を奥へ倒すと大きく、手前へ倒すと小さくなる角度（縦持ちのペダル）。 */
export function pitchAngle(up: Vec3): number {
  return Math.atan2(up.z, up.y) / RAD;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 遊び（deadZone）を除いて 0〜1 に。 */
function scale(amount: number, deadZone: number, fullAt: number) {
  if (amount <= deadZone) return 0;
  return clamp((amount - deadZone) / (fullAt - deadZone), 0, 1);
}

export const STEERING = { deadZone: 4, maxAngle: 45 };
export const PEDAL = { deadZone: 6, fullAngle: 30 };

/** 基準からの回転角 → ハンドル（左が+1、右が-1。キーボードと同じ向き）。 */
export function toSteering(angle: number, base: number, config = STEERING) {
  const delta = wrapDegrees(angle - base);
  const amount = scale(Math.abs(delta), config.deadZone, config.maxAngle);
  return delta >= 0 || amount === 0 ? amount : -amount;
}

/** 基準からの前後の傾き → 奥へ倒すとアクセル、手前へ倒すとブレーキ（0〜1）。 */
export function toPedal(angle: number, base: number, config = PEDAL) {
  const delta = wrapDegrees(angle - base);
  return {
    throttle: scale(delta, config.deadZone, config.fullAngle),
    brake: scale(-delta, config.deadZone, config.fullAngle),
  };
}

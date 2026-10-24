/** Provisional game-space values; align vehicle/cargo dimensions before #15. */
export const VEHICLE = {
  width: 1.2,
  length: 2.4,
  maxSpeed: 18,
  acceleration: 6,
  brakeDeceleration: 7,
  rollingDeceleration: 0.7,
  /** クリープ現象：ペダルを離したときにゆっくり進む速さと、そこまでの加速 */
  creepSpeed: 1.5,
  creepAcceleration: 1.5,
  minTurnRadius: 6,
  steeringResponse: 5,
};
export const FIXED_STEP = 1 / 120;

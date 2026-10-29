/** Provisional game-space values. Cargo and bed sizes follow this truck (see cargo.ts, #15). */
export const TRUCK_SCALE = 1.1;
export const VEHICLE = {
  width: 1.2 * TRUCK_SCALE,
  length: 2.4 * TRUCK_SCALE,
  // 加速・最高速は、荷物を積んだ軽トラック（約660cc・約50馬力・約1トン）に近い値にする。
  // 坂の重力（7%で約0.7m/s²）が、アクセルを踏むかどうかで効いてくるようにするため
  /** 全開で最終的に届く最高速（約115km/h）。空気抵抗はこれに合わせて決まる */
  maxSpeed: 32,
  /** 低速でのアクセル全開の加速（0→40km/hを約4秒） */
  driveAcceleration: 3,
  /** エンジンの出力（加速×速さ、W/kg）。約50馬力（37kW）のうちタイヤに届く分を、約1トンで割った値 */
  enginePower: 32,
  /** 転がり抵抗。アクセルを離して遅いときは、ほとんどこれだけで減速する */
  rollingResistance: 0.3,
  /** ブレーキを目一杯効かせたときの減速 */
  brakeDeceleration: 10,
  /** ブレーキの効きが上がる・抜ける速さ（1秒あたり）。約0.4秒で目一杯になる */
  brakeRise: 2.5,
  brakeRelease: 6,
  /** クリープ現象：ペダルを離したときにほんの少し進む速さと、そこまでの加速 */
  creepSpeed: 0.8,
  creepAcceleration: 0.4,
  minTurnRadius: 6,
  steeringResponse: 5,
};
export const FIXED_STEP = 1 / 120;

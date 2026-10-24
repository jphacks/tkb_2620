import { TRUCK_SCALE } from './constants.ts';
/**
 * 積荷（Issue #15）。Three.js・画面に依存しない。
 *
 * 荷物は荷台の中心を原点にしたローカル座標で持つ（トラックと同じ向き：+x が左、+z が前）。
 * 荷物ごとに状態・位置・速度を持ち、滑り（#16）・落下（#17）でこの値を更新する。
 * 大きさは今のトラックの模型（createTruck）に合わせる。
 */

/** Usable area of the flatbed, between the side rails and from the tail rail to the cab. */
export const BED = {
  /** Bed center in truck-local coordinates. */
  center: { x: 0, y: 0.55 * TRUCK_SCALE, z: -0.395 * TRUCK_SCALE },
  width: 1.08 * TRUCK_SCALE,
  length: 1.39 * TRUCK_SCALE,
};

export const CARGO = {
  /** Start with one box to check placement, then three (Issue #15). */
  count: 3,
  /** Cardboard box edge length. */
  size: 0.4 * TRUCK_SCALE,
  /** Space kept between boxes and from the rails. */
  gap: 0.08 * TRUCK_SCALE,
};

/** resting: on the bed / sliding: moving on the bed (#16) / falling: left the bed (#17) / lost: gone. */
export type CargoStatus = 'resting' | 'sliding' | 'falling' | 'lost';

export type CargoItem = {
  /** World-space flight, set once when leaving the bed. */
  fall?: {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    elapsed: number;
    /** Fixed location where the box left the bed (for minimap). */
    origin?: { x: number; z: number };
    yaw: number;
  };
  /** Small lift above the bed when climbing a rail. */
  lift?: number;
  railPressure?: number;
  climb?: {
    from: { x: number; z: number };
    to: { x: number; z: number };
    elapsed: number;
  };
  id: number;
  status: CargoStatus;
  /** Bed-local position of the box center on the bed floor. */
  position: { x: number; z: number };
  /** Bed-local velocity (used from #16). */
  velocity: { x: number; z: number };
};

export type BedSize = { width: number; length: number };

/**
 * Lay boxes out in one layer, filling rows from the front (cab side).
 * Each row is centered across the bed; rows are spread evenly along it.
 * Three boxes give two at the front and one behind, as agreed for Issue #15.
 */
export function createCargoLayout(
  count: number = CARGO.count,
  size: number = CARGO.size,
  bed: BedSize = BED,
  gap: number = CARGO.gap,
): CargoItem[] {
  if (!Number.isInteger(count) || count < 0)
    throw new Error('荷物の数は0以上の整数にしてください。');
  if (!(size > 0) || !(gap >= 0) || !(bed.width > 0) || !(bed.length > 0))
    throw new Error('荷物・荷台の大きさが不正です。');
  if (!count) return [];
  const pitch = size + gap;
  const perRow = Math.floor((bed.width - gap) / pitch);
  const rows = perRow > 0 ? Math.ceil(count / perRow) : Infinity;
  if (rows * pitch + gap > bed.length + 1e-9)
    throw new Error(`荷台に${count}個の荷物を1段で載せられません。`);
  // Rows spread evenly between the front and back limits of the bed.
  const front = bed.length / 2 - gap - size / 2,
    back = -front;
  const items: CargoItem[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(perRow, count - row * perRow);
    const z = rows === 1 ? 0 : front + ((back - front) * row) / (rows - 1);
    for (let k = 0; k < inRow; k++)
      items.push({
        id: items.length,
        status: 'resting',
        position: { x: (k - (inRow - 1) / 2) * pitch, z },
        velocity: { x: 0, z: 0 },
      });
  }
  return items;
}

/** Boxes still on the truck (not falling or lost). */
export function remainingCargo(items: readonly CargoItem[]): number {
  return items.filter((c) => c.status === 'resting' || c.status === 'sliding')
    .length;
}

/** Bed-local position to truck-local position (the truck group's own coordinates). */
export function bedToTruck(position: { x: number; z: number }) {
  return {
    x: BED.center.x + position.x,
    y: BED.center.y,
    z: BED.center.z + position.z,
  };
}

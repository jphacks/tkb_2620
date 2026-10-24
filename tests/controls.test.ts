import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pitchAngle,
  smoothAngle,
  SMOOTHING_SECONDS,
  toPedal,
  toSteering,
  upVector,
  wheelAngle,
  wrapDegrees,
} from '../src/controls/tilt.ts';
import { sanitizeUnit } from '../shared/controls.ts';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('up vector follows how the phone is held (#14)', () => {
  const flat = upVector(0, 0);
  close(flat.z, 1); // 机に置くと真上は画面の手前
  const portrait = upVector(90, 0);
  close(portrait.y, 1); // 縦に立てると真上は画面の上端
  const landscape = upVector(0, -90);
  close(landscape.x, 1); // 横向きに立てると真上はスマホの右側
  close(Math.hypot(landscape.x, landscape.y, landscape.z), 1);
});

test('wheel angle: turning the phone right lowers the angle and steers right (#14)', () => {
  const turned = (deg: number) => {
    const r = (deg * Math.PI) / 180; // 時計回りに回すと、真上はスマホに対して反時計回りに動く
    return { x: -Math.sin(r), y: Math.cos(r), z: 0 };
  };
  close(wheelAngle(turned(0))!, 0);
  close(wheelAngle(turned(30))!, -30);
  assert.ok(
    toSteering(wheelAngle(turned(30))!, 0) < 0,
    '右へ回すと右（マイナス）',
  );
  assert.ok(
    toSteering(wheelAngle(turned(-30))!, 0) > 0,
    '左へ回すと左（プラス）',
  );
  assert.equal(
    wheelAngle({ x: 0.1, y: 0.1, z: 0.99 }),
    null,
    '寝かせると決まらない',
  );
});

test('steering has a dead zone, saturates and wraps around ±180° (#14)', () => {
  assert.equal(toSteering(3, 0), 0);
  assert.equal(toSteering(-3, 0), 0);
  assert.equal(toSteering(45, 0), 1);
  assert.equal(toSteering(-90, 0), -1);
  assert.ok(toSteering(24.5, 0) > 0.4 && toSteering(24.5, 0) < 0.6);
  // 基準が170°、今が-170°なら差は+20°（一周をまたいでも跳ばない）
  close(wrapDegrees(-170 - 170), 20);
  assert.ok(toSteering(-170, 170) > 0);
});

test('pedal: tilting the top away accelerates, toward you brakes (#14)', () => {
  const upright = pitchAngle(upVector(90, 0));
  close(upright, 0);
  const away = pitchAngle(upVector(60, 0)); // 上端を奥へ倒す＝画面が空を向く
  const toward = pitchAngle(upVector(120, 0));
  assert.deepEqual(toPedal(upright, upright), { throttle: 0, brake: 0 });
  assert.equal(toPedal(away, upright).throttle, 1);
  assert.equal(toPedal(away, upright).brake, 0);
  assert.equal(toPedal(toward, upright).brake, 1);
  assert.equal(toPedal(upright + 4, upright).throttle, 0, '遊びの範囲');
});

test('values from the network are clamped, and non-numbers become 0 (#14)', () => {
  assert.equal(sanitizeUnit(2), 1);
  assert.equal(sanitizeUnit(-2), 0);
  assert.equal(sanitizeUnit(-2, -1), -1);
  assert.equal(sanitizeUnit(0.25), 0.25);
  assert.equal(sanitizeUnit(Number.NaN), 0);
  assert.equal(sanitizeUnit('1'), 0);
  assert.equal(sanitizeUnit(undefined), 0);
});

test('smoothing follows the tilt gradually and takes the short way around ±180° (#14)', () => {
  const tau = SMOOTHING_SECONDS;
  close(smoothAngle(0, 10, tau), 10 * (1 - Math.exp(-1)));
  assert.equal(smoothAngle(5, 30, 0), 5, '時間が進まなければ動かない');
  assert.ok(smoothAngle(0, 10, 0.4) > 9.8, '大きく傾ければすぐ追いつく');
  const across = smoothAngle(170, -170, tau);
  assert.ok(across > 170 || across < -170, '0°側を通らず、近い向きに回る');
  let angle = 0;
  for (let i = 0; i < 60; i++)
    angle = smoothAngle(angle, i % 2 ? 3 : -3, 1 / 60);
  assert.ok(Math.abs(angle) < 1, '細かい揺れは小さくなる');
});

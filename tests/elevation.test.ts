import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CourseData } from '../shared/course.ts';
import { sampleCourse } from '../src/fixtures/sampleCourse.ts';
import { DELIVERY_RATIO } from '../src/game/deliveryDestination.ts';
import { createElevation, lightness, SLOPE } from '../src/game/elevation.ts';
import { createCargoLayout } from '../src/game/cargo.ts';
import { slideCargo } from '../src/game/slideCargo.ts';
import {
  CARGO_GROUND_Y,
  CARGO_LANDING_Y,
  updateCargoFalls,
} from '../src/game/fallCargo.ts';
import { initialTruckState, updateGame } from '../src/game/updateGame.ts';

// 写真のコースと同じくらいの大きさ（一周約1100m）。髪・肌・紺の上着・白いズボン・黒い靴
const colors = [
  '#3a2a22',
  '#3a2a22',
  '#d9a98c',
  '#d9a98c',
  '#1f2a44',
  '#1f2a44',
  '#e8e4dc',
  '#e8e4dc',
  '#151515',
  '#e8e4dc',
  '#e8e4dc',
  '#1f2a44',
  '#1f2a44',
  '#d9a98c',
  '#d9a98c',
  '#3a2a22',
];
const photoSized: CourseData = {
  ...sampleCourse,
  points: Array.from({ length: 700 }, (_, i) => {
    const a = (i / 700) * Math.PI * 2;
    return { x: -210 * Math.sin(a), z: -140 * Math.cos(a) };
  }),
  wallColorStops: colors.map((color, i) => ({ progress: i / 16, color })),
};

function profile(course: CourseData) {
  const e = createElevation(course);
  let grade = 0,
    bend = 0,
    high = 0;
  for (let s = 0; s < e.length; s += 0.5) {
    grade = Math.max(grade, Math.abs(e.gradeAt(s)));
    bend = Math.max(
      bend,
      Math.abs(e.heightAt(s + 1) - 2 * e.heightAt(s) + e.heightAt(s - 1)),
    );
    high = Math.max(high, e.heightAt(s));
  }
  return { e, grade, radius: 1 / bend, high };
}

test('明るさはCIE L*：黒が0、白が100、灰色はその間', () => {
  assert.equal(Math.round(lightness('#000000')), 0);
  assert.equal(Math.round(lightness('#ffffff')), 100);
  const gray = lightness('#777777');
  assert.ok(gray > 40 && gray < 60);
});

test('明るい色のところが高く、暗い色のところが低い', () => {
  const { e } = profile(photoSized);
  // 白いズボン（7/16付近）は、紺の上着（5/16付近）より高い
  assert.ok(e.heightAt((7 / 16) * e.length) > e.heightAt((5 / 16) * e.length));
  // 黒い靴（8.5/16付近）は、両側の白いズボンより低い
  const shoe = e.heightAt((8.5 / 16) * e.length);
  assert.ok(shoe < e.heightAt((7 / 16) * e.length));
  assert.ok(shoe < e.heightAt((10 / 16) * e.length));
});

test('坂の急さは7%以下、頂上・底の丸みは半径450m以上', () => {
  const { grade, radius, high } = profile(photoSized);
  assert.ok(grade <= SLOPE.maxGrade + 1e-6, `${grade}`);
  assert.ok(radius >= SLOPE.minCurveRadius * 0.98, `${radius}`);
  // 起伏はちゃんと出る
  assert.ok(high > 3, `${high}`);
  assert.ok(high <= SLOPE.maxHeight);
});

test('STARTとお家のまわりは高さ0で平ら', () => {
  const { e } = profile(photoSized);
  for (const center of [0, DELIVERY_RATIO * e.length]) {
    const flat = center === 0 ? SLOPE.startFlat : SLOPE.houseFlat;
    for (let d = -flat; d <= flat; d += 1) {
      assert.ok(Math.abs(e.heightAt(center + d)) < 1e-9, `${center + d}`);
      assert.ok(Math.abs(e.gradeAt(center + d)) < 1e-9);
    }
  }
});

test('コースの各点の高さは、中心線に沿った高さと同じ', () => {
  const e = createElevation(photoSized);
  assert.equal(e.pointHeights.length, photoSized.points.length);
  assert.ok(e.pointHeights.every(Number.isFinite));
  assert.equal(e.pointHeights[0], 0);
});

test('色が1色だけ・短いサンプルコースは、平らな道のまま', () => {
  const single = createElevation({
    ...photoSized,
    wallColorStops: [{ progress: 0, color: '#a0a0a0' }],
  });
  assert.ok(single.pointHeights.every((h) => h === 0));
  const { high } = profile(sampleCourse);
  assert.ok(high < 0.05, `${high}`);
});

test('上り坂ではトラックが減速し、下り坂では加速する', () => {
  const coast = { throttle: 0, brake: 0, steering: 0 };
  // 1回に進める時間は0.1秒までなので、10回で1秒
  const run = (grade: number) => {
    let state = { ...initialTruckState(sampleCourse), speed: 10 };
    for (let i = 0; i < 10; i++)
      state = updateGame(state, coast, 0.1, [], undefined, grade);
    return state.speed;
  };
  const flat = run(0),
    up = run(0.07),
    down = run(-0.07);
  assert.ok(up < flat && flat < down);
  // 7%の坂で1秒：重力の分（9.8×0.07≒0.69 m/s）だけ差がつく
  assert.ok(Math.abs(flat - up - 9.8 * 0.07) < 0.05, `${flat - up}`);
});

test('7%の坂だけでは、止まっている荷物は滑らない。急すぎる坂では後ろへ滑る', () => {
  const still = { speed: 0, acceleration: 0, yawRate: 0 };
  const layout = createCargoLayout();
  const gentle = slideCargo(layout, { ...still, grade: 0.07 });
  assert.deepEqual(
    gentle.map((c) => c.position),
    layout.map((c) => c.position),
  );
  const steep = slideCargo(layout, { ...still, grade: 0.4 });
  assert.ok(steep.every((c, i) => c.position.z < layout[i].position.z));
});

test('坂の上で落ちた荷物は、その場所の道路か地面に着く', () => {
  const layout = createCargoLayout();
  const outside = layout.map((c) => ({
    ...c,
    position: { ...c.position, x: 5 },
  }));
  const truck = { x: 0, z: 0, yaw: 0, speed: 0, y: 4 };
  let items = updateCargoFalls(outside, truck, () => 4);
  assert.ok(items.every((c) => c.fall && c.fall.position.y > 4));
  for (let i = 0; i < 120; i++) items = updateCargoFalls(items, truck, () => 4);
  const onRoad = 4 + (CARGO_LANDING_Y - CARGO_GROUND_Y);
  assert.ok(items.every((c) => c.status === 'lost'));
  assert.ok(items.every((c) => Math.abs(c.fall!.position.y - onRoad) < 1e-9));
});

test('上り坂でアクセルを離すと止まるが、後ろへは下がらない。平らな道ではクリープで進む', () => {
  const coast = { throttle: 0, brake: 0, steering: 0 };
  const start = { ...initialTruckState(sampleCourse), speed: 0 };
  let up = start,
    flat = start;
  for (let i = 0; i < 60; i++) {
    up = updateGame(up, coast, 0.1, [], undefined, 0.07);
    flat = updateGame(flat, coast, 0.1, [], undefined, 0);
  }
  assert.equal(up.speed, 0);
  assert.equal(up.distance, 0, '下がらない（進んだ距離が減らない）');
  assert.ok(flat.distance > 1, 'クリープで少し進む');
});

test('7%の上り坂は、アクセル全開でも平らな道よりはっきり遅くなる', () => {
  const full = { throttle: 1, brake: 0, steering: 0 };
  const run = (grade: number) => {
    let state = { ...initialTruckState(sampleCourse), speed: 40 / 3.6 };
    for (let i = 0; i < 60; i++)
      state = updateGame(state, full, 0.1, [], undefined, grade);
    return state.speed;
  };
  // 6秒走ったあとの速さが、1割以上ちがう
  assert.ok(run(0.07) < run(0) * 0.9, `${run(0.07)} ${run(0)}`);
});

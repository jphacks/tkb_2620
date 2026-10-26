import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COURIER_SECONDS, courierPose } from '../src/game/courier.ts';
import { deliveryFailed } from '../src/game/score.ts';

test('積荷が0個でお家に着いたら「配達失敗」。1個でも残れば失敗ではない', () => {
  assert.equal(deliveryFailed({ cargoRemaining: 0, cargoTotal: 3 }), true);
  assert.equal(deliveryFailed({ cargoRemaining: 1, cargoTotal: 3 }), false);
  assert.equal(deliveryFailed({ cargoRemaining: 3, cargoTotal: 3 }), false);
  // 積荷を数えていないとき（total 0）は失敗にしない
  assert.equal(deliveryFailed({ cargoRemaining: 0, cargoTotal: 0 }), false);
});

test('配達員は運転席のドア（右側）から降りて、カメラのほうを向く', () => {
  const start = courierPose(0);
  assert.ok(start.x < 0, '右側（−X）');
  assert.ok(start.z > 0.5, '運転席の横');
  const walked = courierPose(0.9);
  assert.ok(walked.x < start.x, 'トラックから離れる');
  assert.ok(walked.z < 0, '荷台の横まで下がる');
  assert.ok(
    Math.abs(walked.yaw + Math.PI) < 1e-9,
    'カメラのほう（後ろ）を向く',
  );
});

test('最後はひざをついて、手を地面につき、うなだれる', () => {
  const stand = courierPose(0.9),
    end = courierPose(COURIER_SECONDS);
  assert.ok(end.hip < stand.hip, '腰が下がる');
  assert.ok(end.torso > 1.2, '胴が前に倒れる');
  assert.ok(Math.abs(end.shinLeft - Math.PI / 2) < 1e-9, 'すねが地面に沿う');
  // 腕は胴の傾きを打ち消して、ほぼまっすぐ下（少し前）に伸びる
  const armWorld = end.torso + end.armLeft;
  assert.ok(armWorld < 0 && armWorld > -0.3, `${armWorld}`);
  assert.ok(end.head > 0, 'うつむく');
});

test('演出の時間を過ぎても、不正な時間でも、姿勢は有限の値', () => {
  for (const t of [-1, 0, 1, COURIER_SECONDS, 10, Number.NaN])
    assert.ok(Object.values(courierPose(t)).every(Number.isFinite), `${t}`);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTROLLER_SILENT_MS,
  controllerLossReason,
  isFiniteTruckState,
  sanitizeDriveInput,
  validateCourseData,
} from '../src/game/safety.ts';
import { initialTruckState, updateGame } from '../src/game/updateGame.ts';
import type { CourseData } from '../shared/course.ts';
import type { RoomState } from '../shared/socket.ts';

const course: CourseData = {
  points: Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return { x: -24 * Math.sin(a), z: -16 * Math.cos(a) };
  }),
  wallColorStops: [{ progress: 0, color: '#a0a0a0' }],
  themeColor: '#f2a65a',
  roadWidth: 6,
  captureMode: 'full_body',
};

test('a valid course passes; broken ones explain what is wrong', () => {
  assert.equal(validateCourseData(course), null);
  assert.match(
    validateCourseData({ ...course, points: course.points.slice(0, 2) })!,
    /点が足りません/,
  );
  const nan = course.points.map((p, i) => (i === 3 ? { x: NaN, z: p.z } : p));
  assert.match(validateCourseData({ ...course, points: nan })!, /座標/);
  assert.match(validateCourseData({ ...course, roadWidth: 0 })!, /道幅/);
  assert.match(
    validateCourseData({
      ...course,
      wallColorStops: [{ progress: 2, color: '#a0a0a0' }],
    })!,
    /壁の色/,
  );
  assert.match(
    validateCourseData({ ...course, themeColor: 'red' })!,
    /テーマ色/,
  );
});

test('drive input is always finite and in range', () => {
  assert.deepEqual(sanitizeDriveInput(null), {
    steering: 0,
    throttle: 0,
    brake: 0,
  });
  assert.deepEqual(
    sanitizeDriveInput({ steering: NaN, throttle: Infinity, brake: -3 }),
    { steering: 0, throttle: 0, brake: 0 },
  );
  assert.deepEqual(
    sanitizeDriveInput({ steering: -5, throttle: 0.5, brake: 7 }),
    { steering: -1, throttle: 0.5, brake: 1 },
  );
});

test('NaN never moves the truck: broken input or state stops it in place', () => {
  const start = initialTruckState(course);
  const moving = updateGame(
    start,
    { throttle: 1, brake: 0, steering: 0 },
    0.5,
    [],
  );
  assert.ok(isFiniteTruckState(moving) && moving.speed > 0);
  for (const input of [
    { throttle: NaN, brake: NaN, steering: NaN },
    { throttle: Infinity, brake: 0, steering: -Infinity },
  ]) {
    const next = updateGame(moving, input, 0.1, []);
    assert.ok(isFiniteTruckState(next));
  }
  assert.ok(
    isFiniteTruckState(
      updateGame(moving, { throttle: 1, brake: 0, steering: 0 }, NaN, []),
    ),
  );
  // A state that is already broken comes back stopped and finite in speed.
  const broken = { ...moving, x: NaN };
  const after = updateGame(
    broken,
    { throttle: 1, brake: 0, steering: 0 },
    0.1,
    [],
  );
  assert.equal(after.speed, 0);
  assert.equal(isFiniteTruckState(after), false);
  assert.equal(isFiniteTruckState(moving), true);
});

const room = (steering: string | null, pedal: string | null): RoomState => ({
  roomId: 'ABCDEF',
  hostId: 'pc',
  steering,
  pedal,
});

test('keyboard-only play is never paused', () => {
  assert.equal(
    controllerLossReason({
      used: new Set(),
      room: null,
      connected: false,
      lastInputAt: {},
      now: 0,
    }),
    null,
  );
});

test('pauses when a phone that was driving leaves, goes silent, or the server drops', () => {
  const used = new Set(['steering', 'pedal'] as const);
  const now = 10_000;
  const fresh = { steering: now - 100, pedal: now - 100 };
  assert.equal(
    controllerLossReason({
      used,
      room: room('a', 'b'),
      connected: true,
      lastInputAt: fresh,
      now,
    }),
    null,
  );
  assert.match(
    controllerLossReason({
      used,
      room: room('a', null),
      connected: true,
      lastInputAt: fresh,
      now,
    })!,
    /アクセル・ブレーキのスマホとの接続が切れました/,
  );
  assert.match(
    controllerLossReason({
      used,
      room: room('a', 'b'),
      connected: true,
      lastInputAt: { ...fresh, steering: now - CONTROLLER_SILENT_MS - 1 },
      now,
    })!,
    /ハンドルのスマホから操作が届いていません/,
  );
  assert.match(
    controllerLossReason({
      used,
      room: null,
      connected: false,
      lastInputAt: fresh,
      now,
    })!,
    /サーバーとの接続が切れました/,
  );
  // A phone that just joined and has not sent yet does not pause the game.
  assert.equal(
    controllerLossReason({
      used,
      room: room('a', 'b'),
      connected: true,
      lastInputAt: { steering: now - 100 },
      now,
    }),
    null,
  );
});

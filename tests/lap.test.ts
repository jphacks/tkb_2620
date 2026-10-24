import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLapTrack,
  formatTime,
  REQUIRED_LAP_RATIO,
  startLap,
  updateLap,
  type LapState,
  type LapTrack,
} from '../src/game/lap.ts';

// 半径20の円を反時計回り（上から見て）に160点。points[0] がSTART
const N = 160,
  R = 20;
const circle = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2;
  return { x: R * Math.sin(a), z: -R * Math.cos(a) };
});
const track = createLapTrack(circle, 6);
const HALF_LENGTH = 1.2; // トラックの中心から先端まで

/** 中心線上の距離 s の位置と向き（s が増える向きが前） */
function pose(s: number) {
  const a = (s / track.length) * Math.PI * 2;
  const center = { x: R * Math.sin(a), z: -R * Math.cos(a) };
  const forward = { x: Math.cos(a), z: Math.sin(a) };
  return {
    center,
    front: {
      x: center.x + forward.x * HALF_LENGTH,
      z: center.z + forward.z * HALF_LENGTH,
    },
  };
}

/** s の列に沿って動かし、ゴールした時点の s（しなければ null）を返す */
function drive(path: number[], t: LapTrack = track) {
  let p = pose(path[0]);
  let state: LapState = startLap(t, p.center, p.front);
  for (const s of path.slice(1)) {
    p = pose(s);
    state = updateLap(t, state, p.center, p.front);
    if (state.finished) return { at: s, state };
  }
  return { at: null, state };
}
const range = (from: number, to: number, step = 0.3) => {
  const out = [];
  for (let s = from; step > 0 ? s <= to : s >= to; s += step) out.push(s);
  return out;
};

test('the track length includes the closing segment (#19)', () => {
  const chord = 2 * R * Math.sin(Math.PI / N);
  assert.ok(Math.abs(track.length - chord * N) < 1e-9);
});

test('one full lap finishes when the front crosses the START line (#19)', () => {
  const { at } = drive(range(0, track.length + 5));
  assert.ok(at !== null, 'ゴールする');
  // 先端がSTARTを越えるのは、中心が一周の長さ − 先端までの距離に来たとき
  assert.ok(Math.abs(at - (track.length - HALF_LENGTH)) < 0.5, `at=${at}`);
});

test('wiggling over the START line right after starting is not a goal (#19)', () => {
  const path = [
    ...range(0, 3),
    ...range(3, -3, -0.3),
    ...range(-3, 3),
    ...range(3, -2, -0.3),
    ...range(-2, 4),
  ];
  assert.equal(drive(path).at, null);
});

test('driving backwards around the course never counts as a lap (#19)', () => {
  const { at, state } = drive(range(0, -track.length - 5, -0.3));
  assert.equal(at, null);
  assert.ok(state.progress < 0);
});

test('going halfway, reversing back to START and crossing again is not a goal (#19)', () => {
  const half = track.length / 2;
  const path = [...range(0, half), ...range(half, -3, -0.3), ...range(-3, 5)];
  assert.equal(drive(path).at, null);
});

test('crossing the START line without enough progress is not a goal (#19)', () => {
  // 進み具合が足りないまま先端だけSTARTを越えても（ワープしたような場合）ゴールにしない
  let p = pose(0);
  let state = startLap(track, p.center, p.front);
  // 近くの区間だけを探すので、1フレームで進める量は限られる。足りないまま2フレームで越えさせる
  for (const s of range(0, track.length * (REQUIRED_LAP_RATIO - 0.35))) {
    p = pose(s);
    state = updateLap(track, state, p.center, p.front);
  }
  const behind = pose(track.length - HALF_LENGTH - 0.5),
    ahead = pose(track.length - HALF_LENGTH + 0.5);
  state = updateLap(track, state, behind.center, behind.front);
  state = updateLap(track, state, ahead.center, ahead.front);
  assert.equal(state.finished, false);
});

test('after finishing, the lap state stays finished (#19)', () => {
  const { state } = drive(range(0, track.length + 5));
  const p = pose(10);
  assert.equal(updateLap(track, state, p.center, p.front), state);
});

test('time is shown as minutes:seconds.tenths (#19)', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(9.04), '0:09.0');
  assert.equal(formatTime(65.26), '1:05.3');
  assert.equal(formatTime(-1), '0:00.0');
});

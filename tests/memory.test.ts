import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORGOTTEN_AFTER_DAYS,
  FORGOTTEN_SCORE,
  memoryFade,
  memoryScore,
  retention,
  sortByMemory,
  timeAgo,
} from '../src/game/memoryScore.ts';

const near = (actual: number, expected: number, eps = 0.5) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≈ ${expected}`);

test('the Ebbinghaus fit matches his measured savings (#30)', () => {
  // エビングハウスの実験値（%）：20分 58.2、1時間 44.2、1日 33.7、6日 25.4、31日 21.1
  near(retention(20), 57.0, 0.5);
  near(retention(60), 47.3, 0.5);
  near(retention(24 * 60), 30.4, 0.5);
  near(retention(6 * 24 * 60), 24.9, 0.5);
  near(retention(31 * 24 * 60), 21.2, 0.5);
  for (const [minutes, measured] of [
    [20, 58.2],
    [60, 44.2],
    [24 * 60, 33.7],
    [31 * 24 * 60, 21.1],
  ])
    assert.ok(Math.abs(retention(minutes) - measured) < 4, `${minutes}分`);
});

test('right after playing the score is 100, and it only goes down (#30)', () => {
  assert.equal(retention(0), 100);
  assert.equal(retention(1), 100);
  let previous = 100;
  for (const minutes of [2, 10, 60, 600, 6000, 60000, 600000]) {
    const value = retention(minutes);
    assert.ok(value < previous && value > 0);
    previous = value;
  }
});

test('a course never played counts from when it was made (#30)', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const made = { createdAt: '2026-10-24T11:00:00Z', lastPlayedAt: null };
  near(memoryScore(made, now), retention(60), 1e-9);
  const played = { ...made, lastPlayedAt: '2026-10-24T11:59:30Z' };
  assert.equal(memoryScore(played, now), 100);
});

test('courses are sorted by memory, and new ones come first (#31)', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const sorted = sortByMemory(
    [
      {
        id: 'old',
        createdAt: '2026-09-01T00:00:00Z',
        lastPlayedAt: '2026-10-01T00:00:00Z',
      },
      { id: 'new', createdAt: '2026-10-24T11:58:00Z', lastPlayedAt: null },
      {
        id: 'mid',
        createdAt: '2026-10-01T00:00:00Z',
        lastPlayedAt: '2026-10-23T12:00:00Z',
      },
    ],
    now,
  );
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['new', 'mid', 'old'],
  );
});

test('a course is "forgotten" after 31 days, at about 21 (#32)', () => {
  assert.equal(FORGOTTEN_AFTER_DAYS, 31);
  near(FORGOTTEN_SCORE, 21.2, 0.2);
});

test('time ago is shown in friendly units (#28)', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  assert.equal(timeAgo('2026-10-24T11:59:40Z', now), 'たった今');
  assert.equal(timeAgo('2026-10-24T11:45:00Z', now), '15分前');
  assert.equal(timeAgo('2026-10-24T09:00:00Z', now), '3時間前');
  assert.equal(timeAgo('2026-10-21T12:00:00Z', now), '3日前');
});

test('cards fade from 0 right after playing to 1 when forgotten (#30)', () => {
  assert.equal(memoryFade(100), 0);
  near(memoryFade(FORGOTTEN_SCORE), 1, 1e-9);
  assert.equal(memoryFade(0), 1);
  assert.equal(memoryFade(Number.NaN), 1);
  const hour = memoryFade(retention(60));
  const day = memoryFade(retention(24 * 60));
  assert.ok(0 < hour && hour < day && day < 1);
});

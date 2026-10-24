import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fromRow,
  groupTopRankings,
  normalizeCourseName,
  normalizeDisplayName,
  toInsertRow,
  UNNAMED_COURSE,
  type CourseRow,
} from '../src/db/courseRow.ts';
import type { CourseData } from '../shared/course.ts';

const course: CourseData = {
  points: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ],
  wallColorStops: [{ progress: 0, color: '#112233' }],
  themeColor: '#F2A65A',
  roadWidth: 6,
  captureMode: 'full_body',
};

const row = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: 'abc',
  name: 'テスト',
  course_points: course.points,
  wall_color_stops: course.wallColorStops,
  theme_color: course.themeColor,
  road_width: course.roadWidth,
  capture_mode: course.captureMode,
  play_count: 2,
  created_at: '2026-10-24T09:00:00Z',
  last_played_at: null,
  ...overrides,
});

test('a course saved and read back is the same course (#25)', () => {
  const insert = toInsertRow(course, 'テスト');
  const saved = fromRow(row({ ...insert, id: 'abc' } as unknown as CourseRow));
  assert.ok(saved);
  assert.deepEqual(saved.data, course);
  assert.equal(saved.name, 'テスト');
  assert.equal(saved.playCount, 2);
});

test('only course columns are sent; extra fields such as the photo are dropped (#25)', () => {
  const withExtras = {
    ...course,
    points: [{ x: 0, z: 0, debug: true }, ...course.points.slice(1)],
    photo: 'data:image/png;base64,....',
  } as unknown as CourseData;
  const insert = toInsertRow(withExtras, 'x');
  assert.deepEqual(Object.keys(insert).sort(), [
    'capture_mode',
    'course_points',
    'name',
    'road_width',
    'theme_color',
    'wall_color_stops',
  ]);
  assert.deepEqual(insert.course_points[0], { x: 0, z: 0 });
});

test('course names are trimmed, defaulted and cut to 20 characters (#25)', () => {
  assert.equal(normalizeCourseName('  ヨガ  '), 'ヨガ');
  assert.equal(normalizeCourseName('   '), UNNAMED_COURSE);
  assert.equal(normalizeCourseName('あ'.repeat(25)), 'あ'.repeat(20));
  assert.equal(
    normalizeCourseName('🚚'.repeat(21)).length,
    40,
    '絵文字も1文字として数える',
  );
});

test('broken rows are not handed to the game (#25 #22)', () => {
  assert.equal(fromRow(row({ course_points: [{ x: 0, z: 0 }] })), null);
  assert.equal(fromRow(row({ wall_color_stops: [] })), null);
  assert.equal(fromRow(row({ theme_color: 'red' })), null);
  assert.equal(fromRow(row({ capture_mode: 'selfie' })), null);
  assert.equal(fromRow(row({ course_points: 'oops' })), null);
  // DB から数値が文字列で来ても道幅は数に直す
  assert.equal(
    fromRow(row({ road_width: '6' as unknown as number }))?.data.roadWidth,
    6,
  );
});

test('rankings are grouped per course, best score then fastest, top 3 only (#29)', () => {
  const r = (
    course_id: string,
    name: string,
    score: number,
    ms: number,
    at: string,
  ) => ({
    course_id,
    display_name: name,
    score,
    clear_time_ms: ms,
    remaining_cargo: 3,
    cargo_total: 3,
    created_at: at,
  });
  const top = groupTopRankings([
    r('a', '3位', 80, 30000, '2026-10-24T10:00:00Z'),
    r('a', '1位', 95, 40000, '2026-10-24T10:00:00Z'),
    r('a', '2位', 80, 29000, '2026-10-24T10:00:00Z'),
    r('a', '4位', 80, 30000, '2026-10-24T11:00:00Z'),
    r('b', 'B1', 50, 1000, '2026-10-24T10:00:00Z'),
  ]);
  assert.deepEqual(
    top.get('a')?.map((e) => e.displayName),
    ['1位', '2位', '3位'],
  );
  assert.deepEqual(
    top.get('b')?.map((e) => e.displayName),
    ['B1'],
  );
  assert.equal(top.get('c'), undefined);
});

test('ranking names are trimmed and cut to 12 characters; blank is rejected (#29)', () => {
  assert.equal(normalizeDisplayName('  あやか '), 'あやか');
  assert.equal(normalizeDisplayName('あ'.repeat(15)), 'あ'.repeat(12));
  assert.equal(normalizeDisplayName('   '), '');
});

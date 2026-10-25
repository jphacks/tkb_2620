/**
 * エラー時の最低限の守り（Issue #22）。Three.js・画面に依存しない。
 *
 * - コースデータ・操作値・トラックの状態に NaN や範囲外の値が入らないようにする
 * - ゲーム中にスマホとの通信が切れたかどうかを判定する
 */
import type { CourseData } from '../../shared/course';
import type { ControllerRole, RoomState } from '../../shared/socket';
import type { DriveInput, TruckState } from './updateGame';

const HEX_COLOR = /^#[\da-f]{6}$/i;

/** Why the course cannot be driven, or null when it is fine. */
export function validateCourseData(course: CourseData): string | null {
  if (!course || !Array.isArray(course.points) || course.points.length < 3)
    return 'コースの点が足りません。';
  if (
    course.points.some(
      (p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z),
    )
  )
    return 'コースに不正な座標があります。';
  if (!Number.isFinite(course.roadWidth) || course.roadWidth <= 0)
    return '道幅が不正です。';
  if (
    !Array.isArray(course.wallColorStops) ||
    !course.wallColorStops.length ||
    course.wallColorStops.some(
      (s) =>
        !Number.isFinite(s.progress) ||
        s.progress < 0 ||
        s.progress > 1 ||
        !HEX_COLOR.test(s.color),
    )
  )
    return '壁の色が不正です。';
  if (!HEX_COLOR.test(course.themeColor)) return 'テーマ色が不正です。';
  if (course.captureMode !== 'full_body' && course.captureMode !== 'clipped')
    return '撮影モードが不正です。';
  return null;
}

const unit = (value: unknown, min = 0) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(1, value))
    : 0;

/** Any input becomes a drivable one: missing or non-finite values become 0. */
export function sanitizeDriveInput(input: Partial<DriveInput> | null) {
  return {
    steering: unit(input?.steering, -1),
    throttle: unit(input?.throttle),
    brake: unit(input?.brake),
  } satisfies DriveInput;
}

export function isFiniteTruckState(state: TruckState): boolean {
  return [
    state.x,
    state.z,
    state.yaw,
    state.speed,
    state.steering,
    state.distance,
    state.brakePressure,
  ].every(Number.isFinite);
}

/** No input for this long from a phone still in the room means the link is lost. */
export const CONTROLLER_SILENT_MS = 1500;

const ROLE_LABELS: Record<ControllerRole, string> = {
  steering: 'ハンドル',
  pedal: 'アクセル・ブレーキ',
};

/**
 * Why the game should pause for the phones, or null.
 * `used` are the roles that were driving in this game; a phone that never joined
 * is not "lost", so keyboard-only play is never paused.
 */
export function controllerLossReason({
  used,
  room,
  connected,
  lastInputAt,
  now,
}: {
  used: ReadonlySet<ControllerRole>;
  room: RoomState | null;
  connected: boolean;
  lastInputAt: Partial<Record<ControllerRole, number>>;
  now: number;
}): string | null {
  if (!used.size) return null;
  if (!connected || !room)
    return 'サーバーとの接続が切れました。再接続を待っています。';
  const missing = [...used].filter((role) => !room[role]);
  if (missing.length)
    return `${missing.map((r) => ROLE_LABELS[r]).join('・')}のスマホとの接続が切れました。スマホの画面を再読み込みすると再開します。`;
  // A phone that has not sent anything yet (just joined) is not silent.
  const silent = [...used].filter((role) => {
    const at = lastInputAt[role];
    return at !== undefined && now - at > CONTROLLER_SILENT_MS;
  });
  if (silent.length)
    return `${silent.map((r) => ROLE_LABELS[r]).join('・')}のスマホから操作が届いていません。`;
  return null;
}

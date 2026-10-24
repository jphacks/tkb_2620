import { useCallback, useEffect, useRef } from 'react';
import { socket } from './client';
import type {
  ControlInput,
  ControllerRole,
  RoomState,
} from '../../shared/socket';
import { sanitizeDriveInput } from '../game/safety';
import type { DriveInput } from '../game/updateGame';

/**
 * 通信が一瞬途切れても、最後に届いた操作をこの時間までは使い続ける。
 * それ以上届かなければ、その担当の操作は0（アクセル・ブレーキを離し、ハンドルはまっすぐ）。
 */
const HOLD_MS = 1000;

type Received = { input: ControlInput; at: number };

/**
 * PC側：2台のスマホの操作を1台分の入力にまとめる（#14）。
 * ハンドルとアクセル・ブレーキの両方がルームにいないときは null。
 * レース中に null になってもトラックは止まらない（createScene が惰性で走らせる）。
 */
export function useRemoteInput(room: RoomState | null) {
  const latest = useRef<{ steering?: Received; pedal?: Received }>({});
  const bothJoined = useRef(false);

  useEffect(() => {
    const onInput = ({ role, ...input }: ControlInput & { role: string }) => {
      if (role === 'steering' || role === 'pedal')
        latest.current[role] = { input, at: performance.now() };
    };
    socket.on('control:input', onInput);
    return () => {
      socket.off('control:input', onInput);
    };
  }, []);

  // 参加状況はルームの情報で判断する（通信の途切れとは分ける）。担当が抜けたら、その入力はすぐ捨てる
  useEffect(() => {
    bothJoined.current = Boolean(room?.steering && room?.pedal);
    if (!room?.steering) delete latest.current.steering;
    if (!room?.pedal) delete latest.current.pedal;
  }, [room?.steering, room?.pedal]);

  const getInput = useCallback((): DriveInput | null => {
    if (!bothJoined.current) return null;
    const now = performance.now();
    const held = (received?: Received) =>
      received && now - received.at < HOLD_MS ? received.input : null;
    const steering = held(latest.current.steering),
      pedal = held(latest.current.pedal);
    // サーバーでも丸めているが、壊れた値がゲームに入らないようここでも丸める（#22）
    return sanitizeDriveInput({
      steering: steering?.steering,
      throttle: pedal?.throttle,
      brake: pedal?.brake,
    });
  }, []);
  /** 担当ごとに最後に操作が届いた時刻（performance.now）。通信切断の判定用（#22） */
  const getLastInputAt = useCallback(
    (): Partial<Record<ControllerRole, number>> => ({
      steering: latest.current.steering?.at,
      pedal: latest.current.pedal?.at,
    }),
    [],
  );
  return { getInput, getLastInputAt };
}

import { useCallback, useEffect, useRef } from 'react';
import { socket } from './client';
import type { ControlInput, RoomState } from '../../shared/socket';
import type { DriveInput } from '../game/updateGame';

/** この時間スマホから届かなければ、その担当の入力を0に戻す（通信が切れたときの暴走防止） */
const STALE_MS = 500;

type Received = { input: ControlInput; at: number };

/** PC側：2台のスマホの操作を1台分の入力にまとめる（#14） */
export function useRemoteInput(room: RoomState | null) {
  const latest = useRef<{ steering?: Received; pedal?: Received }>({});

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

  // 担当が抜けたら、その入力をすぐ捨てる
  useEffect(() => {
    if (!room?.steering) delete latest.current.steering;
    if (!room?.pedal) delete latest.current.pedal;
  }, [room?.steering, room?.pedal]);

  return useCallback((): DriveInput | null => {
    const now = performance.now();
    const fresh = (received?: Received) =>
      received && now - received.at < STALE_MS ? received.input : null;
    const steering = fresh(latest.current.steering),
      pedal = fresh(latest.current.pedal);
    if (!steering && !pedal) return null;
    return {
      steering: steering?.steering ?? 0,
      throttle: pedal?.throttle ?? 0,
      brake: pedal?.brake ?? 0,
    };
  }, []);
}

import { useEffect, useRef } from 'react';
import { socket } from '../socket/client';
import type { ControlInput } from '../../shared/socket';

const SEND_INTERVAL_MS = 50; // 1秒に20回。PC側は0.5秒届かないと0に戻す

/** 参加中のあいだ、最新の操作値をPCへ送り続ける（#14） */
export function useControlSender(enabled: boolean, read: () => ControlInput) {
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  }, [read]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (socket.connected) socket.emit('control:input', readRef.current());
    }, SEND_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}

/** 操作中に画面が消えないようにする（対応していない端末では何もしない） */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (released) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [enabled]);
}

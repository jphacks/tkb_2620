import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pitchAngle,
  toPedal,
  toSteering,
  upVector,
  wheelAngle,
} from '../controls/tilt';

export type TiltMode = 'steering' | 'pedal';
export type TiltStatus =
  'idle' | 'requesting' | 'running' | 'denied' | 'insecure' | 'unsupported';
export type TiltValue = { steering: number; throttle: number; brake: number };

const ZERO: TiltValue = { steering: 0, throttle: 0, brake: 0 };

type PermissionRequester = { requestPermission?: () => Promise<string> };

/**
 * スマホの傾きを操作値にする（#14）。start() はボタンを押したときに呼ぶ
 * （iPhoneはユーザー操作の中でないとセンサーの許可を出せない。HTTPSも必須）。
 * 開始した時の傾きを基準にし、calibrate() でいつでも基準を取り直せる。
 */
export function useTilt(mode: TiltMode) {
  const [status, setStatus] = useState<TiltStatus>('idle');
  const [value, setValue] = useState<TiltValue>(ZERO);
  const [flat, setFlat] = useState(false);
  const valueRef = useRef<TiltValue>(ZERO);
  const base = useRef<number | null>(null);
  const listener = useRef<((event: DeviceOrientationEvent) => void) | null>(
    null,
  );

  const stop = useCallback(() => {
    if (listener.current)
      window.removeEventListener('deviceorientation', listener.current);
    listener.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (!window.isSecureContext) return setStatus('insecure');
    if (typeof DeviceOrientationEvent === 'undefined')
      return setStatus('unsupported');
    setStatus('requesting');
    const requester = DeviceOrientationEvent as unknown as PermissionRequester;
    if (typeof requester.requestPermission === 'function') {
      try {
        if ((await requester.requestPermission()) !== 'granted')
          return setStatus('denied');
      } catch {
        return setStatus('denied');
      }
    }
    stop();
    base.current = null;
    let received = false;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      received = true;
      const up = upVector(event.beta, event.gamma);
      const angle = mode === 'steering' ? wheelAngle(up) : pitchAngle(up);
      setFlat(angle === null);
      if (angle === null) return; // 寝かせているとハンドルの角度が決まらない
      if (base.current === null) base.current = angle;
      const next =
        mode === 'steering'
          ? { ...ZERO, steering: toSteering(angle, base.current) }
          : { ...ZERO, ...toPedal(angle, base.current) };
      valueRef.current = next;
      setValue(next);
    };
    listener.current = onOrientation;
    window.addEventListener('deviceorientation', onOrientation);
    setStatus('running');
    // APIはあってもセンサーのない端末（PCなど）では値が届かない
    window.setTimeout(() => {
      if (!received && listener.current === onOrientation) {
        stop();
        setStatus('unsupported');
      }
    }, 1500);
  }, [mode, stop]);

  /** 今の持ち方を「まっすぐ／踏んでいない」にする */
  const calibrate = useCallback(() => {
    base.current = null;
    valueRef.current = ZERO;
    setValue(ZERO);
  }, []);

  return { status, value, valueRef, flat, start, calibrate };
}

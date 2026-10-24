import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pitchAngle,
  smoothAngle,
  toPedal,
  toSteering,
  upVector,
  wheelAngle,
  wrapDegrees,
} from '../controls/tilt';

export type TiltMode = 'steering' | 'pedal';
export type TiltStatus =
  'idle' | 'requesting' | 'running' | 'denied' | 'insecure' | 'unsupported';
export type TiltValue = {
  steering: number;
  throttle: number;
  brake: number;
  /** 基準からスマホを回した・倒した実際の角度（度）。左回り・奥がプラス。絵に使う */
  angle: number;
};

const ZERO: TiltValue = { steering: 0, throttle: 0, brake: 0, angle: 0 };

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
    let smoothed: number | null = null,
      lastTime = 0,
      frame = 0;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      received = true;
      const up = upVector(event.beta, event.gamma);
      const raw = mode === 'steering' ? wheelAngle(up) : pitchAngle(up);
      setFlat(raw === null);
      if (raw === null) return; // 寝かせているとハンドルの角度が決まらない
      // センサーの細かい揺れを抑える（急な動きにはすぐ追いつく）
      const dt = lastTime ? (event.timeStamp - lastTime) / 1000 : 0;
      lastTime = event.timeStamp;
      smoothed = smoothed === null ? raw : smoothAngle(smoothed, raw, dt);
      if (base.current === null) base.current = smoothed;
      const angle = wrapDegrees(smoothed - base.current);
      valueRef.current =
        mode === 'steering'
          ? { ...ZERO, angle, steering: toSteering(smoothed, base.current) }
          : { ...ZERO, angle, ...toPedal(smoothed, base.current) };
      // 画面の更新は1フレームに1回（イベントごとに描き直すと残像のように見える）
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setValue(valueRef.current);
        });
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

/** センサーが使えないときの短い案内（未開始・実行中は出さない） */
export const TILT_NOTES: Record<
  Exclude<TiltStatus, 'idle' | 'running'>,
  string
> = {
  requesting: '許可を確認中…',
  denied: '傾きが許可されませんでした。☰のボタンで操作できます',
  insecure: '傾きはHTTPSのページでだけ使えます。☰のボタンで操作できます',
  unsupported: '傾きを読み取れません。☰のボタンで操作できます',
};

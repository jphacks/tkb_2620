import { useCallback, useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { TiltControls } from '../components/TiltControls';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { useTilt } from '../hooks/useTilt';

/** ハンドル担当：横向きに持ち、ハンドルのように回す（#14） */
export default function SteeringPage({ joined }: { joined: boolean }) {
  const tilt = useTilt('steering');
  const [left, setLeft] = useState(false),
    [right, setRight] = useState(false);
  const buttons = Number(left) - Number(right);
  const steering = buttons || tilt.value.steering;
  const { valueRef } = tilt;
  const read = useCallback(
    () => ({ steering: buttons || valueRef.current.steering }),
    [buttons, valueRef],
  );
  useControlSender(joined, read);
  useScreenWakeLock(joined && tilt.status === 'running');

  return (
    <section className="controller controller-steering">
      <p className="eyebrow">STEERING</p>
      <h1>ハンドル</h1>
      <p className="controller-hint">
        スマホを<strong>横向き</strong>
        にして両手で持ち、ハンドルのように回します。
      </p>
      <div
        className="wheel"
        style={{ transform: `rotate(${-steering * 90}deg)` }}
        aria-label={`ハンドル ${Math.round(-steering * 100)}%（右がプラス）`}
        role="img"
      >
        <span />
      </div>
      <TiltControls
        status={tilt.status}
        flat={tilt.flat}
        start={tilt.start}
        calibrate={tilt.calibrate}
        calibrateLabel="今の向きをまっすぐにする"
      />
      <div className="hold-row">
        <HoldButton onHoldChange={setLeft}>◀ 左</HoldButton>
        <HoldButton onHoldChange={setRight}>右 ▶</HoldButton>
      </div>
    </section>
  );
}

import { useCallback, useState } from 'react';
import { Button } from '../components/Button';
import { HoldButton } from '../components/HoldButton';
import { TiltControls } from '../components/TiltControls';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { useTilt } from '../hooks/useTilt';

/**
 * ハンドル担当：横向きに持ち、ハンドルのように回す（#14）。
 * 画面の向きを縦でロックしたまま横に持てるよう、画面全体を90°回転して表示する。
 */
export default function SteeringPage({
  joined,
  statusText,
}: {
  joined: boolean;
  statusText?: string;
}) {
  const tilt = useTilt('steering');
  const [left, setLeft] = useState(false),
    [right, setRight] = useState(false);
  // 上端を左に向けて持つのが既定。逆に持つ人は上下を反転する
  const [flipped, setFlipped] = useState(false);
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
    <section
      className={
        flipped
          ? 'controller controller-steering flipped'
          : 'controller controller-steering'
      }
    >
      <div className="steering-side">
        <p className="eyebrow">STEERING</p>
        <h1>ハンドル</h1>
        {statusText && <p className="steering-status">{statusText}</p>}
        <p className="controller-hint">
          画面の向きは<strong>縦のままロック</strong>
          して、スマホを横にして両手で持ち、ハンドルのように回します。
        </p>
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
        <Button className="steering-flip" onClick={() => setFlipped(!flipped)}>
          上下を反転
        </Button>
      </div>
      <div
        className="wheel"
        style={{ transform: `rotate(${-steering * 90}deg)` }}
        aria-label={`ハンドル ${Math.round(-steering * 100)}%（右がプラス）`}
        role="img"
      >
        <span />
      </div>
    </section>
  );
}

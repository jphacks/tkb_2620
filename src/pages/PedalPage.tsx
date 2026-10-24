import { useCallback, useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { TiltControls } from '../components/TiltControls';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { useTilt } from '../hooks/useTilt';

/** アクセル・ブレーキ担当：縦向きに持ち、奥へ倒すとアクセル、手前でブレーキ（#14） */
export default function PedalPage({
  joined,
}: {
  joined: boolean;
  statusText?: string;
}) {
  const tilt = useTilt('pedal');
  const [accel, setAccel] = useState(false),
    [brakeHeld, setBrakeHeld] = useState(false);
  const throttle = accel ? 1 : tilt.value.throttle;
  const brake = brakeHeld ? 1 : tilt.value.brake;
  const { valueRef } = tilt;
  const read = useCallback(() => {
    const current = valueRef.current;
    return {
      throttle: accel ? 1 : current.throttle,
      brake: brakeHeld ? 1 : current.brake,
    };
  }, [accel, brakeHeld, valueRef]);
  useControlSender(joined, read);
  useScreenWakeLock(joined && tilt.status === 'running');

  return (
    <section className="controller controller-pedal">
      <p className="eyebrow">PEDAL</p>
      <h1>アクセル・ブレーキ</h1>
      <p className="controller-hint">
        スマホを<strong>縦向き</strong>で持ち、上を
        <strong>奥へ倒すとアクセル</strong>、
        <strong>手前へ倒すとブレーキ</strong>です。
      </p>
      <div
        className="pedal-gauge"
        role="img"
        aria-label={`アクセル ${Math.round(throttle * 100)}%、ブレーキ ${Math.round(brake * 100)}%`}
      >
        {/* ボタンと同じく、左がブレーキ・右がアクセル（実際の車と同じ） */}
        <div className="pedal-bar brake">
          <span style={{ height: `${brake * 100}%` }} />
          <small>ブレーキ</small>
        </div>
        <div className="pedal-bar accel">
          <span style={{ height: `${throttle * 100}%` }} />
          <small>アクセル</small>
        </div>
      </div>
      <TiltControls
        status={tilt.status}
        flat={tilt.flat}
        start={tilt.start}
        calibrate={tilt.calibrate}
        calibrateLabel="今の傾きをニュートラルにする"
      />
      <div className="hold-row">
        <HoldButton className="brake" onHoldChange={setBrakeHeld}>
          ブレーキ
        </HoldButton>
        <HoldButton className="accel" onHoldChange={setAccel}>
          アクセル
        </HoldButton>
      </div>
    </section>
  );
}

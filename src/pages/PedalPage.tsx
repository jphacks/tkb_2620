import { useCallback, useState } from 'react';
import { ControllerScreen } from '../components/ControllerScreen';
import { HoldButton } from '../components/HoldButton';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { TILT_NOTES, useTilt } from '../hooks/useTilt';

/** 踏み込み具合に応じて奥へ倒れて見えるペダル */
function Pedal({ kind, amount }: { kind: 'brake' | 'accel'; amount: number }) {
  return (
    <div className={`pedal pedal-${kind}`}>
      <div
        className="pedal-plate"
        style={{
          transform: `perspective(420px) rotateX(${amount * 32}deg)`,
          filter: `brightness(${1 - amount * 0.25})`,
        }}
      >
        <span className="pedal-fill" style={{ height: `${amount * 100}%` }} />
      </div>
      <small>{kind === 'brake' ? 'ブレーキ' : 'アクセル'}</small>
    </div>
  );
}

/** アクセル・ブレーキ担当：縦向きに持ち、奥へ倒すとアクセル、手前でブレーキ（#14） */
export default function PedalPage({
  joined,
  statusText,
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
  const running = tilt.status === 'running';

  return (
    <ControllerScreen
      className="controller-pedal"
      label="アクセル・ブレーキ"
      statusText={statusText}
      note={
        tilt.status !== 'idle' && tilt.status !== 'running'
          ? TILT_NOTES[tilt.status]
          : undefined
      }
      menu={() => (
        <>
          {running && (
            <button type="button" onClick={tilt.calibrate}>
              今の傾きをニュートラルにする
            </button>
          )}
          {/* 実際の車と同じく、左がブレーキ・右がアクセル */}
          <div className="hold-row">
            <HoldButton className="brake" onHoldChange={setBrakeHeld}>
              ブレーキ
            </HoldButton>
            <HoldButton className="accel" onHoldChange={setAccel}>
              アクセル
            </HoldButton>
          </div>
        </>
      )}
    >
      <button
        type="button"
        className="pedals"
        aria-label={
          running
            ? `アクセル ${Math.round(throttle * 100)}%、ブレーキ ${Math.round(brake * 100)}%`
            : 'タップして傾きで操作を始める'
        }
        onClick={running ? undefined : tilt.start}
        disabled={tilt.status === 'requesting'}
      >
        <Pedal kind="brake" amount={brake} />
        <Pedal kind="accel" amount={throttle} />
        {!running && <span className="start-chip">タップで開始</span>}
      </button>
      <p className="pedal-hint">奥へ倒すとアクセル・手前でブレーキ</p>
    </ControllerScreen>
  );
}

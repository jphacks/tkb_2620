import { useCallback, useState } from 'react';
import { ControllerScreen } from '../components/ControllerScreen';
import { HoldButton } from '../components/HoldButton';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { TILT_NOTES, useTilt } from '../hooks/useTilt';

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
  const running = tilt.status === 'running';

  return (
    <ControllerScreen
      className={
        flipped ? 'controller-steering flipped' : 'controller-steering'
      }
      label="ハンドル"
      statusText={statusText}
      note={
        running && tilt.flat
          ? 'スマホを立てて持ってください'
          : tilt.status !== 'idle' && tilt.status !== 'running'
            ? TILT_NOTES[tilt.status]
            : undefined
      }
      menu={() => (
        <>
          {running && (
            <button type="button" onClick={tilt.calibrate}>
              まっすぐにする
            </button>
          )}
          <div className="hold-row">
            <HoldButton onHoldChange={setLeft}>◀ 左</HoldButton>
            <HoldButton onHoldChange={setRight}>右 ▶</HoldButton>
          </div>
          <button type="button" onClick={() => setFlipped(!flipped)}>
            上下を反転
          </button>
        </>
      )}
    >
      <button
        type="button"
        // スマホそのものがハンドルなので、絵はスマホに対して回さない（横棒がいつもスマホの横方向と揃う）
        className="wheel"
        aria-label={
          running
            ? `ハンドル ${Math.round(-steering * 100)}%（右がプラス）`
            : 'タップして傾きで操作を始める'
        }
        onClick={running ? undefined : tilt.start}
        disabled={tilt.status === 'requesting'}
      >
        <span className="wheel-mark" />
        {!running && <span className="start-chip">タップで開始</span>}
      </button>
      {/* どれだけ切れているか（真ん中から左右へ伸びる） */}
      <div className="steer-meter" aria-hidden="true">
        <span
          style={
            steering >= 0
              ? { right: '50%', width: `${steering * 50}%` }
              : { left: '50%', width: `${-steering * 50}%` }
          }
        />
      </div>
    </ControllerScreen>
  );
}

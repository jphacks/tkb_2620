import { useCallback, useState } from 'react';
import { HoldButton } from '../components/HoldButton';
import { useControlSender, useScreenWakeLock } from '../hooks/useControlSender';
import { useTilt, type TiltStatus } from '../hooks/useTilt';

const notes: Partial<Record<TiltStatus, string>> = {
  requesting: '許可を確認中…',
  denied: '傾きが許可されませんでした。☰のボタンで操作できます',
  insecure: '傾きはHTTPSのページでだけ使えます。☰のボタンで操作できます',
  unsupported: '傾きを読み取れません。☰のボタンで操作できます',
};

/**
 * ハンドル担当：横向きに持ち、ハンドルのように回す（#14）。
 * 画面の向きを縦でロックしたまま横に持てるよう、画面全体を90°回転して表示する。
 * ハンドルを真ん中に置き、ボタン類はサイドバー（☰）にしまう。
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
  const [menuOpen, setMenuOpen] = useState(false);
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
  const note =
    running && tilt.flat ? 'スマホを立てて持ってください' : notes[tilt.status];

  return (
    <section
      className={
        flipped ? 'controller-steering flipped' : 'controller-steering'
      }
    >
      <p className="steering-label">
        ハンドル{statusText && <small>{statusText}</small>}
      </p>
      <button
        type="button"
        className="steering-menu-toggle"
        aria-expanded={menuOpen}
        aria-label="ボタンを表示"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        ☰
      </button>
      <button
        type="button"
        className="wheel"
        style={{ transform: `rotate(${-steering * 90}deg)` }}
        aria-label={
          running
            ? `ハンドル ${Math.round(-steering * 100)}%（右がプラス）`
            : 'タップして傾きで操作を始める'
        }
        onClick={running ? undefined : tilt.start}
        disabled={tilt.status === 'requesting'}
      >
        <span className="wheel-mark" />
        {!running && <span className="wheel-start">タップで開始</span>}
      </button>
      {note && <p className="steering-note">{note}</p>}
      <aside className={menuOpen ? 'steering-menu open' : 'steering-menu'}>
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
        <button type="button" onClick={() => setMenuOpen(false)}>
          閉じる
        </button>
      </aside>
    </section>
  );
}

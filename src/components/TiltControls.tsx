import { Button } from './Button';
import type { TiltStatus } from '../hooks/useTilt';

const messages: Record<TiltStatus, string> = {
  idle: '',
  requesting: 'センサーの許可を確認しています…',
  running: '',
  denied:
    'センサーの利用が許可されませんでした。ブラウザを再読み込みして、もう一度「傾きで操作」を押してください。下のボタンでも操作できます。',
  insecure:
    '傾きセンサーはHTTPSのページでだけ使えます（READMEの「HTTPSで一時公開する」）。下のボタンでも操作できます。',
  unsupported:
    'この端末では傾きを読み取れませんでした。下のボタンで操作してください。',
};

/** センサーの開始・基準の取り直しと、状態の案内（#14） */
export function TiltControls({
  status,
  flat,
  start,
  calibrate,
  calibrateLabel,
}: {
  status: TiltStatus;
  flat: boolean;
  start: () => void;
  calibrate: () => void;
  calibrateLabel: string;
}) {
  return (
    <div className="tilt-controls">
      {status === 'running' ? (
        <Button onClick={calibrate}>{calibrateLabel}</Button>
      ) : (
        <Button onClick={start} disabled={status === 'requesting'}>
          傾きで操作を始める
        </Button>
      )}
      {messages[status] && <p className="tilt-message">{messages[status]}</p>}
      {status === 'running' && flat && (
        <p className="tilt-message">スマホを立てて持ってください。</p>
      )}
    </div>
  );
}

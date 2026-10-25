import { QRCodeSVG } from 'qrcode.react';
import type { ControllerRole, RoomState } from '../../shared/socket';
import { getJoinUrl } from '../socket/joinUrl';

const controllers: { role: ControllerRole; label: string }[] = [
  { role: 'steering', label: 'ハンドル' },
  { role: 'pedal', label: 'アクセル・ブレーキ' },
];

type Props = { connected: boolean; room: RoomState | null };

export function RoomPanel({ connected, room }: Props) {
  if (!connected || !room) {
    return (
      <div className="room-panel">
        <p className="room-panel-waiting">
          {connected ? 'ルームを作成中...' : 'サーバーに接続中...'}
        </p>
      </div>
    );
  }

  return (
    <div className="room-panel" aria-label="スマホ接続">
      {controllers.map(({ role, label }) => {
        const joined = room[role] !== null;
        const url = getJoinUrl(room.roomId, role);
        return (
          <a
            key={role}
            className="room-qr"
            href={url}
            target="_blank"
            rel="noreferrer"
            title={url}
          >
            <QRCodeSVG value={url} size={68} marginSize={1} />
            <span className="room-qr-label">{label}</span>
            <span className={joined ? 'room-qr-state joined' : 'room-qr-state'}>
              {joined ? '● 接続済み' : '○ 待機中'}
            </span>
          </a>
        );
      })}
    </div>
  );
}

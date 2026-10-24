import { QRCodeSVG } from 'qrcode.react';
import type { ControllerRole, RoomState } from '../../shared/socket';

const controllers: { role: ControllerRole; label: string }[] = [
  { role: 'steering', label: 'ハンドル' },
  { role: 'pedal', label: 'アクセル・ブレーキ' },
];

// PCを localhost で開いているとスマホから開けないため、LANのIPに差し替える
function getJoinUrl(roomId: string, role: ControllerRole) {
  const url = new URL(window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'];
  if (local.includes(url.hostname) && __LAN_HOST__) url.hostname = __LAN_HOST__;
  url.searchParams.set('room', roomId);
  url.searchParams.set('role', role);
  return url.toString();
}

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
      <div className="room-code">
        <span>ROOM CODE</span>
        <strong>{room.roomId}</strong>
      </div>
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

import { QRCodeSVG } from 'qrcode.react';
import type { ControllerRole, RoomState } from '../../shared/socket';
import type { CourseData } from '../../shared/course';
import { CourseThumbnail } from '../components/CourseThumbnail';
import { getJoinUrl } from '../socket/joinUrl';

const crew: {
  role: ControllerRole;
  title: string;
  how: string;
}[] = [
  {
    role: 'steering',
    title: 'ハンドル係',
    how: 'スマホを横に持って、ハンドルのように回します。',
  },
  {
    role: 'pedal',
    title: 'ペダル係',
    how: 'スマホを縦に持って、奥へ倒すとアクセル、手前でブレーキ。',
  },
];

/**
 * 出発前の点呼＝スマホの接続（#26）。
 * それぞれのスマホでQRを読み取り、ふたりそろったら出発できる。
 * スマホがないときは、キーボードで走ることもできる（発表中の保険）。
 */
export default function ConnectPage({
  connected,
  room,
  course,
  courseName,
  onStart,
  onBack,
}: {
  connected: boolean;
  room: RoomState | null;
  course: CourseData;
  courseName: string;
  /** keyboard：スマホなしで走る */
  onStart: (options: { keyboard: boolean }) => void;
  onBack: () => void;
}) {
  const joined = (role: ControllerRole) => Boolean(room && room[role]);
  const ready = joined('steering') && joined('pedal');
  return (
    <section className="connect" aria-labelledby="connect-title">
      <button type="button" className="link-button back" onClick={onBack}>
        ← 戻る
      </button>
      <div className="connect-head">
        <div>
          <p className="eyebrow">出発前の点呼</p>
          <h1 id="connect-title">スマホで配達員を登録</h1>
          <p>
            それぞれのスマホで、自分の係のQRコードを読み取ってください。ふたりそろったら出発できます。
          </p>
        </div>
        <div className="connect-route" aria-label="本日の配達ルート">
          <CourseThumbnail course={course} />
          <div>
            <small>本日の配達ルート</small>
            <strong>{courseName}</strong>
          </div>
        </div>
      </div>

      <ol className="crew-slots">
        {crew.map(({ role, title, how }) => {
          const isJoined = joined(role);
          const url = room ? getJoinUrl(room.roomId, role) : null;
          return (
            <li
              key={role}
              className={isJoined ? 'crew-slot joined' : 'crew-slot'}
              aria-label={`${title}：${isJoined ? '登録済み' : '待機中'}`}
            >
              <div className="crew-slot-head">
                <span className="crew-slot-role">{title}</span>
                <span className="crew-slot-state" role="status">
                  {isJoined ? '登録OK' : '待機中'}
                </span>
              </div>
              <div className="crew-slot-qr">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" title={url}>
                    <QRCodeSVG value={url} size={168} marginSize={2} />
                  </a>
                ) : (
                  <p className="crew-slot-wait">
                    {connected
                      ? 'QRコードを用意しています…'
                      : 'サーバーに接続しています…'}
                  </p>
                )}
                {isJoined && (
                  <span className="crew-stamp" aria-hidden="true">
                    登録
                  </span>
                )}
              </div>
              <p className="crew-slot-how">{how}</p>
            </li>
          );
        })}
      </ol>

      <div className="connect-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!ready}
          onClick={() => onStart({ keyboard: false })}
        >
          {ready ? '出発する' : 'ふたりそろうと出発できます'}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => onStart({ keyboard: true })}
        >
          スマホなしで走る（キーボード）
        </button>
      </div>
    </section>
  );
}

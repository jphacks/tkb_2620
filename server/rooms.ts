import type { ControllerRole, RoomState } from '../shared/socket.js';

type Room = {
  id: string;
  hostId: string;
  steering: string | null;
  pedal: string | null;
};

const rooms = new Map<string, Room>();
const socketToRoom = new Map<
  string,
  { roomId: string; role: ControllerRole | null }
>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(id)) return generateRoomId();
  return id;
}

function toState(room: Room): RoomState {
  return {
    roomId: room.id,
    hostId: room.hostId,
    steering: room.steering,
    pedal: room.pedal,
  };
}

export function createRoom(hostId: string): RoomState {
  // 同じPCからの二重作成は既存のルームを返す
  const existing = getRoomForSocket(hostId);
  if (existing && existing.hostId === hostId) return toState(existing);
  const id = generateRoomId();
  const room: Room = {
    id,
    hostId,
    steering: null,
    pedal: null,
  };
  rooms.set(id, room);
  socketToRoom.set(hostId, { roomId: id, role: null });
  return toState(room);
}

export function joinRoom(
  socketId: string,
  roomId: string,
  role: ControllerRole,
):
  | { ok: true; state: RoomState; replaced?: string }
  | { ok: false; message: string } {
  if (role !== 'steering' && role !== 'pedal') {
    return { ok: false, message: '担当が正しくありません' };
  }
  const room = rooms.get(String(roomId).toUpperCase());
  if (!room) return { ok: false, message: 'ルームが見つかりません' };
  // 同じ端末からの再送（StrictModeでの二重実行など）はそのまま成功
  // 別の端末なら、あとから読み取った方に係を引き継ぐ。電波が切れたスマホは、
  // サーバーが切断に気づくまで最大45秒ほど係を持ったままになるため、
  // 読み込み直したスマホがすぐ入り直せるようにする
  const previous = room[role];
  if (previous && previous !== socketId) socketToRoom.delete(previous);
  room[role] = socketId;
  socketToRoom.set(socketId, { roomId: room.id, role });
  return {
    ok: true,
    state: toState(room),
    ...(previous && previous !== socketId ? { replaced: previous } : {}),
  };
}

export function getRoomForSocket(socketId: string): Room | undefined {
  const info = socketToRoom.get(socketId);
  if (!info) return undefined;
  return rooms.get(info.roomId);
}

export function leaveRoom(
  socketId: string,
): (RoomState & { hostLeft?: boolean }) | null {
  const info = socketToRoom.get(socketId);
  if (!info) return null;
  const room = rooms.get(info.roomId);
  if (!room) {
    socketToRoom.delete(socketId);
    return null;
  }
  if (room.hostId === socketId) {
    // PCが抜けてもすぐには閉じない。一時的な切断なら、同じIDで戻ってきたときに
    // 同じルーム（同じQR）を使い続ける。閉じるのは closeRoom で行う
    return { ...toState(room), hostLeft: true };
  }
  socketToRoom.delete(socketId);
  if (info.role && room[info.role] === socketId) {
    room[info.role] = null;
  }
  return toState(room);
}

/** 操作を送ってきた端末の担当と、届け先のPC。担当として参加していなければ null。 */
export function getController(
  socketId: string,
): { role: ControllerRole; hostId: string } | null {
  const info = socketToRoom.get(socketId);
  if (!info?.role) return null;
  const room = rooms.get(info.roomId);
  if (!room || room[info.role] !== socketId) return null;
  return { role: info.role, hostId: room.hostId };
}

/** PCが戻ってこなかったルームを閉じる。まだ同じPCのルームなら閉じた状態を返す */
export function closeRoom(roomId: string, hostId: string): RoomState | null {
  const room = rooms.get(roomId);
  if (!room || room.hostId !== hostId) return null;
  rooms.delete(room.id);
  for (const id of [room.hostId, room.steering, room.pedal]) {
    if (id) socketToRoom.delete(id);
  }
  return toState(room);
}

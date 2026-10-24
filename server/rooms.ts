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
): { ok: true; state: RoomState } | { ok: false; message: string } {
  if (role !== 'steering' && role !== 'pedal') {
    return { ok: false, message: '担当が正しくありません' };
  }
  const room = rooms.get(String(roomId).toUpperCase());
  if (!room) return { ok: false, message: 'ルームが見つかりません' };
  // 同じ端末からの再送（StrictModeでの二重実行など）は成功扱いにする
  if (room[role] && room[role] !== socketId) {
    return { ok: false, message: 'その役割はすでに使用されています' };
  }
  room[role] = socketId;
  socketToRoom.set(socketId, { roomId: room.id, role });
  return { ok: true, state: toState(room) };
}

export function getRoomForSocket(socketId: string): Room | undefined {
  const info = socketToRoom.get(socketId);
  if (!info) return undefined;
  return rooms.get(info.roomId);
}

export function leaveRoom(
  socketId: string,
): (RoomState & { closed?: boolean }) | null {
  const info = socketToRoom.get(socketId);
  if (!info) return null;
  const room = rooms.get(info.roomId);
  if (!room) {
    socketToRoom.delete(socketId);
    return null;
  }
  socketToRoom.delete(socketId);
  if (room.hostId === socketId) {
    // PCが抜けたらルームを閉じる（参加中のスマホは再読み込みで入り直す）
    rooms.delete(room.id);
    for (const id of [room.steering, room.pedal]) {
      if (id) socketToRoom.delete(id);
    }
    return { ...toState(room), closed: true };
  }
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

export type ControllerRole = 'steering' | 'pedal';

export interface RoomState {
  roomId: string;
  hostId: string;
  steering: string | null;
  pedal: string | null;
}

/** スマホから送る操作値（#14）。ハンドルは -1（右）〜1（左）、ペダルは 0〜1。 */
export type ControlInput = {
  steering?: number;
  throttle?: number;
  brake?: number;
};

export interface ServerToClientEvents {
  'server:ready': (data: { message: string }) => void;
  'room:created': (data: RoomState) => void;
  'room:joined': (data: RoomState & { role: ControllerRole }) => void;
  'room:update': (data: RoomState) => void;
  'room:error': (data: { message: string }) => void;
  /** サーバーが担当を確認してからPCへ中継する */
  'control:input': (data: ControlInput & { role: ControllerRole }) => void;
}

export interface ClientToServerEvents {
  'connection:ping': (ack: () => void) => void;
  'room:create': () => void;
  'room:join': (data: { roomId: string; role: ControllerRole }) => void;
  'control:input': (data: ControlInput) => void;
}

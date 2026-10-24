export type ControllerRole = 'steering' | 'pedal';

export interface RoomState {
  roomId: string;
  hostId: string;
  steering: string | null;
  pedal: string | null;
}

export interface ServerToClientEvents {
  'server:ready': (data: { message: string }) => void;
  'room:created': (data: RoomState) => void;
  'room:joined': (data: RoomState & { role: ControllerRole }) => void;
  'room:update': (data: RoomState) => void;
  'room:error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'connection:ping': (ack: () => void) => void;
  'room:create': () => void;
  'room:join': (data: { roomId: string; role: ControllerRole }) => void;
}

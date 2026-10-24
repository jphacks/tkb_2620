import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/socket';
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SOCKET_URL || undefined,
  // WebSocketを先に試す。問い合わせを繰り返す方式（polling）だと、操作がまとめて遅れて届きカクつく
  { autoConnect: false, transports: ['websocket', 'polling'] },
);

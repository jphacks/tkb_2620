import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/socket.js';
import {
  createRoom,
  getController,
  getRoomForSocket,
  joinRoom,
  leaveRoom,
} from './rooms.js';
import { sanitizeUnit } from '../shared/controls.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim()),
  },
});
io.on('connection', (socket) => {
  socket.emit('server:ready', { message: 'Bodrive server ready' });
  socket.on('connection:ping', (ack) => {
    if (typeof ack === 'function') ack();
  });
  socket.on('room:create', () => {
    const state = createRoom(socket.id);
    socket.join(state.roomId);
    socket.emit('room:created', state);
  });
  socket.on('room:join', ({ roomId, role }) => {
    const result = joinRoom(socket.id, roomId, role);
    if (!result.ok) {
      socket.emit('room:error', { message: result.message });
      return;
    }
    socket.join(result.state.roomId);
    socket.emit('room:joined', { ...result.state, role });
    io.to(result.state.roomId).emit('room:update', result.state);
  });
  // スマホの操作をPCへ中継する。担当外の値は捨て、範囲外の値は丸める（#14）
  socket.on('control:input', (data) => {
    const controller = getController(socket.id);
    if (!controller || typeof data !== 'object' || data === null) return;
    const input =
      controller.role === 'steering'
        ? { steering: sanitizeUnit(data.steering, -1) }
        : {
            throttle: sanitizeUnit(data.throttle),
            brake: sanitizeUnit(data.brake),
          };
    io.to(controller.hostId).emit('control:input', {
      ...input,
      role: controller.role,
    });
  });
  let lastFeedback = 0;
  socket.on('game:feedback', (event) => {
    const room = getRoomForSocket(socket.id);
    if (
      !room ||
      room.hostId !== socket.id ||
      (event !== 'collision' &&
        event !== 'harsh-acceleration' &&
        event !== 'cargo-drop')
    )
      return;
    const now = Date.now();
    if (event !== 'cargo-drop' && now - lastFeedback < 850) return;
    lastFeedback = now;
    for (const id of [room.steering, room.pedal]) {
      if (id) io.to(id).emit('game:feedback', event);
    }
  });
  socket.on('disconnect', () => {
    const updated = leaveRoom(socket.id);
    if (!updated) return;
    if (updated.closed) {
      io.to(updated.roomId).emit('room:error', {
        message: 'PCとの接続が切れました。QRコードを読み直してください',
      });
      return;
    }
    io.to(updated.roomId).emit('room:update', updated);
  });
});
httpServer.listen(port, '0.0.0.0', () =>
  console.log(`Bodrive server: http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    io.close(() => process.exit(0));
  });
}

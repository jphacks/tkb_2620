import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/socket.js';
import { createRoom, joinRoom, leaveRoom } from './rooms.js';

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
  socket.emit('server:ready', { message: 'BODY ROAD server ready' });
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
  console.log(`BODY ROAD server: http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    io.close(() => process.exit(0));
  });
}

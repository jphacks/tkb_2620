import { useCallback, useEffect, useState } from 'react';
import { socket } from './client';
import type { ControllerRole, RoomState } from '../../shared/socket';

export function useRoom() {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [role, setRole] = useState<ControllerRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      // 再接続するとsocket IDが変わるため、ルームは作り直す・入り直す
      setConnected(false);
      setRoom(null);
    };
    const onCreated = (state: RoomState) => {
      setRoom(state);
      setRole(null);
      setError(null);
    };
    const onJoined = (data: RoomState & { role: ControllerRole }) => {
      setRoom(data);
      setRole(data.role);
      setError(null);
    };
    const onUpdate = (state: RoomState) => setRoom(state);
    const onError = (data: { message: string }) => setError(data.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:update', onUpdate);
    socket.on('room:error', onError);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:update', onUpdate);
      socket.off('room:error', onError);
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback(() => {
    setError(null);
    socket.emit('room:create');
  }, []);

  const joinRoom = useCallback((roomId: string, role: ControllerRole) => {
    setError(null);
    socket.emit('room:join', { roomId, role });
  }, []);

  return { connected, room, role, error, createRoom, joinRoom };
}

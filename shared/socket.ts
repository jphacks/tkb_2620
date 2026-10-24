// Extend these shared contracts when room and input rules are finalized.
export type ControllerRole = 'steering' | 'pedal';
export interface ServerToClientEvents {
  'server:ready': (data: { message: string }) => void;
}
export interface ClientToServerEvents {
  'connection:ping': (ack: () => void) => void;
}

import type { ControllerRole } from '../../shared/socket';

/**
 * スマホがQRコードから開くURL（?room=XXXX&role=steering|pedal）。
 * PCを localhost で開いているとスマホから開けないため、LANのIPに差し替える。
 */
export function getJoinUrl(roomId: string, role: ControllerRole) {
  const url = new URL(window.location.origin);
  const local = ['localhost', '127.0.0.1', '[::1]'];
  if (local.includes(url.hostname) && __LAN_HOST__) url.hostname = __LAN_HOST__;
  url.searchParams.set('room', roomId);
  url.searchParams.set('role', role);
  return url.toString();
}

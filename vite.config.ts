import react from '@vitejs/plugin-react';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';

// スマホ用QRのURLに使う、このPCのLAN IPv4アドレス
function getLanHost() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '';
}

export default defineConfig({
  plugins: [react()],
  define: { __LAN_HOST__: JSON.stringify(getLanHost()) },
  server: {
    // HTTPSの一時公開（cloudflared の Quick Tunnel）からのアクセスを許可
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } },
  },
});

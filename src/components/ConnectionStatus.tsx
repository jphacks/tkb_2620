export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className="connection" role="status">
      {connected ? '● サーバー接続済み' : '○ サーバー未接続'}
    </span>
  );
}

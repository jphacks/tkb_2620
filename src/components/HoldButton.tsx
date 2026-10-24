import type { ReactNode } from 'react';

/** 押しているあいだだけ true（指を離す・外れる・中断で false） */
export function HoldButton({
  onHoldChange,
  className,
  children,
}: {
  onHoldChange: (holding: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const release = () => onHoldChange(false);
  return (
    <button
      type="button"
      className={className ? `hold-button ${className}` : 'hold-button'}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHoldChange(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

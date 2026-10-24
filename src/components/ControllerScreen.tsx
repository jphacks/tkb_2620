import { createPortal } from 'react-dom';
import { socket } from '../socket/client';
import type { GameFeedback } from '../../shared/socket';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * スマホの操作画面の共通枠（#14）。画面いっぱいに表示し、
 * 左上に担当名と参加状態、右上の☰でボタン類のサイドバーを開く。
 */
export function ControllerScreen({
  className,
  label,
  statusText,
  note,
  menu,
  children,
}: {
  className: string;
  label: string;
  statusText?: string;
  note?: string;
  /** サイドバーの中身。閉じる関数を受け取る */
  menu: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [warning, setWarning] = useState<GameFeedback | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let redUntil = 0;
    const clear = () => {
      clearTimeout(timer);
      setWarning(null);
    };
    const receive = (event: GameFeedback) => {
      if (
        document.hidden ||
        (event !== 'collision' &&
          event !== 'harsh-acceleration' &&
          event !== 'cargo-drop')
      )
        return;
      if (event !== 'cargo-drop' && Date.now() < redUntil) return;
      if (event === 'cargo-drop') redUntil = Date.now() + 850;
      setWarning(event);
      clearTimeout(timer);
      timer = setTimeout(() => setWarning(null), 850);
    };
    socket.on('game:feedback', receive);
    socket.on('disconnect', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      clearTimeout(timer);
      socket.off('game:feedback', receive);
      socket.off('disconnect', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <section className={`controller-screen ${className}`}>
      <p className="controller-label">
        {label}
        {statusText && <small>{statusText}</small>}
      </p>
      <button
        type="button"
        className="controller-menu-toggle"
        aria-expanded={open}
        aria-label="ボタンを表示"
        onClick={() => setOpen(!open)}
      >
        ☰
      </button>
      {warning &&
        createPortal(
          <div
            className={`controller-impact ${warning === 'cargo-drop' ? 'impact-danger' : 'impact-caution'}`}
            aria-hidden="true"
          />,
          document.body,
        )}
      {children}
      {note && <p className="controller-note">{note}</p>}
      <aside className={open ? 'controller-menu open' : 'controller-menu'}>
        {menu(close)}
        <button type="button" onClick={close}>
          閉じる
        </button>
      </aside>
    </section>
  );
}

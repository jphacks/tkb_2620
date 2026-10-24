import { useState, type ReactNode } from 'react';

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

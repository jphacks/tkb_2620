/**
 * Bodrive のロゴ（#26）。人の輪郭を一筆書きにした道のマークと文字。
 * マークの START の赤い点は、コースの START と同じ意味。
 * onHome があれば押すと受付へ戻る。スマホの操作画面では押せないロゴにする
 * （押すと操作画面から離れてしまうため）。
 */
export function BrandMark({ onHome }: { onHome?: () => void }) {
  const mark = (
    <>
      <svg
        className="brand-icon"
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M20 4c3.3 0 5.6 2.5 5.6 5.4 0 2.2-1.2 3.8-2.8 4.7l8.6 3.4c1.5.6 1.8 2.6.5 3.5-.8.6-1.9.6-2.7.1l-4.6-2.6.6 6.4 4.4 8.4c.7 1.4-.3 3.1-1.9 3.1-.8 0-1.6-.5-2-1.2L20 27.6l-5.7 7.6c-.4.7-1.2 1.2-2 1.2-1.6 0-2.6-1.7-1.9-3.1l4.4-8.4.6-6.4-4.6 2.6c-.8.5-1.9.5-2.7-.1-1.3-.9-1-2.9.5-3.5l8.6-3.4c-1.6-.9-2.8-2.5-2.8-4.7C14.4 6.5 16.7 4 20 4Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="4" r="3.2" className="brand-icon-start" />
      </svg>
      <span className="brand-name">Bodrive</span>
    </>
  );
  if (!onHome) return <span className="brand">{mark}</span>;
  return (
    <a
      href="/"
      className="brand"
      aria-label="Bodrive 受付に戻る"
      onClick={(event) => {
        event.preventDefault();
        onHome();
      }}
    >
      {mark}
    </a>
  );
}

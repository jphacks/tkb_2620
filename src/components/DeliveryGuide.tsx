import { useEffect, useRef, useState } from 'react';

/** はじめての配達（チュートリアル、#26）。1枚ずつめくる配達マニュアル */
const steps: {
  title: string;
  lines: string[];
  art: 'photo' | 'crew' | 'drive' | 'cargo';
}[] = [
  { title: '写真を選ぶ', lines: ['ポーズが、そのまま道になる'], art: 'photo' },
  {
    title: '係を決める',
    lines: ['ハンドル係とペダル係', 'それぞれのスマホでQRを読む'],
    art: 'crew',
  },
  {
    title: '息を合わせて運転',
    lines: ['ハンドル係：横に持って回す', 'ペダル係：奥へ倒すとアクセル'],
    art: 'drive',
  },
  {
    title: '荷物を届ける',
    lines: ['速く、そして落とさずに', 'スコア＝タイム50＋積荷50'],
    art: 'cargo',
  },
];

function Art({ kind }: { kind: (typeof steps)[number]['art'] }) {
  const common = {
    viewBox: '0 0 120 80',
    className: 'guide-art',
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (kind === 'photo')
    return (
      <svg {...common}>
        <rect x="18" y="10" width="44" height="60" rx="4" />
        <path d="M40 22c4 0 6 3 6 6s-2 5-4 6l9 4-3 5-6-3 1 9 5 10h-6l-4-8-4 8h-6l5-10 1-9-6 3-3-5 9-4c-2-1-4-3-4-6s2-6 6-6Z" />
        <path d="M70 40h12m-4-5 5 5-5 5" />
        <path
          d="M20 4c3.3 0 5.6 2.5 5.6 5.4 0 2.2-1.2 3.8-2.8 4.7l8.6 3.4c1.5.6 1.8 2.6.5 3.5-.8.6-1.9.6-2.7.1l-4.6-2.6.6 6.4 4.4 8.4c.7 1.4-.3 3.1-1.9 3.1-.8 0-1.6-.5-2-1.2L20 27.6l-5.7 7.6c-.4.7-1.2 1.2-2 1.2-1.6 0-2.6-1.7-1.9-3.1l4.4-8.4.6-6.4-4.6 2.6c-.8.5-1.9.5-2.7-.1-1.3-.9-1-2.9.5-3.5l8.6-3.4c-1.6-.9-2.8-2.5-2.8-4.7C14.4 6.5 16.7 4 20 4Z"
          transform="translate(70 10) scale(1.5)"
          className="guide-art-road"
        />
      </svg>
    );
  if (kind === 'crew')
    return (
      <svg {...common}>
        <rect x="16" y="14" width="34" height="54" rx="6" />
        <rect x="70" y="14" width="34" height="54" rx="6" />
        <path d="M24 26h8v8h-8zM36 26h6v6h-6zM24 40h6v6h-6zM34 38h8v10h-8z" />
        <path d="M78 26h8v8h-8zM90 26h6v6h-6zM78 40h6v6h-6zM88 38h8v10h-8z" />
      </svg>
    );
  if (kind === 'drive')
    return (
      <svg {...common}>
        <rect
          x="8"
          y="28"
          width="50"
          height="28"
          rx="6"
          transform="rotate(-14 33 42)"
        />
        <path d="M14 16a26 26 0 0 1 36-2" className="guide-art-road" />
        <rect
          x="80"
          y="12"
          width="26"
          height="50"
          rx="6"
          transform="rotate(16 93 37)"
        />
        <path d="M84 70h18m-5-4 5 4-5 4" className="guide-art-road" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M14 52h58V30H14z" />
      <path d="M72 38h16l10 10v4H72" />
      <circle cx="28" cy="58" r="6" />
      <circle cx="84" cy="58" r="6" />
      <path d="M22 30V18h18v12M44 30V22h14v8" />
      <path d="M28 18v6M51 22v5" />
    </svg>
  );
}

export function DeliveryGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <dialog
      ref={dialog}
      className="guide"
      aria-labelledby="guide-title"
      onClose={onClose}
      onClick={(event) => {
        // 枠の外（背景）を押したら閉じる
        if (event.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className="guide-sheet">
        <div className="guide-head">
          <span className="guide-label">はじめての配達</span>
          <span className="guide-count">
            {index + 1} / {steps.length}
          </span>
        </div>
        <Art kind={step.art} />
        <h2 id="guide-title">{step.title}</h2>
        {step.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="guide-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i === index ? 'on' : undefined} />
          ))}
        </div>
        <div className="guide-actions">
          <button
            type="button"
            className="link-button back"
            onClick={() =>
              index === 0 ? dialog.current?.close() : setIndex(index - 1)
            }
          >
            {index === 0 ? '閉じる' : '← 戻る'}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              last ? dialog.current?.close() : setIndex(index + 1)
            }
          >
            {last ? 'さあ、配達へ' : '次へ'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

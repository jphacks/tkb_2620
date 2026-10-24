import { useEffect, useRef, useState } from 'react';
import type { CourseData } from '../../shared/course';
import type { createScene } from './createScene';

export function GameCanvas({ course }: { course: CourseData }) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    import('./createScene')
      .then(({ createScene }) => {
        if (cancelled) return;
        scene.current = createScene(element, course);
        setError('');
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : '3D表示を開始できませんでした。',
          );
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [course]);
  return (
    <div className="course-preview">
      <div className="course-toolbar">
        <span>ドラッグで回転 · スクロール／ピンチで拡大</span>
        <button onClick={() => scene.current?.resetView()}>全体を表示</button>
      </div>
      {error && (
        <p role="alert">{error} ブラウザのWebGL対応も確認してください。</p>
      )}
      <div className="course-canvas" ref={container} />
      <p className="course-caption">
        チェック柄がSTART、矢印が進行方向です。真上から見て反時計回りに走ります。車両の走行は次のIssueで追加します。
      </p>
    </div>
  );
}

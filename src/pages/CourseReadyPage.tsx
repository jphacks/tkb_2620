import { useEffect, useRef, useState } from 'react';
import type { CourseData } from '../../shared/course';
import type { CapturedPerson } from '../capture/capture';
import { useMapPhoto } from '../capture/useMapPhoto';
import type { MapPhoto } from '../capture/useMapPhoto';
import { buildCourse } from '../image-processing/generateCourse';
import { COURSE_COMMENT_MAX } from '../db/courseRow';

/** Shown at least this long so the generating animation reads as a step, not a flicker. */
const MIN_GENERATING_MS = 1600;
export const DEFAULT_COURSE_NAME = 'なまえのないコース';
export const MAX_COURSE_NAME_LENGTH = 20;

type Props = {
  captured: CapturedPerson;
  /** comment：コースに一言（任意、空なら空文字） */
  onPlay: (course: CourseData, name: string, comment: string) => void;
  onRetake: () => void;
  /** コースを作れなかったとき。撮影画面へ戻す（#22） */
  onFailed?: (message: string) => void;
};

export default function CourseReadyPage({
  captured,
  onPlay,
  onRetake,
  onFailed,
}: Props) {
  const mapPhoto = useMapPhoto(captured);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    // The parent remounts this page per photo, so state starts empty each time.
    let cancelled = false;
    const started = performance.now();
    // Let the generating screen paint before the work starts.
    const timer = window.setTimeout(() => {
      let result: CourseData | null = null,
        message = '',
        note = '';
      try {
        const built = buildCourse(captured);
        result = built.course;
        note = built.warning ?? '';
      } catch (cause) {
        message =
          cause instanceof Error ? cause.message : 'コースを作れませんでした。';
      }
      const wait = Math.max(
        0,
        MIN_GENERATING_MS - (performance.now() - started),
      );
      window.setTimeout(() => {
        if (cancelled) return;
        setCourse(result);
        setError(message);
        setWarning(note);
      }, wait);
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [captured]);

  // 作れなかったら撮影画面へ戻す（#22）。戻り先がなければ下のエラー画面を出す
  const failed = useRef(onFailed);
  useEffect(() => {
    failed.current = onFailed;
  }, [onFailed]);
  useEffect(() => {
    if (error) failed.current?.(error);
  }, [error]);

  if (error)
    return (
      <section className="course-ready">
        <p className="eyebrow">新規受付 2/2・ルート</p>
        <h1>コースを作れませんでした</h1>
        <p className="capture-error" role="alert">
          {error}
        </p>
        <div className="capture-actions">
          <button className="capture-primary" type="button" onClick={onRetake}>
            写真を選び直す
          </button>
        </div>
      </section>
    );

  if (!course)
    return (
      <section className="course-ready" aria-busy="true">
        <p className="eyebrow">新規受付 2/2・ルート</p>
        <h1>ルートを作っています…</h1>
        <div
          className="course-generating"
          role="status"
          aria-label="写真の形から道路をつくっています"
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle className="generating-road" cx="100" cy="100" r="70" />
            <circle className="generating-lane" cx="100" cy="100" r="70" />
            <g className="generating-truck">
              {/* 左向きのトラック。上から反時計回りに一周するので、いつも進む向きを向く */}
              <g transform="translate(100 30) scale(-1 1)">
                <rect x="-16" y="-10" width="22" height="16" rx="2" />
                <path d="M6 -5h7l5 6v5H6z" />
                <circle cx="-9" cy="7" r="4" className="generating-wheel" />
                <circle cx="11" cy="7" r="4" className="generating-wheel" />
              </g>
            </g>
          </svg>
        </div>
      </section>
    );

  const trimmed = name.trim();
  return (
    <section className="course-ready">
      <p className="eyebrow">新規受付 2/2・ルート</p>
      <h1>配達ルートを確認</h1>
      <CourseMap course={course} photo={mapPhoto} />
      {warning && <p className="course-note">急カーブあり。ゆっくり走ろう。</p>}
      <form
        className="course-name"
        onSubmit={(event) => {
          event.preventDefault();
          onPlay(course, trimmed || DEFAULT_COURSE_NAME, comment.trim());
        }}
      >
        <label htmlFor="course-name">コース名</label>
        <input
          id="course-name"
          value={name}
          maxLength={MAX_COURSE_NAME_LENGTH}
          placeholder={DEFAULT_COURSE_NAME}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <small>{MAX_COURSE_NAME_LENGTH}文字まで</small>
        <label htmlFor="course-comment">
          コースに一言<span className="optional">（なくてもOK）</span>
        </label>
        <input
          id="course-comment"
          value={comment}
          maxLength={COURSE_COMMENT_MAX}
          placeholder="例：笑顔でピース"
          autoComplete="off"
          onChange={(event) => setComment(event.target.value)}
        />
        <small>
          {[...comment].length}/{COURSE_COMMENT_MAX}文字
        </small>
        <p className="course-public-note">
          コース名・一言・コースの形は、ほかの人にも公開されます（写真は公開されません）。
        </p>
        <div className="capture-actions">
          <button className="capture-primary" type="submit">
            このルートで出発準備へ
          </button>
          <button type="button" onClick={onRetake}>
            写真を選び直す
          </button>
        </div>
      </form>
    </section>
  );
}

/** Top view of the whole course: colored walls, gray road, red START. */
export function CourseMap({
  course,
  photo,
}: {
  course: CourseData;
  photo?: MapPhoto | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const { points, roadWidth, wallColorStops } = course;
    const xs = points.map((p) => p.x),
      zs = points.map((p) => p.z);
    const minX = Math.min(...xs) - roadWidth,
      maxX = Math.max(...xs) + roadWidth,
      minZ = Math.min(...zs) - roadWidth,
      maxZ = Math.max(...zs) + roadWidth;
    const size = 640,
      scale = size / Math.max(maxX - minX, maxZ - minZ);
    element.width = Math.round((maxX - minX) * scale);
    element.height = Math.round((maxZ - minZ) * scale);
    const at = (p: { x: number; z: number }) =>
      [(p.x - minX) * scale, (p.z - minZ) * scale] as const;
    let cancelled = false;
    function draw(image?: HTMLImageElement) {
      if (cancelled) return;
      context!.fillStyle = '#e8eee6';
      context!.fillRect(0, 0, element!.width, element!.height);
      if (image && photo) {
        const [x, y] = at(photo.from),
          [right, bottom] = at(photo.to);
        context!.drawImage(image, x, y, right - x, bottom - y);
      }
      context!.lineCap = 'round';
      context!.lineJoin = 'round';
      // Total length for wall color lookup by progress.
      const cumulative = [0];
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        cumulative.push(cumulative[i] + Math.hypot(q.x - p.x, q.z - p.z));
      });
      const total = cumulative[points.length];
      const wallAt = (progress: number) => {
        let color = wallColorStops[0].color;
        for (const stop of wallColorStops)
          if (stop.progress <= progress) color = stop.color;
        return color;
      };
      // Walls: wide colored strokes, then the road on top leaves colored rims.
      context!.lineWidth = roadWidth * scale * 1.35;
      points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        context!.strokeStyle = wallAt(cumulative[i] / total);
        context!.beginPath();
        context!.moveTo(...at(p));
        context!.lineTo(...at(q));
        context!.stroke();
      });
      context!.strokeStyle = '#4a4f4a';
      context!.lineWidth = roadWidth * scale;
      context!.beginPath();
      points.forEach((p, i) =>
        i ? context!.lineTo(...at(p)) : context!.moveTo(...at(p)),
      );
      context!.closePath();
      context!.stroke();
      const [sx, sy] = at(points[0]);
      context!.fillStyle = '#ff2d2d';
      context!.strokeStyle = '#ffffff';
      context!.lineWidth = Math.max(2, scale * roadWidth * 0.12);
      context!.beginPath();
      context!.arc(
        sx,
        sy,
        Math.max(6, roadWidth * scale * 0.45),
        0,
        Math.PI * 2,
      );
      context!.fill();
      context!.stroke();
    }
    draw();
    const image = photo ? new Image() : null;
    if (image && photo) {
      image.onload = () => draw(image);
      image.src = photo.url;
    }
    return () => {
      cancelled = true;
      if (image) image.onload = null;
    };
  }, [course, photo]);
  return (
    <canvas
      ref={canvas}
      className="course-map"
      role="img"
      aria-label="人型コースの全体図。色つきの縁が壁、赤い丸がSTART"
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import type { CourseData } from '../../shared/course';
import type { CapturedPerson } from '../capture/capture';
import {
  buildCourse,
  DEFAULT_COURSE_SIZE,
} from '../image-processing/generateCourse';
import { DEFAULT_ROAD_FIT } from '../image-processing/fitRoad';

/** Shown at least this long so the generating animation reads as a step, not a flicker. */
const MIN_GENERATING_MS = 1600;
export const DEFAULT_COURSE_NAME = 'なまえのないコース';
export const MAX_COURSE_NAME_LENGTH = 20;

/** Provisional tuning sliders: how coarsely the photo becomes a road. */
type Coarseness = { grow: number; concaveRadius: number; courseSize: number };
const DEFAULT_COARSENESS: Coarseness = {
  grow: DEFAULT_ROAD_FIT.grow,
  concaveRadius: DEFAULT_ROAD_FIT.concaveRadius,
  courseSize: DEFAULT_COURSE_SIZE,
};
const COARSENESS_SLIDERS: {
  key: keyof Coarseness;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: 'grow',
    label: '細かい形を埋める量',
    hint: '大きいほど指やすき間が埋まり、腕や脚が太くなる',
    min: 0,
    max: 16,
    step: 1,
  },
  {
    key: 'concaveRadius',
    label: 'へこみの丸め',
    hint: '大きいほど脇・股などのへこみがゆるやかになる',
    min: 0,
    max: 30,
    step: 1,
  },
  {
    key: 'courseSize',
    label: 'コースの大きさ',
    hint: '大きいほど道幅に対して人型が大きく、細かい形が残る',
    min: 80,
    max: 300,
    step: 10,
  },
];

type Props = {
  captured: CapturedPerson;
  onPlay: (course: CourseData, name: string) => void;
  onRetake: () => void;
};

export default function CourseReadyPage({ captured, onPlay, onRetake }: Props) {
  const [course, setCourse] = useState<CourseData | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [coarseness, setCoarseness] = useState(DEFAULT_COARSENESS);
  const [rebuilding, setRebuilding] = useState(false);
  const shown = useRef(false);
  useEffect(() => {
    // The parent remounts this page per photo, so state starts empty each time.
    let cancelled = false;
    const started = performance.now();
    // First build: let the generating screen paint. Slider changes: wait for the drag to settle.
    const first = !shown.current;
    if (!first) setRebuilding(true);
    const timer = window.setTimeout(
      () => {
        let result: CourseData | null = null,
          message = '',
          note = '';
        try {
          const built = buildCourse(captured, {
            courseSize: coarseness.courseSize,
            fit: {
              grow: coarseness.grow,
              concaveRadius: coarseness.concaveRadius,
            },
          });
          result = built.course;
          note = built.warning ?? '';
        } catch (cause) {
          message =
            cause instanceof Error
              ? cause.message
              : 'コースを作れませんでした。';
        }
        const wait = first
          ? Math.max(0, MIN_GENERATING_MS - (performance.now() - started))
          : 0;
        window.setTimeout(() => {
          if (cancelled) return;
          // Keep showing the last good course when a slider value fails.
          if (result || !shown.current) setCourse(result);
          shown.current = shown.current || !!result;
          setError(message);
          setWarning(note);
          setRebuilding(false);
        }, wait);
      },
      first ? 50 : 200,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [captured, coarseness]);

  if (error && !course)
    return (
      <section className="course-ready">
        <p className="eyebrow">STEP 02 · COURSE</p>
        <h1>コースを作れませんでした</h1>
        <p className="capture-error" role="alert">
          {error}
        </p>
        <div className="capture-actions">
          <button className="capture-primary" type="button" onClick={onRetake}>
            撮り直す
          </button>
        </div>
      </section>
    );

  if (!course)
    return (
      <section className="course-ready" aria-busy="true">
        <p className="eyebrow">STEP 02 · COURSE</p>
        <h1>コースを作っています…</h1>
        <div className="course-generating" role="status">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle className="generating-track" cx="100" cy="100" r="70" />
            <g className="generating-truck">
              {/* A small delivery truck riding on the top of the ring. */}
              <g transform="translate(100 30)">
                <rect x="-16" y="-9" width="22" height="16" rx="2" />
                <path d="M6 -4h7l5 6v5H6z" />
                <circle cx="-9" cy="8" r="4" />
                <circle cx="11" cy="8" r="4" />
              </g>
            </g>
          </svg>
          <p>写真の形から道路をつないで、人物の色で壁を塗っています。</p>
        </div>
      </section>
    );

  const trimmed = name.trim();
  return (
    <section className="course-ready">
      <p className="eyebrow">STEP 02 · COURSE</p>
      <h1>コースができた！</h1>
      <p>
        赤い丸がSTARTです。ここから反時計回りに一周します。壁の色は写真の人物の色です。
      </p>
      <CourseMap course={course} />
      <fieldset className="course-tuning" aria-busy={rebuilding}>
        <legend>粒度の調整（仮）</legend>
        {COARSENESS_SLIDERS.map((slider) => (
          <label key={slider.key}>
            <span>
              {slider.label}：<strong>{coarseness[slider.key]}</strong>
            </span>
            <input
              type="range"
              id={`coarseness-${slider.key}`}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={coarseness[slider.key]}
              onChange={(event) =>
                setCoarseness({
                  ...coarseness,
                  [slider.key]: Number(event.target.value),
                })
              }
            />
            <small>{slider.hint}</small>
          </label>
        ))}
        <p className="course-tuning-values" role="status">
          {rebuilding
            ? 'コースを作り直しています…'
            : `いまの値：埋める量 ${coarseness.grow} ／ へこみの丸め ${coarseness.concaveRadius} ／ 大きさ ${coarseness.courseSize}`}
        </p>
        {error && (
          <p className="capture-error" role="alert">
            この値ではコースを作れません：{error}
          </p>
        )}
        <button type="button" onClick={() => setCoarseness(DEFAULT_COARSENESS)}>
          初期値に戻す
        </button>
      </fieldset>
      <p className="course-facts">
        一周 {courseLength(course).toFixed(0)}m ・ 道幅{' '}
        {course.roadWidth.toFixed(1)}m ・{' '}
        {course.captureMode === 'full_body' ? '全身' : '上半身・見切れ'}
      </p>
      {warning && (
        <p className="course-note">
          曲がりきれない急カーブが残っています。ゆっくり走ってください。
        </p>
      )}
      <form
        className="course-name"
        onSubmit={(event) => {
          event.preventDefault();
          onPlay(course, trimmed || DEFAULT_COURSE_NAME);
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
        <small>
          {MAX_COURSE_NAME_LENGTH}文字まで。空欄なら「{DEFAULT_COURSE_NAME}
          」になります。
        </small>
        <div className="capture-actions">
          <button className="capture-primary" type="submit">
            このルートで遊ぶ
          </button>
          <button type="button" onClick={onRetake}>
            撮り直す
          </button>
        </div>
      </form>
    </section>
  );
}

function courseLength({ points }: CourseData) {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + Math.hypot(q.x - p.x, q.z - p.z);
  }, 0);
}

/** Top view of the whole course: colored walls, gray road, red START. */
export function CourseMap({ course }: { course: CourseData }) {
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
    context.fillStyle = '#e8eee6';
    context.fillRect(0, 0, element.width, element.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
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
    context.lineWidth = roadWidth * scale * 1.35;
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      context.strokeStyle = wallAt(cumulative[i] / total);
      context.beginPath();
      context.moveTo(...at(p));
      context.lineTo(...at(q));
      context.stroke();
    });
    context.strokeStyle = '#4a4f4a';
    context.lineWidth = roadWidth * scale;
    context.beginPath();
    points.forEach((p, i) =>
      i ? context.lineTo(...at(p)) : context.moveTo(...at(p)),
    );
    context.closePath();
    context.stroke();
    const [sx, sy] = at(points[0]);
    context.fillStyle = '#ff2d2d';
    context.strokeStyle = '#ffffff';
    context.lineWidth = Math.max(2, scale * roadWidth * 0.12);
    context.beginPath();
    context.arc(sx, sy, Math.max(6, roadWidth * scale * 0.45), 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }, [course]);
  return (
    <canvas
      ref={canvas}
      className="course-map"
      role="img"
      aria-label="人型コースの全体図。色つきの縁が壁、赤い丸がSTART"
    />
  );
}

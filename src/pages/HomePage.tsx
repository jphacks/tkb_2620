import { SavedCourses } from '../components/SavedCourses';
import type { SavedCourse } from '../db/courseRow';

export default function HomePage({
  onPlaySaved,
}: {
  /** 保存したコースを選んだとき（#25） */
  onPlaySaved?: (course: SavedCourse) => void;
}) {
  return (
    <section>
      <p className="eyebrow">つくって、走って、息を合わせる。</p>
      <h1>
        ふたりで走る、
        <br />
        自分たちの道。
      </h1>
      <p>ポーズから生まれるコースを、ハンドルとペダルを分担して走ろう。</p>
      {onPlaySaved && <SavedCourses onPlay={onPlaySaved} />}
    </section>
  );
}

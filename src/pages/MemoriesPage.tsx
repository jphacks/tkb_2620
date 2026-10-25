import { SavedCourses } from '../components/SavedCourses';
import type { SavedCourse } from '../db/courseRow';

/** 思い出のコースの一覧（#28 #26）。選んだコースでスマホの接続へ進む */
export default function MemoriesPage({
  onPlay,
  onBack,
}: {
  onPlay: (course: SavedCourse) => void;
  onBack: () => void;
}) {
  return (
    <section className="memories" aria-labelledby="memories-title">
      <button type="button" className="link-button back" onClick={onBack}>
        ← 受付に戻る
      </button>
      <h1 id="memories-title">配達コース選択</h1>
      <SavedCourses onPlay={onPlay} />
    </section>
  );
}

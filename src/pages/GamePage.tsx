import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
export default function GamePage() {
  return (
    <section>
      <p className="eyebrow">COURSE PREVIEW · ISSUE #11</p>
      <h1>はじめの楕円コース</h1>
      <p>
        道路・壁・人物カラーの表示を確認するためのサンプルです。人物のコースも同じ形式で読み込めます。
      </p>
      <GameCanvas course={sampleCourse} />
    </section>
  );
}

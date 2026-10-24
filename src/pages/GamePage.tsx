import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
export default function GamePage() {
  return (
    <section className="game-page" aria-label="トラック試運転">
      <GameCanvas course={sampleCourse} />
    </section>
  );
}

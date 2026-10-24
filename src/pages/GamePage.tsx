import type { ReactNode } from 'react';
import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
export default function GamePage({ roomSlot }: { roomSlot?: ReactNode }) {
  return (
    <section className="game-page" aria-label="トラック試運転">
      <GameCanvas course={sampleCourse} toolbarExtra={roomSlot} />
    </section>
  );
}

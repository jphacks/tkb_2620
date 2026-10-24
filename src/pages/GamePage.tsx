import type { ReactNode } from 'react';
import type { DriveInput } from '../game/updateGame';
import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
export default function GamePage({
  roomSlot,
  getRemoteInput,
}: {
  roomSlot?: ReactNode;
  getRemoteInput?: () => DriveInput | null;
}) {
  return (
    <section className="game-page" aria-label="トラック試運転">
      <GameCanvas
        course={sampleCourse}
        toolbarExtra={roomSlot}
        getRemoteInput={getRemoteInput}
      />
    </section>
  );
}

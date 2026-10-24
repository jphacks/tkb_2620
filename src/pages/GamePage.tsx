import type { ReactNode } from 'react';
import type { CourseData } from '../../shared/course';
import type { DriveInput } from '../game/updateGame';
import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
export default function GamePage({
  roomSlot,
  getRemoteInput,
  course,
  courseName,
}: {
  roomSlot?: ReactNode;
  getRemoteInput?: () => DriveInput | null;
  /** The course made from the photo (Issue #10); the sample course until then. */
  course?: CourseData;
  courseName?: string;
}) {
  // Shown in the game toolbar so the 3D view keeps the full width.
  const name = (
    <span className="game-course-name">
      {course ? `コース：${courseName}` : 'サンプルコース'}
    </span>
  );
  return (
    <section className="game-page" aria-label="トラック試運転">
      <GameCanvas
        course={course ?? sampleCourse}
        toolbarExtra={
          <>
            {name}
            {roomSlot}
          </>
        }
        getRemoteInput={getRemoteInput}
      />
    </section>
  );
}

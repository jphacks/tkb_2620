import type { ReactNode } from 'react';
import type { CapturedPerson } from '../capture/capture';
import type { CourseData } from '../../shared/course';
import type { DriveInput } from '../game/updateGame';
import type { DeliveryResult } from '../game/score';
import { GameCanvas } from '../game/GameCanvas';
import { sampleCourse } from '../fixtures/sampleCourse';
import { validateCourseData } from '../game/safety';
export default function GamePage({
  minimapPhoto,
  roomSlot,
  getRemoteInput,
  course,
  courseName,
  onFinish,
  pausedReason,
  onKeyboardContinue,
  onLobby,
}: {
  minimapPhoto?: CapturedPerson | null;
  roomSlot?: ReactNode;
  getRemoteInput?: () => DriveInput | null;
  /** The course made from the photo (Issue #10); the sample course until then. */
  course?: CourseData;
  courseName?: string;
  /** スマホとの通信が切れた理由（#22） */
  pausedReason?: string | null;
  onKeyboardContinue?: () => void;
  onLobby?: () => void;
  /** ゴールしたときの配送結果（#21） */
  onFinish?: (result: DeliveryResult) => void;
}) {
  // A broken course never reaches the 3D scene; the sample course is used instead (#22).
  const problem = course ? validateCourseData(course) : null;
  const playable = course && !problem ? course : undefined;
  // Shown in the game toolbar so the 3D view keeps the full width.
  const name = (
    <span className="game-course-name">
      {playable ? `コース：${courseName}` : 'サンプルコース'}
    </span>
  );
  return (
    <section className="game-page" aria-label="配達中">
      {problem && (
        <p className="error-text" role="alert">
          写真のコースを読み込めなかったため、サンプルコースで走ります（
          {problem}）
        </p>
      )}
      <GameCanvas
        course={playable ?? sampleCourse}
        minimapPhoto={playable ? minimapPhoto : null}
        toolbarExtra={
          <>
            {name}
            {roomSlot && (
              <details className="hud-connection">
                <summary>スマホ接続・QRコード</summary>
                {roomSlot}
              </details>
            )}
          </>
        }
        getRemoteInput={getRemoteInput}
        // 伝票のコース名：写真から作ったコースは付けた名前（#10）
        courseName={playable ? courseName : 'サンプルコース（楕円）'}
        onFinish={onFinish}
        pausedReason={pausedReason}
        onKeyboardContinue={onKeyboardContinue}
        onLobby={onLobby}
      />
    </section>
  );
}

export const INTRO_CAMERA = { overviewSeconds: 0.65, approachSeconds: 3.2 };

/** Zero speed at both ends avoids a sudden start/stop in the camera move. */
export function introCameraProgress(elapsed: number) {
  const t = Math.max(
    0,
    Math.min(
      1,
      (elapsed - INTRO_CAMERA.overviewSeconds) / INTRO_CAMERA.approachSeconds,
    ),
  );
  return { weight: t * t * t * (t * (t * 6 - 15) + 10), done: t >= 1 };
}

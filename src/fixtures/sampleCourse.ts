import type { CourseData } from '../../shared/course';
/** Synthetic shape for integration checks only; not a person contour or final scale.
 * For this fixture only: image top maps to negative z; points run clockwise in image space.
 */
export const sampleCourse: CourseData = {
  points: [
    { x: 10, z: -10 },
    { x: 10, z: 10 },
    { x: -10, z: 10 },
    { x: -10, z: -10 },
  ],
  wallColorStops: [
    { progress: 0, color: '#272321' },
    { progress: 0.5, color: '#C9947D' },
  ],
  themeColor: '#F2A65A',
  roadWidth: 3,
  captureMode: 'full_body',
};

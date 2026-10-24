import type { CourseData } from '../../shared/course';
/** Ellipse fixture only. Top is negative z, counterclockwise viewed from above.
 * Dimensions are sample values. Counterclockwise direction is the shared rule.
 */
export const sampleCourse: CourseData = {
  points: Array.from({ length: 160 }, (_, index) => {
    const angle = (index / 160) * Math.PI * 2;
    return { x: -24 * Math.sin(angle), z: -16 * Math.cos(angle) };
  }),
  wallColorStops: [
    { progress: 0, color: '#272321' },
    { progress: 0.2, color: '#D7A58C' },
    { progress: 0.4, color: '#E6DFD3' },
    { progress: 0.6, color: '#334B6A' },
    { progress: 0.8, color: '#C9947D' },
  ],
  themeColor: '#F2A65A',
  roadWidth: 3,
  captureMode: 'full_body',
};

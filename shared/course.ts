/** Game-space coordinates, not normalized image coordinates. */
export type CoursePoint = { x: number; z: number };
export type WallColorStop = { progress: number; color: string };
export type CourseData = {
  points: CoursePoint[];
  wallColorStops: WallColorStop[];
  themeColor: string;
  /** Full road width, in the same units as points and the vehicle. */
  roadWidth: number;
  captureMode: 'full_body' | 'clipped';
};

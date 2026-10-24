import * as THREE from 'three';
import type { CourseData } from '../../shared/course';

/** Builds a closed ribbon from ordered game-space points; no image conversion. */
export function createRoad(course: CourseData) {
  const { points, roadWidth, wallColorStops } = course;
  if (
    points.length < 3 ||
    !Number.isFinite(roadWidth) ||
    roadWidth <= 0 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
  ) {
    throw new Error('コースには3点以上の有効な座標と正の道路幅が必要です。');
  }
  if (
    !wallColorStops.length ||
    wallColorStops.some(
      (s) =>
        !Number.isFinite(s.progress) ||
        s.progress < 0 ||
        s.progress > 1 ||
        !/^#[\da-f]{6}$/i.test(s.color),
    )
  ) {
    throw new Error('壁色は0〜1の位置と#RRGGBB形式で指定してください。');
  }
  const count = points.length;
  const distances = [0];
  const directions = points.map((p, i) => {
    const next = points[(i + 1) % count];
    const delta = new THREE.Vector2(next.x - p.x, next.z - p.z);
    if (delta.length() < 1e-6)
      throw new Error('連続する点と末尾の始点重複を取り除いてください。');
    distances.push(distances[i] + delta.length());
    return delta.normalize();
  });
  const length = distances[count];
  const stops = wallColorStops
    .map((s) => ({
      progress: s.progress === 1 ? 0 : s.progress,
      color: new THREE.Color(s.color),
    }))
    .sort((a, b) => a.progress - b.progress)
    .filter((s, i, all) => i === 0 || s.progress !== all[i - 1].progress);
  function colorAt(progress: number) {
    const t = progress % 1;
    const nextIndex = stops.findIndex((s) => s.progress > t);
    const a =
      stops[(nextIndex === -1 ? stops.length : nextIndex) - 1] ??
      stops[stops.length - 1];
    const b = stops[nextIndex === -1 ? 0 : nextIndex];
    let start = a.progress;
    let end = b.progress;
    if (nextIndex === 0) start -= 1;
    if (nextIndex === -1) end += 1;
    return a.color
      .clone()
      .lerp(b.color, end === start ? 0 : (t - start) / (end - start));
  }
  const edges = points.map((p, i) => {
    const before = directions[(i + count - 1) % count];
    const after = directions[i];
    const normal = new THREE.Vector2(-after.y, after.x);
    const miter = new THREE.Vector2(-before.y, before.x).add(normal);
    if (miter.lengthSq() < 1e-8)
      throw new Error('折り返しのある輪郭は補正してから渡してください。');
    miter.normalize();
    const divisor = miter.dot(normal);
    if (divisor < 0.25)
      throw new Error('カーブが急すぎます。輪郭の補正が必要です。');
    miter.multiplyScalar(roadWidth / 2 / divisor);
    return [
      new THREE.Vector3(p.x + miter.x, 0, p.z + miter.y),
      new THREE.Vector3(p.x - miter.x, 0, p.z - miter.y),
    ];
  });
  const group = new THREE.Group();
  group.name = 'course';
  const wallHeight = roadWidth * 0.3;
  function ribbon(name: string, wallSide?: number) {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const edge = edges[i % count];
      const a = edge[wallSide ?? 0];
      const b = wallSide === undefined ? edge[1] : a.clone().setY(wallHeight);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = colorAt(distances[i] / length);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < count) {
        const v = i * 2;
        indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: wallSide === undefined ? '#39464b' : '#ffffff',
      vertexColors: wallSide !== undefined,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
  }
  ribbon('road');
  ribbon('left-wall', 0);
  ribbon('right-wall', 1);
  const first = points[0],
    direction = directions[0];
  const start = new THREE.Group();
  start.name = 'start-line';
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 10; col++) {
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(roadWidth / 10, roadWidth / 10),
        new THREE.MeshBasicMaterial({
          color: (row + col) % 2 ? '#ffffff' : '#172923',
          side: THREE.DoubleSide,
        }),
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(
        ((col - 4.5) * roadWidth) / 10,
        0.025,
        ((row - 0.5) * roadWidth) / 10,
      );
      start.add(tile);
    }
  start.rotation.y = Math.atan2(direction.x, direction.y);
  start.position.set(first.x, 0, first.z);
  group.add(start);
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(direction.x, 0, direction.y),
    new THREE.Vector3(first.x, wallHeight + 0.2, first.z),
    roadWidth,
    0xffb34f,
    roadWidth * 0.3,
    roadWidth * 0.2,
  );
  arrow.name = 'start-direction';
  group.add(arrow);
  return { group, length, wallHeight };
}

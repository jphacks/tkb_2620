import * as THREE from 'three';
import type { CourseData } from '../../shared/course';

/** Builds a closed ribbon from ordered game-space points; no image conversion.
 * heights は各点の道路の高さ（坂、elevation.ts）。省略すると平らな道。
 * 外側の壁は地面（groundY）まで下ろし、高いところでは道を支える土手に見せる。
 */
export function createRoad(
  course: CourseData,
  heights: readonly number[] = course.points.map(() => 0),
  groundY = 0,
) {
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
    const y = heights[i] ?? 0;
    return [
      new THREE.Vector3(p.x + miter.x, y, p.z + miter.y),
      new THREE.Vector3(p.x - miter.x, y, p.z - miter.y),
    ];
  });
  const group = new THREE.Group();
  group.name = 'course';
  const wallHeight = roadWidth * 0.15;
  function ribbon(name: string, wallSide?: number) {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const edge = edges[i % count];
      const a = edge[wallSide ?? 0];
      const b =
        wallSide === undefined ? edge[1] : a.clone().setY(a.y + wallHeight);
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
  // Extend outward so the drivable width and inner collision boundary stay unchanged.
  const wallThickness = roadWidth * 0.12;
  const entrancePoints: THREE.Vector3[] = [];
  const entranceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const gateForward = new THREE.Vector3(directions[0].x, 0, directions[0].y);
  const gateRight = new THREE.Vector3(-directions[0].y, 0, directions[0].x);
  const lateral = Math.min(6, roadWidth / 2);
  const crossing = new THREE.Vector3(points[0].x, 0, points[0].z)
    .addScaledVector(gateRight, lateral)
    .addScaledVector(gateForward, -Math.sqrt(36 - (6 - lateral) ** 2));
  const nearest = edges
    .map((edge) => edge[0])
    .sort(
      (a, b) => a.distanceToSquared(crossing) - b.distanceToSquared(crossing),
    )[0];
  const gateCenter = nearest.dot(gateForward);
  const gateMin = gateCenter - 1.6,
    gateMax = gateCenter + 1.6;
  function solidWall(name: string, side: number) {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    function section(i: number) {
      const edge = edges[i % count][side];
      const point = points[i % count];
      const outward = new THREE.Vector3(
        edge.x - point.x,
        0,
        edge.z - point.z,
      ).multiplyScalar(wallThickness / (roadWidth / 2));
      return [
        edge.clone(),
        edge.clone().setY(edge.y + wallHeight),
        edge
          .clone()
          .add(outward)
          .setY(edge.y + wallHeight),
        edge.clone().add(outward).setY(Math.min(edge.y, groundY)),
      ];
    }
    const wallGroups: { start: number; count: number; entrance: boolean }[] =
      [];
    for (let i = 0; i < count; i++) {
      const fromSection = section(i),
        toSection = section(i + 1);
      const startProjection = fromSection[0].dot(gateForward);
      const endProjection = toSection[0].dot(gateForward);
      const cuts = [0, 1];
      if (side === 0 && Math.abs(endProjection - startProjection) > 1e-8) {
        for (const boundary of [gateMin, gateMax]) {
          const t =
            (boundary - startProjection) / (endProjection - startProjection);
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
      cuts.sort((a, b) => a - b);
      for (let part = 0; part < cuts.length - 1; part++) {
        const t0 = cuts[part],
          t1 = cuts[part + 1];
        const a = fromSection.map((point, j) =>
          point.clone().lerp(toSection[j], t0),
        );
        const b = fromSection.map((point, j) =>
          point.clone().lerp(toSection[j], t1),
        );
        const faceStart = indices.length;
        for (let face = 0; face < 4; face++) {
          const next = (face + 1) % 4,
            offset = positions.length / 3;
          const c1 = colorAt(
              (distances[i] + (distances[i + 1] - distances[i]) * t0) / length,
            ),
            c2 = colorAt(
              (distances[i] + (distances[i + 1] - distances[i]) * t1) / length,
            );
          if (face === 1) {
            c1.lerp(new THREE.Color('#ffffff'), 0.28);
            c2.lerp(new THREE.Color('#ffffff'), 0.28);
          } else if (face === 2) {
            c1.multiplyScalar(0.8);
            c2.multiplyScalar(0.8);
          }
          for (const [point, color] of [
            [a[face], c1],
            [a[next], c1],
            [b[face], c2],
            [b[next], c2],
          ] as const) {
            positions.push(point.x, point.y, point.z);
            colors.push(color.r, color.g, color.b);
          }
          indices.push(
            offset,
            offset + 2,
            offset + 1,
            offset + 1,
            offset + 2,
            offset + 3,
          );
        }
        const middle = a[0].clone().lerp(b[0], 0.5);
        const projection = middle.dot(gateForward);
        const entrance =
          side === 0 &&
          projection > gateMin - 1e-7 &&
          projection < gateMax + 1e-7 &&
          middle.distanceTo(crossing) < 6;
        if (entrance) entrancePoints.push(a[0], b[0]);
        wallGroups.push({
          start: faceStart,
          count: indices.length - faceStart,
          entrance,
        });
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
    wallGroups.forEach((part) =>
      geometry.addGroup(part.start, part.count, part.entrance ? 1 : 0),
    );
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
      entranceMaterial,
    ]);
    mesh.name = name;
    group.add(mesh);
  }
  solidWall('left-wall', 0);
  solidWall('right-wall', 1);
  const first = points[0],
    direction = directions[0];
  const start = new THREE.Group();
  start.name = 'start-line';
  const stopLine = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, 0.32),
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
  );
  stopLine.rotation.x = -Math.PI / 2;
  stopLine.position.set(0, 0.025, 1.7);
  start.add(stopLine);
  start.rotation.y = Math.atan2(direction.x, direction.y);
  start.position.set(first.x, 0, first.z);
  group.add(start);
  // The entrance is permanently a gate, never a disappearing wall section.
  entranceMaterial.visible = false;
  const hinge = new THREE.Group();
  const entranceConnections: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  if (entrancePoints.length >= 2) {
    entrancePoints.sort((a, b) => a.dot(gateForward) - b.dot(gateForward));
    // Gate posts share the exact vertices where the original wall was cut.
    const a = entrancePoints[0],
      b = entrancePoints[entrancePoints.length - 1];
    const gateLength = a.distanceTo(b);
    const gate = new THREE.Group();
    gate.position.set(a.x, 0, a.z);
    gate.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: '#e7b53b',
      roughness: 0.6,
    });
    for (const z of [0, gateLength]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 1.25, 0.4),
        postMaterial,
      );
      post.position.set(0, 0.625, z);
      gate.add(post);
    }
    hinge.position.y = 1.15;
    gate.add(hinge);
    const sections = Math.ceil(gateLength / 0.6);
    const white = new THREE.MeshStandardMaterial({ color: '#fff9e7' });
    const red = new THREE.MeshStandardMaterial({ color: '#d44b3c' });
    for (let i = 0; i < sections; i++) {
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.17, gateLength / sections),
        i % 2 ? red : white,
      );
      piece.position.z = ((i + 0.5) * gateLength) / sections;
      hinge.add(piece);
    }
    group.add(gate);
  }
  return {
    group,
    length,
    wallHeight,
    edges,
    entranceConnections,
    setGateAngle: (angle: number) => {
      hinge.rotation.x = -angle;
    },
  };
}

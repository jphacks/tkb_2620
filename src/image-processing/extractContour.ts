export type OutlinePoint = { x: number; y: number };
export type PersonOutline = { points: OutlinePoint[]; touchesEdge: boolean };

/** Largest connected foreground's outer boundary. Coordinates are normalized image edges.
 * Border pixels produce edges on x=0/1 or y=0/1, closing clipped bodies along the photo.
 * Holes and detached speckles are excluded from the route preview.
 */
function extractBinaryOutline(
  values: Uint8Array,
  width: number,
  height: number,
): PersonOutline | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    values.length !== width * height
  )
    throw new Error('Invalid person mask');
  if (values.some((value) => value !== 0 && value !== 1))
    throw new Error('人物マスクには0または1だけを指定してください。');
  const visited = new Uint8Array(values.length);
  let largest: number[] = [];
  for (let seed = 0; seed < values.length; seed++) {
    if (visited[seed] || !(values[seed] >= 0.5)) continue;
    const component = [seed];
    visited[seed] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor],
        x = index % width,
        y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors)
        if (next >= 0 && !visited[next] && values[next] >= 0.5) {
          visited[next] = 1;
          component.push(next);
        }
    }
    if (component.length > largest.length) largest = component;
  }
  if (largest.length < Math.max(4, values.length * 0.005)) return null;
  const mask = new Uint8Array(values.length);
  largest.forEach((index) => {
    mask[index] = 1;
  });
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  function edge(x: number, y: number, nextX: number, nextY: number) {
    const from = y * stride + x,
      to = nextY * stride + nextX;
    edges.set(from, [...(edges.get(from) ?? []), to]);
  }
  for (const index of largest) {
    const x = index % width,
      y = Math.floor(index / width);
    if (y === 0 || !mask[index - width]) edge(x, y, x + 1, y);
    if (x === width - 1 || !mask[index + 1]) edge(x + 1, y, x + 1, y + 1);
    if (y === height - 1 || !mask[index + width]) edge(x + 1, y + 1, x, y + 1);
    if (x === 0 || !mask[index - 1]) edge(x, y + 1, x, y);
  }
  function direction(from: number, to: number) {
    return to === from + 1
      ? 0
      : to === from + stride
        ? 1
        : to === from - 1
          ? 2
          : 3;
  }
  let outer: OutlinePoint[] = [],
    maxArea = 0;
  while (edges.size) {
    const start = edges.keys().next().value!;
    let current = start,
      previousDirection = -1;
    const loop: OutlinePoint[] = [];
    do {
      loop.push({ x: current % stride, y: Math.floor(current / stride) });
      const options = edges.get(current);
      if (!options?.length) throw new Error('Open person boundary');
      // At diagonal contacts follow the right-hand boundary rather than crossing it.
      const preference = [1, 0, 3, 2];
      const next =
        previousDirection < 0
          ? options[0]
          : [...options].sort(
              (a, b) =>
                preference.indexOf(
                  (direction(current, a) - previousDirection + 4) % 4,
                ) -
                preference.indexOf(
                  (direction(current, b) - previousDirection + 4) % 4,
                ),
            )[0];
      previousDirection = direction(current, next);
      options.splice(options.indexOf(next), 1);
      if (!options.length) edges.delete(current);
      current = next;
    } while (current !== start);
    const area = Math.abs(
      loop.reduce((sum, p, i) => {
        const q = loop[(i + 1) % loop.length];
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    );
    if (area > maxArea) {
      outer = loop;
      maxArea = area;
    }
  }
  const points = outer
    .filter((point, i) => {
      const before = outer[(i + outer.length - 1) % outer.length],
        after = outer[(i + 1) % outer.length];
      return (
        (point.x - before.x) * (after.y - point.y) !==
        (point.y - before.y) * (after.x - point.x)
      );
    })
    .map(({ x, y }) => ({ x: x / width, y: y / height }));
  const validation = validateContour(points);
  if (!validation.valid) throw new Error(validation.reason);
  return {
    points,
    touchesEdge: points.some(
      (p) => p.x === 0 || p.x === 1 || p.y === 0 || p.y === 1,
    ),
  };
}

export type BinaryPersonMask = {
  data: Uint8Array;
  width: number;
  height: number;
};

/** Validate a simple closed loop without a repeated endpoint. Pixel or normalized coordinates. */
export function validateContour(points: OutlinePoint[]): {
  valid: boolean;
  reason?: string;
} {
  const fail = (reason: string) => ({ valid: false, reason });
  if (points.length < 3)
    return fail('輪郭の点が不足しています。別の写真を選んでください。');
  if (points.length > 10000)
    return fail('輪郭が複雑すぎます。別の写真を選んでください。');
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return fail('輪郭に不正な座標があります。');
  const seen = new Set<string>();
  for (const point of points) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key))
      return fail('輪郭が重なっています。別の写真を選んでください。');
    seen.add(key);
  }
  const cross = (a: OutlinePoint, b: OutlinePoint, c: OutlinePoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a: OutlinePoint, b: OutlinePoint, p: OutlinePoint) =>
    Math.abs(cross(a, b, p)) < 1e-12 &&
    p.x >= Math.min(a.x, b.x) - 1e-12 &&
    p.x <= Math.max(a.x, b.x) + 1e-12 &&
    p.y >= Math.min(a.y, b.y) - 1e-12 &&
    p.y <= Math.max(a.y, b.y) + 1e-12;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-10)
      return fail('輪郭に短すぎる辺があります。');
    const before = points[(i + points.length - 1) % points.length];
    if (on(before, a, b) || on(a, b, before))
      return fail('輪郭が折り返して重なっています。');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
        Math.max(c.y, d.y) < Math.min(a.y, b.y)
      )
        continue;
      const abC = cross(a, b, c),
        abD = cross(a, b, d),
        cdA = cross(c, d, a),
        cdB = cross(c, d, b);
      if (
        (abC * abD < 0 && cdA * cdB < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        return fail('輪郭が自己交差しています。別の写真を選んでください。');
    }
  }
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  if (Math.abs(area) < 1e-10) return fail('輪郭に面積がありません。');
  return { valid: true };
}

/** Binary input; returns ordered pixel edge coordinates. Closing edge is implicit. */
export function extractOuterContour(
  binaryMask: Uint8Array,
  width: number,
  height: number,
): OutlinePoint[] {
  const outline = extractBinaryOutline(binaryMask, width, height);
  if (!outline)
    throw new Error(
      '人物の領域が小さすぎるか、見つかりません。別の写真を選んでください。',
    );
  return outline.points.map((p) => ({ x: p.x * width, y: p.y * height }));
}

/** Compatibility entry for confidence masks; previews continue using normalized image coordinates. */
export function extractPersonOutline(
  values: Float32Array,
  width: number,
  height: number,
): PersonOutline | null {
  const binary = Uint8Array.from(values, (value) =>
    Number.isFinite(value) && value >= 0.5 ? 1 : 0,
  );
  return extractBinaryOutline(binary, width, height);
}

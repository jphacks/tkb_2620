export type OutlinePoint = { x: number; y: number };
export type PersonOutline = { points: OutlinePoint[]; touchesEdge: boolean };

/** Largest connected foreground's outer boundary. Coordinates are normalized image edges.
 * Border pixels produce edges on x=0/1 or y=0/1, closing clipped bodies along the photo.
 * Holes and detached speckles are excluded from the route preview.
 */
export function extractPersonOutline(
  values: Float32Array,
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
  return {
    points,
    touchesEdge: points.some(
      (p) => p.x === 0 || p.x === 1 || p.y === 0 || p.y === 1,
    ),
  };
}

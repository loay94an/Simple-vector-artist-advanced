// Vector bucket-fill primitives. Pure functions are shared with node tests.
export function closeBoundaryMask(mask, width, height, radius = 1) {
  const source = mask instanceof Uint8Array ? mask : Uint8Array.from(mask || []);
  const result = source.slice();
  const r = Math.max(0, Math.min(4, Math.round(Number(radius) || 0)));
  if (!r) return result;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!source[y * width + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + r) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) result[ny * width + nx] = 1;
        }
      }
    }
  }
  return result;
}

export function floodRegion(boundary, width, height, seedX, seedY, options = {}) {
  if (!(boundary instanceof Uint8Array) || boundary.length !== width * height) return null;
  if (!Number.isInteger(seedX) || !Number.isInteger(seedY) || seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return null;
  const seed = seedY * width + seedX;
  if (boundary[seed]) return null;
  const visited = new Uint8Array(boundary.length);
  const queue = new Int32Array(boundary.length);
  let head = 0, tail = 0, touchesEdge = false;
  queue[tail++] = seed;
  visited[seed] = 1;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width, y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
    const neighbors = [x ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const next of neighbors) {
      if (next < 0 || visited[next] || boundary[next]) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
    if (tail >= boundary.length) break;
  }
  if (touchesEdge && options.allowEdge !== true) return null;
  if (tail < 2) return null;
  return { mask: visited, size: tail, touchesEdge };
}

// Trace exposed pixel-cell edges into closed SVG-ready contours.
export function traceRegionContours(mask, width, height, maxEdges = 250000) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) return [];
  const edges = [];
  const add = (ax, ay, bx, by) => edges.push({ ax, ay, bx, by, used: false });
  const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x, y, x + 1, y);
      if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) add(x, y + 1, x, y);
      if (edges.length > maxEdges) return [];
    }
  }
  const key = (x, y) => x + "," + y;
  const outgoing = new Map();
  for (let i = 0; i < edges.length; i++) {
    const k = key(edges[i].ax, edges[i].ay);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(i);
  }
  const contours = [];
  for (let start = 0; start < edges.length; start++) {
    if (edges[start].used) continue;
    const points = [];
    let current = start, guard = 0;
    const first = edges[start];
    points.push([first.ax, first.ay]);
    while (current !== -1 && guard++ <= edges.length + 1) {
      const edge = edges[current];
      if (edge.used) break;
      edge.used = true;
      points.push([edge.bx, edge.by]);
      if (edge.bx === first.ax && edge.by === first.ay) break;
      const candidates = outgoing.get(key(edge.bx, edge.by)) || [];
      current = candidates.find(i => !edges[i].used) ?? -1;
    }
    if (points.length < 4 || points.at(-1)[0] !== points[0][0] || points.at(-1)[1] !== points[0][1]) continue;
    // Remove collinear intermediate pixels to keep SVG compact.
    const compact = [];
    for (let i = 0; i < points.length - 1; i++) {
      const prev = points[(i - 1 + points.length - 1) % (points.length - 1)];
      const curr = points[i];
      const next = points[(i + 1) % (points.length - 1)];
      const cross = (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
      if (Math.abs(cross) > 0.0001) compact.push(curr);
    }
    if (compact.length >= 3) contours.push(compact);
  }
  return contours;
}

export function contoursToPath(contours, mapPoint = p => p) {
  return contours.map(contour => {
    const points = contour.map(([x, y]) => mapPoint({ x, y }));
    if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "";
    return points.map((p, i) => (i ? `L${p.x} ${p.y}` : `M${p.x} ${p.y}`)).join("") + "Z";
  }).filter(Boolean).join("");
}

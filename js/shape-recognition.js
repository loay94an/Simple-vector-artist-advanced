/**
 * Lightweight freehand shape recognition for the Shapes tool.
 * The recognizer is intentionally deterministic and dependency-free so it
 * can run in browsers, Android WebView, and Node's built-in test runner.
 */

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function validPoints(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  for (const point of input) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = { x: point.x, y: point.y };
    if (!result.length || distance(result[result.length - 1], next) >= 0.5) {
      result.push(next);
    }
  }
  return result;
}

function boundsOf(points) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pointLineDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-9) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function simplifyClosed(points, epsilon) {
  const vertices = points.slice(0, -1);
  let changed = true;
  while (changed && vertices.length > 3) {
    changed = false;
    for (let i = 0; i < vertices.length; i++) {
      const previous = vertices[(i - 1 + vertices.length) % vertices.length];
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      if (pointLineDistance(current, previous, next) <= epsilon) {
        vertices.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return vertices;
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1], points[i]);
  return length;
}

function isNearlyCircular(points, bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  if (rx < 1 || ry < 1) return false;
  const radii = points.map(p => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
  const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  const variance = radii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / radii.length;
  return mean > 0 && Math.sqrt(variance) / mean <= 0.16;
}

function isRightAngleQuad(vertices) {
  for (let i = 0; i < 4; i++) {
    const a = vertices[(i - 1 + 4) % 4];
    const b = vertices[i];
    const c = vertices[(i + 1) % 4];
    const ux = a.x - b.x, uy = a.y - b.y;
    const vx = c.x - b.x, vy = c.y - b.y;
    const denom = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!denom || Math.abs((ux * vx + uy * vy) / denom) > 0.32) return false;
  }
  return true;
}

/**
 * Returns one of circle, ellipse, square, rect, triangle, diamond, line,
 * or null when the gesture is too ambiguous.
 */
export function recognizeShape(input) {
  const points = validPoints(input);
  if (points.length < 4) return null;

  const bounds = boundsOf(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  if (diagonal < 8) return null;

  const length = pathLength(points);
  const direct = distance(points[0], points[points.length - 1]);
  const straightness = length > 0 ? direct / length : 0;

  if (straightness >= 0.94) return "line";

  const closed = direct <= Math.max(8, diagonal * 0.18);
  if (!closed) return null;

  const closedPoints = [...points];
  if (distance(closedPoints[0], closedPoints[closedPoints.length - 1]) > 0.001) {
    closedPoints.push(closedPoints[0]);
  }

  const epsilon = Math.max(1.5, diagonal * 0.025);
  const vertices = simplifyClosed(closedPoints, epsilon);

  if (vertices.length === 3) return "triangle";

  if (vertices.length === 4) {
    const sides = vertices.map((p, i) => distance(p, vertices[(i + 1) % 4]));
    const meanSide = sides.reduce((sum, value) => sum + value, 0) / 4;
    const sideVariation = meanSide > 0
      ? Math.sqrt(sides.reduce((sum, value) => sum + (value - meanSide) ** 2, 0) / 4) / meanSide
      : 1;
    if (isRightAngleQuad(vertices)) {
      return sideVariation <= 0.18 ? "square" : "rect";
    }
    return sideVariation <= 0.22 ? "diamond" : "rect";
  }

  if (vertices.length >= 5 && isNearlyCircular(points, bounds)) {
    const ratio = bounds.width / Math.max(1, bounds.height);
    return ratio >= 0.82 && ratio <= 1.22 ? "circle" : "ellipse";
  }

  return null;
}

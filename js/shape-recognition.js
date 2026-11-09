/*
 * Freehand shape recognition for Rasem.
 * ShortStraw-style corner candidates + geometric fitting.
 * Recognition is intentionally conservative: uncertain freeform strokes
 * remain untouched and are handled by the existing smoothing pipeline.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const valid = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const length = v => Math.hypot(v.x, v.y);

function boundsOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathLength(points, closed = false) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  if (closed && points.length > 2) total += distance(points.at(-1), points[0]);
  return total;
}

function interpolate(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: (Number(a.pressure) || 0.5) + ((Number(b.pressure) || 0.5) - (Number(a.pressure) || 0.5)) * t,
    time: (Number(a.time) || 0) + ((Number(b.time) || 0) - (Number(a.time) || 0)) * t
  };
}

function resample(points, spacing, closed = false) {
  const source = points.map(p => ({ ...p }));
  if (closed && distance(source[0], source.at(-1)) < spacing * 1.5) source.pop();
  const total = pathLength(source, closed);
  if (total <= 0) return source;
  const count = Math.max(closed ? 24 : 12, Math.min(128, Math.round(total / spacing)));
  const result = [];
  const segmentCount = closed ? source.length : source.length - 1;
  let segment = 0, traversed = 0;
  const lengths = [];
  for (let i = 0; i < segmentCount; i++) {
    lengths.push(distance(source[i], source[(i + 1) % source.length]));
  }
  const sampleCount = closed ? count : count + 1;
  for (let k = 0; k < sampleCount; k++) {
    const target = total * k / count;
    while (segment < lengths.length - 1 && traversed + lengths[segment] < target) {
      traversed += lengths[segment++];
    }
    const a = source[segment];
    const b = source[(segment + 1) % source.length];
    const span = lengths[segment] || 1;
    result.push(interpolate(a, b, clamp((target - traversed) / span, 0, 1)));
  }
  return result;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cornerAngle(points, index, window = 3, closed = false) {
  const n = points.length;
  const beforeIndex = index - window;
  const afterIndex = index + window;
  if (!closed && (beforeIndex < 0 || afterIndex >= n)) return 0;
  const before = points[(beforeIndex + n) % n];
  const current = points[index];
  const after = points[afterIndex % n];
  const a = { x: current.x - before.x, y: current.y - before.y };
  const b = { x: after.x - current.x, y: after.y - current.y };
  const denom = length(a) * length(b);
  if (denom < 0.0001) return 0;
  return Math.acos(clamp(dot(a, b) / denom, -1, 1));
}

/*
 * ShortStraw-inspired corner detection:
 * resample uniformly, locate local minima of the straw distance, then
 * reject candidates whose direction change is too small.
 */
function detectCorners(points, closed = false) {
  const box = boundsOf(points);
  const diagonal = Math.hypot(box.width, box.height);
  const sampled = resample(points, Math.max(2, diagonal / 54), closed);
  const n = sampled.length;
  const window = Math.max(2, Math.min(4, Math.round(n / 24)));
  const straw = [];
  for (let i = 0; i < n; i++) {
    const left = i - window, right = i + window;
    if (!closed && (left < 0 || right >= n)) straw.push(Infinity);
    else straw.push(distance(sampled[(left + n) % n], sampled[right % n]));
  }
  const threshold = median(straw.filter(Number.isFinite)) * 0.94;
  const angles = sampled.map((_, i) => cornerAngle(sampled, i, window, closed));
  const candidates = [];
  for (let i = closed ? 0 : window; i < (closed ? n : n - window); i++) {
    const prev = straw[(i - 1 + n) % n], next = straw[(i + 1) % n];
    const previousAngle = angles[(i - 1 + n) % n];
    const nextAngle = angles[(i + 1) % n];
    const angle = angles[i];
    const strawMinimum =
      straw[i] <= threshold && straw[i] <= prev && straw[i] <= next && angle >= 0.58;
    // Sharp turns can be missed by straw minima when hand jitter shifts the
    // minimum a few samples away from the actual vertex. Keep angle peaks as
    // an independent candidate source; later segment fitting rejects noise.
    const anglePeak =
      angle >= 0.72 &&
      angle >= previousAngle &&
      angle >= nextAngle;
    if (strawMinimum || anglePeak) {
      candidates.push({ index: i, point: sampled[i], straw: straw[i], angle });
    }
  }
  if (!candidates.length) return { sampled, corners: [] };

  const minGap = Math.max(3, Math.round(n * 0.075));
  const selected = [];
  for (const candidate of candidates.sort((a, b) => a.index - b.index)) {
    const near = selected.find(item => {
      const raw = Math.abs(item.index - candidate.index);
      return Math.min(raw, n - raw) < minGap;
    });
    if (!near) selected.push(candidate);
    else if (candidate.straw < near.straw || candidate.angle > near.angle) {
      selected[selected.indexOf(near)] = candidate;
    }
  }
  selected.sort((a, b) => a.index - b.index);
  return { sampled, corners: selected.map(item => item.point), candidates: selected };
}

function averagePressure(points) {
  return points.reduce((sum, p) => sum + clamp(Number(p.pressure) || 0.5, 0, 1), 0) / points.length;
}

function makeClosedEdges(vertices, pressure) {
  const output = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const steps = Math.max(4, Math.min(16, Math.ceil(distance(a, b) / 12)));
    for (let j = 0; j < steps; j++) output.push(interpolate(a, b, j / steps));
  }
  output.push({ ...output[0], pressure });
  return output;
}

function polygonAngles(vertices) {
  return vertices.map((current, i) => {
    const previous = vertices[(i + vertices.length - 1) % vertices.length];
    const next = vertices[(i + 1) % vertices.length];
    const a = { x: previous.x - current.x, y: previous.y - current.y };
    const b = { x: next.x - current.x, y: next.y - current.y };
    const denom = length(a) * length(b);
    return denom ? Math.acos(clamp(dot(a, b) / denom, -1, 1)) * 180 / Math.PI : 0;
  });
}

function classifyPolygon(vertices) {
  const n = vertices.length;
  const sides = vertices.map((p, i) => distance(p, vertices[(i + 1) % n]));
  const angles = polygonAngles(vertices);
  const right = angles.filter(a => Math.abs(a - 90) <= 19).length;
  const equalSides = Math.max(...sides) / Math.max(0.001, Math.min(...sides)) < 1.18;
  const edges = vertices.map((p, i) => ({
    x: vertices[(i + 1) % n].x - p.x,
    y: vertices[(i + 1) % n].y - p.y
  }));
  const parallel = (a, b) => Math.abs(cross(a, b)) / Math.max(0.001, length(a) * length(b)) < 0.14;
  let type = "polygon";
  if (n === 3) type = "triangle";
  else if (n === 4) {
    const p1 = parallel(edges[0], edges[2]);
    const p2 = parallel(edges[1], edges[3]);
    if (right === 4) type = equalSides ? "square" : "rectangle";
    else if (p1 && p2) type = equalSides ? "rhombus" : "parallelogram";
    else if (p1 || p2) type = "trapezoid";
    else type = "quadrilateral";
  } else {
    const names = { 5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon",
      9: "nonagon", 10: "decagon", 11: "hendecagon", 12: "dodecagon" };
    type = names[n] || "polygon";
  }
  return { type, angles, rightAngles: right };
}

function fitEllipse(points, box) {
  // Estimate the ellipse orientation with the covariance matrix instead of
  // assuming that its major/minor axes are parallel to the canvas axes.
  const mean = points.reduce((sum, p) => ({
    x: sum.x + p.x / points.length,
    y: sum.y + p.y / points.length
  }), { x: 0, y: 0 });
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const dx = p.x - mean.x, dy = p.y - mean.y;
    xx += dx * dx; xy += dx * dy; yy += dy * dy;
  }
  xx /= points.length; xy /= points.length; yy /= points.length;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const projected = points.map(p => {
    const dx = p.x - mean.x, dy = p.y - mean.y;
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  });
  const minX = Math.min(...projected.map(p => p.x));
  const maxX = Math.max(...projected.map(p => p.x));
  const minY = Math.min(...projected.map(p => p.y));
  const maxY = Math.max(...projected.map(p => p.y));
  let rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
  if (rx < 4 || ry < 4) return null;
  const localCx = (minX + maxX) / 2, localCy = (minY + maxY) / 2;
  const cx = mean.x + localCx * cos - localCy * sin;
  const cy = mean.y + localCx * sin + localCy * cos;
  let error = 0;
  for (const p of projected) {
    error += Math.abs(Math.hypot((p.x - localCx) / rx, (p.y - localCy) / ry) - 1);
  }
  error /= projected.length;
  // Sharp polygon vertices inflate the radial residual even when their
  // covariance resembles an ellipse. Keep ellipse fitting strict so rotated
  // rectangles and polygons can reach the corner-based classifier.
  if (error > 0.075) return null;

  const aspect = Math.max(rx, ry) / Math.min(rx, ry);
  const isCircle = aspect < 1.12;
  if (isCircle) {
    const radius = (rx + ry) / 2;
    rx = radius;
    ry = radius;
  }
  const output = [];
  for (let i = 0; i < 96; i++) {
    const theta = Math.PI * 2 * i / 96;
    const localX = Math.cos(theta) * rx;
    const localY = Math.sin(theta) * ry;
    output.push({
      x: cx + localX * cos - localY * sin,
      y: cy + localX * sin + localY * cos,
      pressure: averagePressure(points),
      time: points[0].time || 0
    });
  }
  output.push({ ...output[0] });
  return {
    type: isCircle ? "circle" : "ellipse",
    points: output,
    confidence: clamp(1 - error * 3.2, 0.72, 0.99),
    corners: [],
    rotation: isCircle ? 0 : angle
  };
}
function fitArc(points) {
  const start = points[0], middle = points[Math.floor(points.length / 2)], end = points.at(-1);
  const determinant = 2 * (start.x * (middle.y - end.y) +
    middle.x * (end.y - start.y) + end.x * (start.y - middle.y));
  if (Math.abs(determinant) < 0.001) return null;
  const a2 = start.x ** 2 + start.y ** 2;
  const b2 = middle.x ** 2 + middle.y ** 2;
  const c2 = end.x ** 2 + end.y ** 2;
  const cx = (a2 * (middle.y - end.y) + b2 * (end.y - start.y) + c2 * (start.y - middle.y)) / determinant;
  const cy = (a2 * (end.x - middle.x) + b2 * (start.x - end.x) + c2 * (middle.x - start.x)) / determinant;
  const center = { x: cx, y: cy }, radius = distance(center, start);
  if (!Number.isFinite(radius) || radius < 8) return null;
  const radial = points.map(p => distance(center, p));
  const relativeError = Math.sqrt(radial.reduce((sum, r) => sum + (r - radius) ** 2, 0) / radial.length) / radius;
  if (relativeError > 0.035) return null;
  const angles = points.map(p => Math.atan2(p.y - cy, p.x - cx));
  let sweep = 0, direction = 0, reversals = 0;
  for (let i = 1; i < angles.length; i++) {
    let delta = angles[i] - angles[i - 1];
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > 0.0001) {
      const sign = Math.sign(delta);
      if (direction && sign !== direction) reversals++;
      direction = sign;
    }
    sweep += delta;
  }
  if (Math.abs(sweep) < 0.28 || Math.abs(sweep) > Math.PI * 1.85 || reversals > Math.max(2, points.length * 0.035)) return null;
  const count = Math.max(24, Math.ceil(Math.abs(sweep) * 24));
  const output = [];
  for (let i = 0; i <= count; i++) {
    const angle = angles[0] + sweep * i / count;
    output.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius,
      pressure: averagePressure(points), time: points[0].time || 0 });
  }
  return { type: "arc", points: output, confidence: clamp(1 - relativeError * 5, 0.76, 0.99), corners: [] };
}

function fitLine(points, strength) {
  const first = points[0], last = points.at(-1), chord = distance(first, last);
  if (chord < 24) return null;
  let squared = 0, maximum = 0;
  for (const p of points) {
    const deviation = Math.abs((last.x - first.x) * (first.y - p.y) -
      (first.x - p.x) * (last.y - first.y)) / chord;
    squared += deviation * deviation;
    maximum = Math.max(maximum, deviation);
  }
  const rms = Math.sqrt(squared / points.length);
  if (rms / chord > 0.012 + strength * 0.012 || maximum / chord > 0.045 + strength * 0.025) return null;
  return { type: "line", points: [ { ...first }, { ...last } ],
    confidence: clamp(1 - rms / chord * 12, 0.76, 0.99), corners: [] };
}


function fitSmoothCurve(points) {
  const first = points[0], last = points.at(-1);
  const chord = distance(first, last);
  const total = pathLength(points);
  if (chord < 24 || total / chord < 1.035 || total / chord > 1.7) return null;

  const box = boundsOf(points);
  const diagonal = Math.hypot(box.width, box.height);
  if (!diagonal) return null;

  // A single smooth bend has a consistent curvature direction. An S stroke
  // changes direction and is deliberately left as freehand.
  let previousSign = 0, reversals = 0, meaningfulTurns = 0;
  const window = Math.max(2, Math.round(points.length / 36));
  for (let i = window; i < points.length - window; i++) {
    const before = points[i - window], current = points[i], after = points[i + window];
    const a = { x: current.x - before.x, y: current.y - before.y };
    const b = { x: after.x - current.x, y: after.y - current.y };
    const turn = cross(a, b);
    if (Math.abs(turn) < length(a) * length(b) * 0.004) continue;
    const sign = Math.sign(turn);
    if (previousSign && sign !== previousSign) reversals++;
    previousSign = sign;
    meaningfulTurns++;
  }
  // A simple arch keeps one curvature direction; an S-shaped freehand stroke
  // reverses it and must not be mistaken for a single curve.
  if (meaningfulTurns < 3 || reversals > 0) return null;

  const baseline = points.map(p => Math.abs(
    (last.x - first.x) * (first.y - p.y) -
    (first.x - p.x) * (last.y - first.y)
  ) / chord);
  const maxDeviation = Math.max(...baseline);
  if (maxDeviation < diagonal * 0.035) return null;

  const output = resample(points, Math.max(2, diagonal / 70), false);
  return {
    type: "curve",
    points: output,
    confidence: 0.78,
    corners: []
  };
}

function fitOpenPolyline(points, strength) {
  const { corners } = detectCorners(points, false);
  if (!corners.length || corners.length > 8) return null;

  // Map each detected corner back to its nearest original sample so each
  // straight segment is assessed only against the samples belonging to it.
  const vertices = [points[0], ...corners, points.at(-1)];
  const indices = vertices.map(vertex => {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = distance(points[i], vertex);
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  });
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) return null;
  }

  const diagonal = Math.hypot(boundsOf(points).width, boundsOf(points).height);
  let squaredError = 0, sampleCount = 0;
  for (let segment = 1; segment < vertices.length; segment++) {
    const a = vertices[segment - 1], b = vertices[segment];
    const chord = distance(a, b);
    if (chord < Math.max(10, diagonal * 0.06)) return null;
    for (let i = indices[segment - 1]; i <= indices[segment]; i++) {
      const p = points[i];
      const deviation = Math.abs((b.x - a.x) * (a.y - p.y) -
        (a.x - p.x) * (b.y - a.y)) / chord;
      squaredError += deviation * deviation;
      sampleCount++;
    }
  }
  const rms = Math.sqrt(squaredError / Math.max(1, sampleCount));
  if (rms / Math.max(1, diagonal) > 0.028 + strength * 0.025) return null;

  const output = [];
  for (let i = 0; i < vertices.length; i++) {
    if (!i) { output.push({ ...vertices[i] }); continue; }
    const a = vertices[i - 1], b = vertices[i];
    const steps = Math.max(3, Math.ceil(distance(a, b) / 10));
    for (let j = 1; j <= steps; j++) output.push(interpolate(a, b, j / steps));
  }
  const angles = vertices.slice(1, -1).map((_, i) => {
    const a = vertices[i], b = vertices[i + 1], c = vertices[i + 2];
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    return Math.acos(clamp(dot(v1, v2) /
      Math.max(0.001, length(v1) * length(v2)), -1, 1)) * 180 / Math.PI;
  });
  return {
    type: (() => {
      const turns = [];
      for (let i = 1; i < vertices.length - 1; i++) {
        const a = { x: vertices[i].x - vertices[i - 1].x, y: vertices[i].y - vertices[i - 1].y };
        const b = { x: vertices[i + 1].x - vertices[i].x, y: vertices[i + 1].y - vertices[i].y };
        const turn = cross(a, b);
        if (Math.abs(turn) > length(a) * length(b) * 0.08) turns.push(Math.sign(turn));
      }
      const alternations = turns.slice(1).filter((sign, i) => sign !== turns[i]).length;
      return turns.length >= 3 && alternations >= turns.length - 2 ? "zigzag" : "polyline";
    })(),
    points: output,
    corners,
    angles,
    angleTypes: angles.map(angle => angle < 90 ? "acute" : angle > 90 ? "obtuse" : "right"),
    confidence: clamp(1 - rms / Math.max(1, diagonal) * 5, 0.72, 0.96)
  };
}

function recognizeShapeBase(sourcePoints, options = {}) {
  if (!Array.isArray(sourcePoints) || sourcePoints.length < 8) return null;
  const points = sourcePoints.filter(valid);
  if (points.length < 8) return null;
  const box = boundsOf(points), diagonal = Math.hypot(box.width, box.height);
  if (diagonal < 24 || (box.width < 6 && box.height < 6)) return null;
  const strength = clamp(Number(options.strength) || 0.35, 0, 1);
  const gap = distance(points[0], points.at(-1));
  const closed = gap <= Math.max(10, diagonal * 0.14) &&
    pathLength(points) > diagonal * 2.1;

  if (closed) {
    const ellipse = fitEllipse(points, box);
    if (ellipse) return ellipse;

    const { corners } = detectCorners(points, true);
    if (corners.length >= 3 && corners.length <= 12) {
      const classified = classifyPolygon(corners);
      const pressure = averagePressure(points);
      const output = makeClosedEdges(corners, pressure);
      const confidence = classified.type === "polygon"
        ? 0.78
        : classified.type === "quadrilateral" ? 0.74 : 0.88;
      return { ...classified, points: output, corners,
        confidence, angleTypes: classified.angles.map(angle =>
          angle < 90 ? "acute" : angle > 90 ? "obtuse" : "right") };
    }
    return null;
  }

  const line = fitLine(points, strength);
  if (line) return line;
  const arc = fitArc(points);
  if (arc) return arc;
  const curve = fitSmoothCurve(points);
  if (curve) return curve;
  return fitOpenPolyline(points, strength);
}


/*
 * Extended classification catalogue: 23 existing base types plus 39
 * specific classifications. The base type remains stable for renderer
 * compatibility; classifications are additional semantic labels.
 */
const BASE_SHAPE_CLASSIFICATIONS = Object.freeze([
  "triangle","square","rectangle","rhombus","parallelogram","trapezoid",
  "quadrilateral","pentagon","hexagon","heptagon","octagon","nonagon",
  "decagon","hendecagon","dodecagon","polygon","circle","ellipse","line",
  "arc","curve","polyline","zigzag",
  "triangle-equilateral","triangle-isosceles","triangle-scalene",
  "triangle-right","triangle-acute","triangle-obtuse",
  "kite","dart","trapezoid-isosceles","trapezoid-right","quadrilateral-concave",
  "polygon-convex","polygon-concave","polygon-regular","polygon-irregular",
  "polygon-star","polygon-self-intersecting",
  "semicircle","quarter-circle","circular-sector","annulus","crescent","circular-segment",
  "parabola","hyperbola","sine-wave","spiral","cardioid","limacon",
  "lemniscate","rose-curve","astroid","cycloid","catenary","lissajous",
  "s-curve","wavy-line","orthogonal-polyline","compound-curve"
]);

const OPEN_VARIANT_FAMILIES = Object.freeze([
  "open-line", "open-arc", "open-curve", "open-polyline", "open-zigzag",
  "open-spiral", "open-wave", "open-s-curve", "open-orthogonal-polyline",
  "open-compound-curve"
]);
const CLOSED_VARIANT_FAMILIES = Object.freeze([
  "closed-triangle", "closed-quadrilateral", "closed-polygon", "closed-circle",
  "closed-ellipse", "closed-star", "closed-concave-polygon",
  "closed-regular-polygon", "closed-annulus", "closed-crescent"
]);
const SHAPE_VARIANT_CLASSIFICATIONS = Object.freeze(
  [...OPEN_VARIANT_FAMILIES, ...CLOSED_VARIANT_FAMILIES].flatMap(family =>
    Array.from({ length: 50 }, (_, index) =>
      family + "-axis-" + String(Math.floor(index / 5) + 1).padStart(2, "0") +
      "-ratio-" + String(index % 5 + 1).padStart(2, "0")
    )
  )
);
export const SHAPE_CLASSIFICATIONS = Object.freeze([
  ...BASE_SHAPE_CLASSIFICATIONS,
  ...SHAPE_VARIANT_CLASSIFICATIONS
]);

const EPSILON = 1e-6;
const angleBetween = (a,b,c) => {
  const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};
  const d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
  return d<EPSILON?0:Math.acos(clamp((u.x*v.x+u.y*v.y)/d,-1,1))*180/Math.PI;
};
const polygonArea = points => points.reduce((sum,p,i)=>{
  const q=points[(i+1)%points.length]; return sum+p.x*q.y-q.x*p.y;
},0)/2;
function segmentIntersection(a,b,c,d) {
  const orient=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  return o1*o2 < -EPSILON && o3*o4 < -EPSILON;
}
function hasSelfIntersection(points) {
  const n=points.length;
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++) {
    if(i===0&&j===n-1) continue;
    if(segmentIntersection(points[i],points[(i+1)%n],points[j],points[(j+1)%n])) return true;
  }
  return false;
}
function classifyExtended(points,result) {
  const labels=new Set([result.type]);
  const shapePoints=result.corners?.length>=3?result.corners:points;
  if(result.type==="triangle" && result.corners?.length===3) {
    const v=result.corners, sides=v.map((p,i)=>distance(p,v[(i+1)%3]));
    const angles=v.map((p,i)=>angleBetween(v[(i+2)%3],p,v[(i+1)%3]));
    const equal01=Math.abs(sides[0]-sides[1])/Math.max(...sides)<.09;
    const equal12=Math.abs(sides[1]-sides[2])/Math.max(...sides)<.09;
    const equal20=Math.abs(sides[2]-sides[0])/Math.max(...sides)<.09;
    const right=angles.some(a=>Math.abs(a-90)<13);
    const obtuse=angles.some(a=>a>103);
    const acute=angles.every(a=>a<97);
    if(right) labels.add("triangle-right");
    if(obtuse) labels.add("triangle-obtuse");
    if(acute) labels.add("triangle-acute");
    if(equal01&&equal12&&equal20) labels.add("triangle-equilateral");
    else if(equal01||equal12||equal20) labels.add("triangle-isosceles");
    else labels.add("triangle-scalene");
  }
  if(result.type==="trapezoid"&&result.corners?.length===4) {
    const v=result.corners, sides=v.map((p,i)=>distance(p,v[(i+1)%4]));
    const parallel=(a,b)=>Math.abs(cross(a,b))/Math.max(EPSILON,length(a)*length(b))<.12;
    const e=v.map((p,i)=>({x:v[(i+1)%4].x-p.x,y:v[(i+1)%4].y-p.y}));
    if(Math.abs(sides[0]-sides[2])/Math.max(...sides)<.1 ||
       Math.abs(sides[1]-sides[3])/Math.max(...sides)<.1) labels.add("trapezoid-isosceles");
    if(v.some((p,i)=>Math.abs(angleBetween(v[(i+3)%4],p,v[(i+1)%4])-90)<13)) labels.add("trapezoid-right");
  }
  if(result.corners?.length===4) {
    const v=result.corners, sides=v.map((p,i)=>distance(p,v[(i+1)%4]));
    const pairs=Math.abs(sides[0]-sides[1])<Math.max(...sides)*.1 &&
      Math.abs(sides[2]-sides[3])<Math.max(...sides)*.1;
    const reflex=v.some((p,i)=>angleBetween(v[(i+3)%4],p,v[(i+1)%4])>190);
    if(reflex) labels.add("quadrilateral-concave");
    else if(result.type==="quadrilateral"&&pairs) labels.add("kite");
    if(result.type==="quadrilateral"&&reflex) labels.add("dart");
    if(result.type==="quadrilateral"&&!reflex&&pairs) labels.add("kite");
  }
  if(result.corners?.length>=5) {
    const v=result.corners, turns=[];
    for(let i=0;i<v.length;i++){
      const a=v[i],b=v[(i+1)%v.length],c=v[(i+2)%v.length];
      turns.push(cross({x:b.x-a.x,y:b.y-a.y},{x:c.x-b.x,y:c.y-b.y}));
    }
    const signs=turns.filter(x=>Math.abs(x)>EPSILON).map(Math.sign);
    const concave=signs.some(s=>s!==signs[0]);
    const sides=v.map((p,i)=>distance(p,v[(i+1)%v.length]));
    const regular=Math.max(...sides)/Math.max(EPSILON,Math.min(...sides))<1.12;
    if(concave) labels.add("polygon-concave"); else labels.add("polygon-convex");
    labels.add(regular?"polygon-regular":"polygon-irregular");
    if(hasSelfIntersection(v)) labels.add("polygon-self-intersecting");
    if(v.length>=5&&concave) labels.add("polygon-star");
  }
  const box=boundsOf(points), diag=Math.hypot(box.width,box.height);
  // Fit a circle to three widely separated stroke samples. For a circular
  // segment, most samples lie on the arc while the closing chord is an outlier.
  if(result.type==="polygon"||result.type==="quadrilateral"||result.type==="triangle") {
    const n=points.length, a=points[0], b=points[Math.floor(n/3)], c=points[Math.floor(2*n/3)];
    const det=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
    if(Math.abs(det)>EPSILON) {
      const aa=a.x*a.x+a.y*a.y,bb=b.x*b.x+b.y*b.y,cc=c.x*c.x+c.y*c.y;
      const cx=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/det;
      const cy=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/det;
      const rr=points.map(p=>distance(p,{x:cx,y:cy}));
      const radius=median(rr);
      const inliers=rr.map((r,i)=>({r,i})).filter(x=>Math.abs(x.r-radius)<Math.max(3,radius*.045));
      if(radius>8&&inliers.length/points.length>.68) {
        const angles=inliers.map(x=>Math.atan2(points[x.i].y-cy,points[x.i].x-cx));
        let sweep=0;
        for(let i=1;i<angles.length;i++){let d=angles[i]-angles[i-1];while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;sweep+=d;}
        const coverage=Math.abs(sweep);
        if(coverage>1.25&&coverage<3.85) labels.add(coverage>2.25?"semicircle":"circular-segment");
        else if(coverage>=.95&&coverage<=2.15) labels.add("quarter-circle");
        else if(coverage>3.85) labels.add("circular-sector");
      }
    }
  }
  // Concentric double-loop strokes are annuli; two close opposing arcs form
  // a crescent. Use radial distribution rather than the bounding box alone.
  const center={x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2};
  const radial=points.map(p=>distance(p,center)).sort((a,b)=>a-b);
  const radialMedian=median(radial);
  const inner=radial.filter(r=>r<radialMedian*.72).length;
  const outer=radial.filter(r=>r>radialMedian*1.18).length;
  if(inner>points.length*.16&&outer>points.length*.16) labels.add("annulus");
  if(result.type==="polygon"&&result.corners?.length>=6&&inner>points.length*.08) labels.add("crescent");
  if(["curve","arc"].includes(result.type)) {
    const open=distance(points[0],points.at(-1));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const yRange=Math.max(...ys)-Math.min(...ys),xRange=Math.max(...xs)-Math.min(...xs);
    let extrema=0,last=0;
    for(let i=2;i<points.length;i++){
      const a=points[i-1].y-points[i-2].y,b=points[i].y-points[i-1].y;
      const s=Math.sign(b);
      if(s&&last&&s!==last) extrema++;
      if(s) last=s;
    }
    if(extrema>=2&&xRange>yRange*.9) labels.add("sine-wave");
    if(extrema>=3&&xRange>yRange*.7) labels.add("wavy-line");
    if(result.type==="curve"&&extrema===1) {
      // A single smooth vertex with monotonic x is a parabola candidate.
      let monotonicX=true;
      for(let i=2;i<points.length;i++) if((points[i].x-points[i-1].x)*(points[i-1].x-points[i-2].x)<0) monotonicX=false;
      if(monotonicX) labels.add("parabola");
    }
    if(result.type==="curve"&&extrema>=2&&xRange>yRange*.8) labels.add("sine-wave");
    if(result.type==="curve"&&extrema>=2&&open/Math.max(1,diag)<.12) labels.add("lissajous");
    if(result.type==="curve"&&extrema===1&&yRange>xRange*.8) labels.add("catenary");
    if(result.type==="curve"&&extrema>=2&&open/Math.max(1,diag)>.25) labels.add("cycloid");
    if(result.type==="curve"&&extrema>=3&&open/Math.max(1,diag)<.2) labels.add("hyperbola");
    if(result.type==="curve"&&extrema>=2&&open/Math.max(1,diag)<.08) labels.add("lemniscate");
    if(result.type==="curve"&&extrema>=2&&xRange>yRange*.7) labels.add("limacon");
    if(result.type==="curve"&&extrema>=2&&open/Math.max(1,diag)<.22) labels.add("lissajous");
    if(result.type==="curve"&&open/Math.max(1,diag)<.12) labels.add("compound-curve");
    // Radial monotonicity identifies spiral-like strokes conservatively.
    const center={x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2};
    const radii=points.map(p=>distance(p,center));
    let radialChanges=0;
    for(let i=1;i<radii.length;i++) if(Math.abs(radii[i]-radii[i-1])>diag*.002) radialChanges++;
    if(radialChanges>points.length*.55&&open/Math.max(1,diag)>.18) labels.add("spiral");
    // A double-lobed closed-looking open stroke is a lemniscate candidate.
    if(extrema>=2&&open/Math.max(1,diag)<.08) labels.add("lemniscate");
  }
  // Closed polar families: detect radial petals and characteristic
  // two-lobed / heart-like contours. Labels are only emitted on closed strokes.
  if(distance(points[0],points.at(-1))<Math.max(10,diag*.14)) {
    const polarCenter={x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
    const polar=points.slice(0,-1).map(p=>({a:Math.atan2(p.y-polarCenter.y,p.x-polarCenter.x),r:distance(p,polarCenter)}));
    const radialPeaks=polar.filter((p,i)=>i>1&&i<polar.length-2&&p.r>polar[i-1].r&&p.r>polar[i+1].r&&p.r>polar[i-2].r&&p.r>polar[i+2].r).length;
    const radialMin=Math.min(...polar.map(p=>p.r)),radialMax=Math.max(...polar.map(p=>p.r));
    const radialRatio=radialMax/Math.max(1,radialMin);
    if(radialPeaks>=3) labels.add("rose-curve");
    if(radialPeaks===3||radialPeaks===4) labels.add("astroid");
    if(radialRatio>2.1&&radialPeaks<=2) labels.add("cardioid");
    if(radialRatio>1.55&&radialPeaks<=2&&!labels.has("cardioid")) labels.add("limacon");
    if(hasSelfIntersection(shapePoints)) labels.add("lemniscate");
  }
  if(result.type==="polyline"||result.type==="zigzag") {
    const v=[points[0],...(result.corners||[]),points.at(-1)];
    const orthogonal=v.length>=3&&v.slice(1).every((p,i)=>{
      const q=v[i]; return Math.min(Math.abs(p.x-q.x),Math.abs(p.y-q.y))<diag*.055;
    });
    if(orthogonal) labels.add("orthogonal-polyline");
  }
  if(result.type==="curve"&&points.length>24) {
    const ys=points.map(p=>p.y),xs=points.map(p=>p.x);
    const changes=ys.slice(1).filter((v,i)=>Math.sign(v-ys[i])!==Math.sign(ys[i]-ys[Math.max(0,i-1)])).length;
    if(changes>=2) labels.add("s-curve");
  }
  return [...labels];
}

function classifyShapeVariant(points, result, labels) {
  const box = boundsOf(points);
  const diagonal = Math.hypot(box.width, box.height);
  if (!diagonal) return null;
  const isClosed = distance(points[0], points.at(-1)) <= Math.max(10, diagonal * 0.14) &&
    pathLength(points) > diagonal * 2.1;
  let family = null;
  if (!isClosed) {
    if (labels.includes("spiral")) family = "open-spiral";
    else if (labels.includes("sine-wave") || labels.includes("wavy-line")) family = "open-wave";
    else if (labels.includes("s-curve")) family = "open-s-curve";
    else if (labels.includes("orthogonal-polyline")) family = "open-orthogonal-polyline";
    else if (labels.includes("compound-curve")) family = "open-compound-curve";
    else if (result.type === "line") family = "open-line";
    else if (result.type === "arc") family = "open-arc";
    else if (result.type === "zigzag") family = "open-zigzag";
    else if (result.type === "polyline") family = "open-polyline";
    else if (result.type === "curve") family = "open-curve";
  } else {
    if (labels.includes("annulus")) family = "closed-annulus";
    else if (labels.includes("crescent")) family = "closed-crescent";
    else if (labels.includes("polygon-star")) family = "closed-star";
    else if (labels.includes("polygon-concave")) family = "closed-concave-polygon";
    else if (labels.includes("polygon-regular")) family = "closed-regular-polygon";
    else if (result.type === "triangle") family = "closed-triangle";
    else if (result.type === "circle") family = "closed-circle";
    else if (result.type === "ellipse") family = "closed-ellipse";
    else if (["square", "rectangle", "rhombus", "parallelogram", "trapezoid", "quadrilateral", "kite", "dart"].includes(result.type)) family = "closed-quadrilateral";
    else if (result.corners?.length >= 3) family = "closed-polygon";
  }
  if (!family) return null;
  const mean = points.reduce((sum, p) => ({
    x: sum.x + p.x / points.length,
    y: sum.y + p.y / points.length
  }), { x: 0, y: 0 });
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const dx = p.x - mean.x, dy = p.y - mean.y;
    xx += dx * dx; xy += dx * dy; yy += dy * dy;
  }
  const angle = ((0.5 * Math.atan2(2 * xy, xx - yy) % Math.PI) + Math.PI) % Math.PI;
  const axisBin = Math.min(9, Math.floor(angle / Math.PI * 10));
  const ratio = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
  const ratioBin = ratio < 1.15 ? 0 : ratio < 1.35 ? 1 : ratio < 1.7 ? 2 : ratio < 2.4 ? 3 : 4;
  return family + "-axis-" + String(axisBin + 1).padStart(2, "0") +
    "-ratio-" + String(ratioBin + 1).padStart(2, "0");
}

export function recognizeShape(sourcePoints, options = {}) {
  const result=recognizeShapeBase(sourcePoints,options);
  if(!result) return null;
  const points = sourcePoints.filter(valid);
  const labels = classifyExtended(points, result);
  const variantClassification = classifyShapeVariant(points, result, labels);
  if (variantClassification) labels.push(variantClassification);
  result.classifications = labels;
  result.variantClassification = variantClassification;
  result.classification = labels.find(label => label !== result.type &&
    !SHAPE_VARIANT_CLASSIFICATIONS.includes(label)) || result.type;
  return result;
}

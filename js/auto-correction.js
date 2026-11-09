/*
 * Adaptive freehand correction for Rasem.
 *
 * The implementation combines established sketch-processing ideas:
 * uniform local neighbourhoods, corner preservation, speed-aware filtering,
 * and attribute-preserving resampling. It is an original integration for
 * Rasem; it does not copy third-party source files.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validPoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function boundsDiagonal(points) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function angleAt(points, index, radius = 2) {
  const before = points[Math.max(0, index - radius)];
  const current = points[index];
  const after = points[Math.min(points.length - 1, index + radius)];
  const ax = current.x - before.x;
  const ay = current.y - before.y;
  const bx = after.x - current.x;
  const by = after.y - current.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator < 1e-6) return 0;
  return Math.acos(clamp((ax * bx + ay * by) / denominator, -1, 1));
}

/*
 * Anchor real corners before filtering. A corner is protected together with
 * its adjacent samples so smoothing cannot round a deliberate vertex.
 */
function findProtectedSamples(points) {
  const protectedSamples = new Set([0, points.length - 1]);
  for (let i = 2; i < points.length - 2; i++) {
    if (angleAt(points, i, 2) > 0.82) {
      protectedSamples.add(i - 1);
      protectedSamples.add(i);
      protectedSamples.add(i + 1);
    }
  }
  return protectedSamples;
}

/**
 * Reduce hand tremor while retaining endpoints, intentional corners,
 * pressure, timestamps and point order.
 *
 * strength: 0..100. The function never changes the number of samples.
 */
export function correctStrokePoints(source, strength = 35) {
  if (!Array.isArray(source)) return [];
  const points = source.filter(validPoint).map(point => ({ ...point }));
  const amount = clamp(Number(strength) || 0, 0, 100);
  if (points.length < 5 || amount <= 0) return points;

  const protectedSamples = findProtectedSamples(points);
  const diagonal = Math.max(1, boundsDiagonal(points));
  const segmentSpeeds = [];
  for (let i = 1; i < points.length; i++) {
    const elapsed = Math.max(1, (Number(points[i].time) || i) - (Number(points[i - 1].time) || i - 1));
    segmentSpeeds.push(distance(points[i - 1], points[i]) / elapsed);
  }
  const typicalSpeed = Math.max(1e-6, median(segmentSpeeds));
  const passes = amount >= 72 ? 2 : 1;
  const baseStrength = amount / 100;

  let current = points;
  for (let pass = 0; pass < passes; pass++) {
    const previous = current.map(point => ({ ...point }));
    const next = previous.map(point => ({ ...point }));
    for (let i = 2; i < previous.length - 2; i++) {
      if (protectedSamples.has(i)) continue;
      const p = previous[i];
      const localSpeed = (segmentSpeeds[Math.max(0, i - 1)] + segmentSpeeds[Math.min(segmentSpeeds.length - 1, i)]) / 2;
      const speedRatio = clamp(localSpeed / typicalSpeed, 0.55, 1.8);
      // Faster motion receives slightly more tremor filtering; deliberate
      // slow movement remains closer to the captured hand path.
      const adaptive = baseStrength * (0.82 + clamp(speedRatio - 1, -0.35, 0.55) * 0.22);
      const weights = [1, 2, 4, 2, 1];
      let totalWeight = 0, targetX = 0, targetY = 0;
      for (let offset = -2; offset <= 2; offset++) {
        const weight = weights[offset + 2];
        const sample = previous[i + offset];
        totalWeight += weight;
        targetX += sample.x * weight;
        targetY += sample.y * weight;
      }
      targetX /= totalWeight;
      targetY /= totalWeight;

      const proposedX = p.x + (targetX - p.x) * adaptive * 0.72;
      const proposedY = p.y + (targetY - p.y) * adaptive * 0.72;
      const maxShift = diagonal * (0.0015 + baseStrength * 0.006);
      const dx = proposedX - p.x;
      const dy = proposedY - p.y;
      const shift = Math.hypot(dx, dy);
      const scale = shift > maxShift ? maxShift / shift : 1;
      next[i] = {
        ...p,
        x: p.x + dx * scale,
        y: p.y + dy * scale
      };
    }
    current = next;
  }
  return current;
}

/*
 * Geometry fitting creates new sample positions. Transfer pressure and time
 * by normalized arc length so variable-width brushes retain their dynamics.
 */
export function transferStrokeAttributes(source, target) {
  if (!Array.isArray(target)) return [];
  if (!Array.isArray(source) || source.length < 2 || target.length === 0) {
    return target.map(point => ({ ...point }));
  }

  const lengths = [0];
  for (let i = 1; i < source.length; i++) {
    lengths.push(lengths[i - 1] + distance(source[i - 1], source[i]));
  }
  const total = lengths[lengths.length - 1];
  if (total < 1e-6) {
    return target.map((point, index) => ({
      ...point,
      pressure: source[Math.min(source.length - 1, index)]?.pressure ?? 0.5,
      time: source[Math.min(source.length - 1, index)]?.time ?? 0
    }));
  }

  return target.map((point, index) => {
    const progress = target.length <= 1 ? 0 : index / (target.length - 1);
    const wanted = total * progress;
    let right = lengths.findIndex(value => value >= wanted);
    if (right < 1) right = 1;
    if (right < 0) right = source.length - 1;
    const left = right - 1;
    const span = Math.max(1e-6, lengths[right] - lengths[left]);
    const t = clamp((wanted - lengths[left]) / span, 0, 1);
    const a = source[left], b = source[right];
    const pressureA = Number.isFinite(a.pressure) ? a.pressure : 0.5;
    const pressureB = Number.isFinite(b.pressure) ? b.pressure : 0.5;
    const timeA = Number.isFinite(a.time) ? a.time : 0;
    const timeB = Number.isFinite(b.time) ? b.time : timeA;
    return {
      ...point,
      pressure: pressureA + (pressureB - pressureA) * t,
      time: timeA + (timeB - timeA) * t
    };
  });
}

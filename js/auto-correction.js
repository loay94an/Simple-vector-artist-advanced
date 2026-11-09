/*
 * Strength-controlled freehand beautification for Rasem.
 * The correction is deliberately post-stroke so raw pointer samples remain
 * available for undo/history. Pressure and timing are retained.
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const validPoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function diagonal(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return Math.max(1, Math.hypot(maxX - minX, maxY - minY));
}

function turningAngle(points, index, radius = 2) {
  const a = points[Math.max(0, index - radius)];
  const p = points[index];
  const b = points[Math.min(points.length - 1, index + radius)];
  const ax = p.x - a.x, ay = p.y - a.y;
  const bx = b.x - p.x, by = b.y - p.y;
  const den = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (den < 1e-7) return 0;
  return Math.acos(clamp((ax * bx + ay * by) / den, -1, 1));
}

/**
 * 0% = untouched. 100% = deliberately strong beautification.
 * Higher strengths use a wider neighbourhood, more passes, and soften
 * intentional corners instead of protecting them absolutely.
 */
export function correctStrokePoints(source, strength = 35) {
  if (!Array.isArray(source)) return [];
  const points = source.filter(validPoint).map(p => ({ ...p }));
  const amount = clamp(Number(strength) || 0, 0, 100);
  if (points.length < 3 || amount <= 0) return points;

  // Non-linear response makes the upper half of the slider substantially stronger.
  const power = Math.pow(amount / 100, 0.78);
  const radius = 1 + Math.round(power * 3);
  const passes = 1 + Math.round(power * 5);
  const weights = [];
  for (let offset = -radius; offset <= radius; offset++) {
    weights.push(Math.exp(-(offset * offset) / (2 * Math.max(1, radius * 0.72) ** 2)));
  }

  const bounds = diagonal(points);
  const speeds = [];
  for (let i = 1; i < points.length; i++) {
    const dt = Math.max(1, (Number(points[i].time) || i) - (Number(points[i - 1].time) || i - 1));
    speeds.push(distance(points[i - 1], points[i]) / dt);
  }
  const typicalSpeed = Math.max(1e-6, median(speeds));
  let current = points;

  for (let pass = 0; pass < passes; pass++) {
    const previous = current;
    const next = previous.map(p => ({ ...p }));
    for (let i = 1; i < previous.length - 1; i++) {
      let sx = 0, sy = 0, sw = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const j = clamp(i + offset, 0, previous.length - 1);
        const w = weights[offset + radius];
        sx += previous[j].x * w;
        sy += previous[j].y * w;
        sw += w;
      }
      const p = previous[i];
      const localSpeed = (speeds[Math.max(0, i - 1)] + speeds[Math.min(speeds.length - 1, i)]) / 2;
      const speedRatio = clamp(localSpeed / typicalSpeed, 0.55, 1.8);
      const speedGain = 0.9 + clamp(speedRatio - 1, -0.35, 0.55) * 0.22;
      const blend = clamp((0.12 + power * 0.88) * speedGain, 0, 1);
      let dx = (sx / sw - p.x) * blend;
      let dy = (sy / sw - p.y) * blend;

      // Corners are protected at low strength, but intentionally softened
      // at high strength as requested by the user.
      const angle = turningAngle(previous, i, Math.min(2, radius));
      if (angle > 0.52) {
        const cornerRetention = Math.pow(1 - power, 1.35);
        dx *= cornerRetention;
        dy *= cornerRetention;
      }

      const maxShift = bounds * (0.001 + power * 0.045);
      const shift = Math.hypot(dx, dy);
      if (shift > maxShift) {
        const scale = maxShift / shift;
        dx *= scale; dy *= scale;
      }
      next[i] = { ...p, x: p.x + dx, y: p.y + dy };
    }
    current = next;
  }
  return current;
}

/** Transfer variable-width brush dynamics to a fitted/replaced path. */
export function transferStrokeAttributes(source, target) {
  if (!Array.isArray(target)) return [];
  if (!Array.isArray(source) || source.length < 2 || target.length === 0) {
    return target.map(p => ({ ...p }));
  }
  const lengths = [0];
  for (let i = 1; i < source.length; i++) {
    lengths.push(lengths[i - 1] + distance(source[i - 1], source[i]));
  }
  const total = lengths.at(-1);
  if (total < 1e-6) return target.map((p, i) => ({
    ...p,
    pressure: source[Math.min(i, source.length - 1)]?.pressure ?? 0.5,
    time: source[Math.min(i, source.length - 1)]?.time ?? 0
  }));

  return target.map((p, index) => {
    const wanted = total * (target.length <= 1 ? 0 : index / (target.length - 1));
    let right = lengths.findIndex(v => v >= wanted);
    if (right < 1) right = 1;
    if (right < 0) right = source.length - 1;
    const left = right - 1;
    const t = clamp((wanted - lengths[left]) / Math.max(1e-6, lengths[right] - lengths[left]), 0, 1);
    const a = source[left], b = source[right];
    const pa = Number.isFinite(a.pressure) ? a.pressure : 0.5;
    const pb = Number.isFinite(b.pressure) ? b.pressure : 0.5;
    const ta = Number.isFinite(a.time) ? a.time : 0;
    const tb = Number.isFinite(b.time) ? b.time : ta;
    return { ...p, pressure: pa + (pb - pa) * t, time: ta + (tb - ta) * t };
  });
}

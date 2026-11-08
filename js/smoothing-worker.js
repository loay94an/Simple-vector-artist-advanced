// One Euro smoothing worker. Keeps endpoints and pressure samples intact.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * Math.max(0.0001, cutoff));
  return 1 / (1 + tau / Math.max(0.0001, dt));
}

function filterAxis(points, key, minCutoff, beta, derivativeCutoff) {
  if (points.length < 3) return points.map(point => point[key]);
  const values = points.map(point => Number(point[key]) || 0);
  const times = points.map((point, index) =>
    Number.isFinite(point.time) ? point.time : index * 8
  );
  const output = values.slice();
  let previous = values[0];
  let previousDerivative = 0;

  for (let i = 1; i < values.length - 1; i++) {
    const dt = Math.max(1, times[i] - times[i - 1]);
    const derivative = (values[i] - previous) / dt;
    const derivativeAlpha = alpha(derivativeCutoff, dt);
    const filteredDerivative =
      derivativeAlpha * derivative +
      (1 - derivativeAlpha) * previousDerivative;
    const cutoff = minCutoff + beta * Math.abs(filteredDerivative);
    const valueAlpha = alpha(cutoff, dt);
    const filtered = valueAlpha * values[i] +
      (1 - valueAlpha) * previous;

    output[i] = filtered;
    previous = filtered;
    previousDerivative = filteredDerivative;
  }

  output[0] = values[0];
  output[output.length - 1] = values[values.length - 1];
  return output;
}

self.onmessage = event => {
  const { id, points, strength = 0.35 } = event.data || {};
  if (!Array.isArray(points)) {
    self.postMessage({ id, error: "invalid-points" });
    return;
  }

  const level = clamp(Number(strength) || 0, 0, 1);
  const minCutoff = 1.15 - level * 0.55;
  const beta = 0.002 + level * 0.018;
  const xs = filterAxis(points, "x", minCutoff, beta, 1);
  const ys = filterAxis(points, "y", minCutoff, beta, 1);

  const filtered = points.map((point, index) => ({
    ...point,
    x: xs[index],
    y: ys[index]
  }));

  self.postMessage({ id, points: filtered });
};

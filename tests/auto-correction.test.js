import test from "node:test";
import assert from "node:assert/strict";
import { correctStrokePoints, transferStrokeAttributes } from "../js/auto-correction.js";

function noisyLine(count = 61, noise = 3) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 4, y: 40 + Math.sin(i * 2.3) * noise,
    pressure: 0.2 + i / count * 0.7, time: i * 12
  }));
}
function totalDeviation(a, b) {
  return a.reduce((sum, p, i) => sum + Math.hypot(p.x - b[i].x, p.y - b[i].y), 0);
}
function roughness(points) {
  return points.slice(1, -1).reduce((sum, p, i) => {
    const a = points[i], b = points[i + 2];
    return sum + Math.abs(p.y - (a.y + b.y) / 2);
  }, 0);
}

test("correction keeps endpoints and sample count", () => {
  const source = noisyLine();
  const result = correctStrokePoints(source, 70);
  assert.equal(result.length, source.length);
  assert.deepEqual(result[0], source[0]);
  assert.deepEqual(result.at(-1), source.at(-1));
});

test("correction reduces hand tremor", () => {
  const source = noisyLine();
  const corrected = correctStrokePoints(source, 80);
  assert.ok(roughness(corrected) < roughness(source));
});

test("higher slider strength produces much stronger correction", () => {
  const source = noisyLine(81, 5);
  const mild = correctStrokePoints(source, 20);
  const strong = correctStrokePoints(source, 100);
  assert.ok(totalDeviation(strong, source) > totalDeviation(mild, source) * 2);
  assert.ok(roughness(strong) < roughness(mild));
});

test("maximum strength can soften a deliberate corner", () => {
  const source = [];
  for (let i = 0; i <= 20; i++) source.push({ x: i * 5, y: 30, pressure: 0.6, time: i * 10 });
  for (let i = 1; i <= 20; i++) source.push({ x: 100, y: 30 + i * 5, pressure: 0.6, time: (20 + i) * 10 });
  const corrected = correctStrokePoints(source, 100);
  assert.ok(Math.hypot(corrected[20].x - source[20].x, corrected[20].y - source[20].y) > 0.1);
});

test("pressure and timestamps are preserved on same-sample correction", () => {
  const source = noisyLine();
  const corrected = correctStrokePoints(source, 65);
  for (let i = 0; i < source.length; i++) {
    assert.equal(corrected[i].pressure, source[i].pressure);
    assert.equal(corrected[i].time, source[i].time);
  }
});

test("geometry attribute transfer interpolates pressure and time", () => {
  const source = [
    { x: 0, y: 0, pressure: 0.2, time: 0 },
    { x: 10, y: 0, pressure: 0.8, time: 100 }
  ];
  const result = transferStrokeAttributes(source, [
    { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }
  ]);
  assert.deepEqual(result.map(p => p.pressure), [0.2, 0.5, 0.8]);
  assert.deepEqual(result.map(p => p.time), [0, 50, 100]);
});

test("zero strength returns a non-mutating copy", () => {
  const source = noisyLine(10, 1);
  const result = correctStrokePoints(source, 0);
  assert.deepEqual(result, source);
  assert.notEqual(result[0], source[0]);
});

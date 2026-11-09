import test from "node:test";
import assert from "node:assert/strict";
import { correctStrokePoints, transferStrokeAttributes } from "../js/auto-correction.js";

function line(count = 41, noise = 2) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 4,
    y: 40 + Math.sin(i * 2.3) * noise,
    pressure: 0.2 + i / count * 0.7,
    time: i * 12
  }));
}

test("correction keeps endpoints and sample count", () => {
  const source = line();
  const result = correctStrokePoints(source, 70);
  assert.equal(result.length, source.length);
  assert.deepEqual(result[0], source[0]);
  assert.deepEqual(result.at(-1), source.at(-1));
});

test("correction reduces small hand tremor", () => {
  const source = line(61, 2.4);
  const corrected = correctStrokePoints(source, 80);
  const roughness = points => points.slice(2, -2).reduce((sum, p, i) => {
    const before = points[i + 1], after = points[i + 3];
    return sum + Math.abs(p.y - (before.y + after.y) / 2);
  }, 0);
  assert.ok(roughness(corrected) < roughness(source));
});

test("correction protects a deliberate sharp corner", () => {
  const source = [];
  for (let i = 0; i <= 20; i++) source.push({ x: i * 5, y: 30, pressure: 0.6, time: i * 10 });
  for (let i = 1; i <= 20; i++) source.push({ x: 100, y: 30 + i * 5, pressure: 0.6, time: (20 + i) * 10 });
  const corrected = correctStrokePoints(source, 100);
  assert.deepEqual(corrected[20], source[20]);
});

test("correction preserves pressure and timestamp samples", () => {
  const source = line();
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
  const target = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
  const result = transferStrokeAttributes(source, target);
  assert.deepEqual(result.map(p => p.pressure), [0.2, 0.5, 0.8]);
  assert.deepEqual(result.map(p => p.time), [0, 50, 100]);
});

test("zero strength is a non-mutating copy", () => {
  const source = line(10, 1);
  const result = correctStrokePoints(source, 0);
  assert.deepEqual(result, source);
  assert.notEqual(result[0], source[0]);
});

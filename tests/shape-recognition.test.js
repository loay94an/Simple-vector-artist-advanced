import test from "node:test";
import assert from "node:assert/strict";
import { recognizeShape } from "../js/shape-recognition.js";

function jitter(value, seed) {
  return value + Math.sin(seed * 2.17) * 0.65 + Math.cos(seed * 0.73) * 0.25;
}

function circle(cx, cy, rx, ry, count = 120) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = Math.PI * 2 * i / count;
    return {
      x: jitter(cx + Math.cos(angle) * rx, i),
      y: jitter(cy + Math.sin(angle) * ry, i + 31),
      pressure: 0.35 + (i % 7) * 0.04,
      time: i * 8
    };
  });
}

function polygon(vertices, samplesPerEdge = 24) {
  const points = [];
  for (let edge = 0; edge < vertices.length; edge++) {
    const a = vertices[edge], b = vertices[(edge + 1) % vertices.length];
    for (let i = 0; i < samplesPerEdge; i++) {
      const t = i / samplesPerEdge;
      const seed = edge * samplesPerEdge + i;
      points.push({
        x: jitter(a.x + (b.x - a.x) * t, seed),
        y: jitter(a.y + (b.y - a.y) * t, seed + 13),
        pressure: 0.6,
        time: seed * 5
      });
    }
  }
  points.push({ ...points[0], time: points.length * 5 });
  return points;
}

test("recognizes a hand-drawn circle", () => {
  const result = recognizeShape(circle(120, 110, 55, 53));
  assert.equal(result?.type, "circle");
  assert.ok(result.confidence >= 0.72);
  assert.ok(result.points.length >= 70);
});

test("recognizes an ellipse without forcing it into a circle", () => {
  const result = recognizeShape(circle(120, 110, 80, 42));
  assert.equal(result?.type, "ellipse");
});

test("recognizes a rotated rectangular polygon and its corners", () => {
  const result = recognizeShape(polygon([
    { x: 40, y: 60 }, { x: 150, y: 35 },
    { x: 175, y: 125 }, { x: 65, y: 150 }
  ]));
  assert.ok(["rectangle", "parallelogram"].includes(result?.type));
  assert.equal(result.corners.length, 4);
  assert.equal(result.angles.length, 4);
});

test("recognizes a triangle", () => {
  const result = recognizeShape(polygon([
    { x: 45, y: 145 }, { x: 110, y: 35 }, { x: 180, y: 145 }
  ]));
  assert.equal(result?.type, "triangle");
  assert.equal(result.corners.length, 3);
});

test("recognizes a straight line", () => {
  const points = Array.from({ length: 50 }, (_, i) => ({
    x: i * 3,
    y: 30 + Math.sin(i * 0.7) * 0.25,
    pressure: 0.5,
    time: i * 10
  }));
  assert.equal(recognizeShape(points)?.type, "line");
});

test("recognizes a circular arc", () => {
  const points = Array.from({ length: 70 }, (_, i) => {
    const angle = -Math.PI * 0.8 + Math.PI * 0.55 * i / 69;
    return {
      x: 100 + Math.cos(angle) * 65 + Math.sin(i * 1.9) * 0.2,
      y: 100 + Math.sin(angle) * 65 + Math.cos(i * 1.3) * 0.2,
      pressure: 0.5,
      time: i * 10
    };
  });
  assert.equal(recognizeShape(points)?.type, "arc");
});

test("leaves a freeform S curve unforced into geometry", () => {
  const points = Array.from({ length: 100 }, (_, i) => {
    const t = i / 99;
    return {
      x: 20 + t * 180,
      y: 100 + Math.sin(t * Math.PI * 2) * 38,
      pressure: 0.5,
      time: i * 8
    };
  });
  assert.equal(recognizeShape(points), null);
});

test("detects a deliberate corner in an open polyline", () => {
  const points = [];
  for (let i = 0; i <= 40; i++) points.push({ x: 20 + i * 3, y: 30 + Math.sin(i * 0.8) * 0.2, pressure: 0.5, time: i * 8 });
  for (let i = 1; i <= 40; i++) points.push({ x: 140 + Math.sin(i * 0.8) * 0.2, y: 30 + i * 3, pressure: 0.5, time: (40 + i) * 8 });
  const result = recognizeShape(points);
  assert.equal(result?.type, "polyline");
  assert.ok(result.corners.length >= 1);
  assert.ok(result.angles.some(angle => Math.abs(angle - 90) < 20));
});

test("recognizes a rotated ellipse and preserves its orientation", () => {
  const angle = Math.PI / 5;
  const points = Array.from({ length: 121 }, (_, i) => {
    const theta = Math.PI * 2 * i / 120;
    const x = Math.cos(theta) * 82;
    const y = Math.sin(theta) * 34;
    return {
      x: 140 + x * Math.cos(angle) - y * Math.sin(angle),
      y: 110 + x * Math.sin(angle) + y * Math.cos(angle),
      pressure: 0.5,
      time: i * 8
    };
  });
  const result = recognizeShape(points);
  assert.equal(result?.type, "ellipse");
  assert.ok(Math.abs(result.rotation - angle) < 0.08);
  assert.ok(result.points.length >= 90);
});

import test from "node:test";
import assert from "node:assert/strict";
import { recognizeShape, SHAPE_CLASSIFICATIONS } from "../js/shape-recognition.js";

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


function openStroke(vertices, samplesPerEdge = 24) {
  const points = [];
  for (let edge = 0; edge < vertices.length - 1; edge++) {
    const a = vertices[edge], b = vertices[edge + 1];
    for (let i = 0; i < samplesPerEdge; i++) {
      const t = i / samplesPerEdge;
      const seed = edge * samplesPerEdge + i;
      points.push({ x: jitter(a.x + (b.x - a.x) * t, seed),
        y: jitter(a.y + (b.y - a.y) * t, seed + 13),
        pressure: 0.5, time: seed * 5 });
    }
  }
  points.push({ ...vertices.at(-1), pressure: 0.5, time: points.length * 5 });
  return points;
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
  assert.ok(["rectangle", "parallelogram"].includes(result?.type), `unexpected recognition: ${JSON.stringify({ type: result?.type, corners: result?.corners?.length, confidence: result?.confidence })}`);
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


test("distinguishes a square from a rectangle", () => {
  const square = recognizeShape(polygon([
    { x: 40, y: 40 }, { x: 140, y: 40 },
    { x: 140, y: 140 }, { x: 40, y: 140 }
  ]));
  const rectangle = recognizeShape(polygon([
    { x: 30, y: 55 }, { x: 190, y: 55 },
    { x: 190, y: 125 }, { x: 30, y: 125 }
  ]));
  assert.equal(square?.type, "square");
  assert.equal(rectangle?.type, "rectangle");
});

test("recognizes a smooth open curve", () => {
  const points = Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    return { x: 20 + t * 180, y: 140 - Math.sin(t * Math.PI) * 65,
      pressure: 0.5, time: i * 8 };
  });
  const result = recognizeShape(points);
  assert.ok(["curve", "arc"].includes(result?.type), `unexpected curve type: ${result?.type}`);
});

test("distinguishes a zigzag from an ordinary broken line", () => {
  const zigzagVertices = [
    { x: 20, y: 100 }, { x: 55, y: 35 }, { x: 90, y: 100 },
    { x: 125, y: 35 }, { x: 160, y: 100 }, { x: 195, y: 35 }
  ];
  const brokenVertices = [
    { x: 20, y: 120 }, { x: 75, y: 45 }, { x: 125, y: 80 },
    { x: 180, y: 25 }
  ];
  assert.equal(recognizeShape(openStroke(zigzagVertices))?.type, "zigzag");
  assert.equal(recognizeShape(openStroke(brokenVertices))?.type, "polyline");
});


test("preserves the original 62 classifications and adds 500 spiral plus 500 special-open variants", () => {
  assert.equal(SHAPE_CLASSIFICATIONS.length, 1062);
  assert.equal(new Set(SHAPE_CLASSIFICATIONS).size, 1062);
  assert.equal(SHAPE_CLASSIFICATIONS.filter(x => x.startsWith("spiral-")).length, 500);
  assert.equal(SHAPE_CLASSIFICATIONS.filter(x => x.startsWith("open-")).length, 500);
  assert.equal(SHAPE_CLASSIFICATIONS.some(x => x.startsWith("closed-")), false);
});

test("adds triangle subtype classifications without changing renderer base type", () => {
  const result=recognizeShape(polygon([
    {x:40,y:140},{x:110,y:20},{x:180,y:140}
  ]));
  assert.equal(result?.type,"triangle");
  assert.ok(result.classifications.some(x=>x.startsWith("triangle-")));
});

test("classifies right and isosceles triangle properties", () => {
  const result=recognizeShape(polygon([
    {x:40,y:140},{x:40,y:40},{x:140,y:140}
  ]));
  assert.equal(result?.type,"triangle");
  assert.ok(result.classifications.includes("triangle-right"));
  assert.ok(result.classifications.includes("triangle-isosceles"));
});

test("returns multiple semantic labels for triangle geometry", () => {
  const result=recognizeShape(polygon([
    {x:40,y:140},{x:40,y:40},{x:140,y:140}
  ]));
  assert.ok(result?.classifications.includes("triangle-right"));
  assert.ok(result?.classifications.includes("triangle-isosceles"));
});


test("assigns a special-open-path variant to a recognized angular stroke", () => {
  const open = recognizeShape(openStroke([
    { x: 20, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 130 }
  ]));
  assert.ok(open?.variantClassification?.startsWith("open-"));
  assert.ok(SHAPE_CLASSIFICATIONS.includes(open.variantClassification));
});

test("recognizes a multi-turn outward spiral as an open spiral", () => {
  const points = Array.from({ length: 240 }, (_, i) => {
    const t = i / 239;
    const angle = t * Math.PI * 5;
    const radius = 12 + t * 48;
    return {
      x: 130 + Math.cos(angle) * radius,
      y: 120 + Math.sin(angle) * radius,
      pressure: 0.5,
      time: i * 8
    };
  });
  const result = recognizeShape(points);
  assert.equal(result?.type, "spiral");
  assert.ok(result?.variantClassification?.startsWith("spiral-"));
  assert.ok(SHAPE_CLASSIFICATIONS.includes(result.variantClassification));
});

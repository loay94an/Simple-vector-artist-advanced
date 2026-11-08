import test from "node:test";
import assert from "node:assert/strict";
import { recognizeShape } from "../js/shape-recognition.js";

function samplePolyline(vertices, steps = 8, close = false) {
  const points = [];
  const path = close ? [...vertices, vertices[0]] : vertices;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  points.push(path[path.length - 1]);
  return points;
}

test("recognizes a straight line", () => {
  assert.equal(recognizeShape(samplePolyline([{x:0,y:0},{x:100,y:30}])), "line");
});

test("recognizes a triangle", () => {
  assert.equal(recognizeShape(samplePolyline([{x:50,y:0},{x:100,y:90},{x:0,y:90}], 10, true)), "triangle");
});

test("recognizes a rectangle and square", () => {
  assert.equal(recognizeShape(samplePolyline([{x:0,y:0},{x:120,y:0},{x:120,y:70},{x:0,y:70}], 10, true)), "rect");
  assert.equal(recognizeShape(samplePolyline([{x:0,y:0},{x:90,y:0},{x:90,y:90},{x:0,y:90}], 10, true)), "square");
});

test("recognizes a diamond", () => {
  assert.equal(recognizeShape(samplePolyline([{x:50,y:0},{x:100,y:50},{x:50,y:100},{x:0,y:50}], 10, true)), "diamond");
});

test("recognizes circle and ellipse gestures", () => {
  const ellipse = (rx, ry) => Array.from({length:65}, (_,i) => {
    const a = (i / 64) * Math.PI * 2;
    return {x:100 + Math.cos(a)*rx, y:100 + Math.sin(a)*ry};
  });
  assert.equal(recognizeShape(ellipse(50,50)), "circle");
  assert.equal(recognizeShape(ellipse(80,35)), "ellipse");
});

test("rejects tiny and ambiguous gestures", () => {
  assert.equal(recognizeShape([{x:0,y:0},{x:1,y:1}]), null);
  assert.equal(recognizeShape([{x:0,y:0},{x:30,y:10},{x:20,y:30}]), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { closeBoundaryMask, floodRegion, traceRegionContours, contoursToPath } from "../js/bucket-fill.js";

test("fills a bounded interior without crossing its boundary", () => {
  const w = 7, h = 7, boundary = new Uint8Array(w*h);
  for (let x=1;x<=5;x++) { boundary[1*w+x]=1; boundary[5*w+x]=1; }
  for (let y=1;y<=5;y++) { boundary[y*w+1]=1; boundary[y*w+5]=1; }
  const result = floodRegion(boundary,w,h,3,3);
  assert.ok(result);
  assert.equal(result.size,9);
  assert.equal(result.touchesEdge,false);
});

test("rejects a seed in the outside region", () => {
  const boundary = new Uint8Array(25);
  for (let x=1;x<=3;x++) { boundary[1*5+x]=1; boundary[3*5+x]=1; }
  for (let y=1;y<=3;y++) { boundary[y*5+1]=1; boundary[y*5+3]=1; }
  assert.equal(floodRegion(boundary,5,5,0,0),null);
});

test("close-gap expands boundary without mutating the source", () => {
  const source = new Uint8Array([0,1,0,0,0]);
  const closed = closeBoundaryMask(source,5,1,1);
  assert.equal(source[0],0);
  assert.equal(closed[0],1);
  assert.equal(closed[2],1);
});

test("traces compact closed contours and emits SVG path data", () => {
  const mask = new Uint8Array(16);
  mask[5]=mask[6]=mask[9]=mask[10]=1;
  const contours = traceRegionContours(mask,4,4);
  assert.equal(contours.length,1);
  assert.equal(contours[0].length,4);
  const path = contoursToPath(contours);
  assert.match(path,/^M/);
  assert.match(path,/Z$/);
});

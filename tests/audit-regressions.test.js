import test from "node:test";
import assert from "node:assert/strict";
import { DrawingDocument } from "../js/core.js";
import { Selector } from "../js/tools.js";
import { LayerPanel } from "../js/ui.js";

function makeSelector(element) {
  const layer = {
    id: "layer-1",
    locked: false,
    visible: true,
    elements: [element]
  };
  const engine = {
    activeLayer: layer,
    document: { touch() {} },
    getWorldPoint: point => ({
      x: point.clientX,
      y: point.clientY
    }),
    buildPath: points => points.map(p => `${p.x},${p.y}`).join(" "),
    renderer: {
      renderActiveLayer() {},
      render() {}
    }
  };
  const selector = new Selector(engine, null);
  selector.selectedIds.add(element.id);
  selector.renderOverlay = () => {};
  selector.emitChange = () => {};
  return { selector, layer, engine };
}

test("cancel rolls back a partially dragged selection", () => {
  const original = {
    id: "stroke-1",
    type: "stroke",
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    path: "original-path",
    style: { color: "#123456", size: 4 },
    transform: "rotate(5)"
  };
  const { selector, layer } = makeSelector(structuredClone(original));

  selector.snapshotElements();
  selector.pointerDown = true;
  selector.dragMode = "move";
  selector.startPoint = { x: 10, y: 10 };

  assert.equal(selector.move({ clientX: 40, clientY: 50 }), true);
  assert.notDeepEqual(layer.elements[0].points, original.points);

  selector.cancel();

  assert.deepEqual(layer.elements[0], original);
  assert.equal(selector.pointerDown, false);
  assert.equal(selector.moved, false);
});

test("cancel rolls back an interrupted two-finger selection transform", () => {
  const original = {
    id: "shape-1",
    type: "shape",
    geometry: { x: 10, y: 10, width: 40, height: 30 },
    transform: "rotate(12 20 20)"
  };
  const { selector, layer } = makeSelector(structuredClone(original));

  assert.equal(selector.beginMultiTouch([
    { clientX: 0, clientY: 0 },
    { clientX: 20, clientY: 0 }
  ]), true);

  assert.equal(selector.updateMultiTouch([
    { clientX: 0, clientY: 0 },
    { clientX: 40, clientY: 0 }
  ]), true);
  assert.notEqual(layer.elements[0].transform, original.transform);

  selector.cancel();

  assert.equal(layer.elements[0].transform, original.transform);
  assert.equal(selector.multiTouchSnapshot, null);
});

test("layer panel add and remove changes are committed and autosaved", () => {
  const document = new DrawingDocument();
  let commits = 0;
  let saves = 0;
  const panel = Object.create(LayerPanel.prototype);

  Object.assign(panel, {
    document,
    history: { commit() { commits += 1; } },
    renderer: { render() {} },
    onChange() { saves += 1; },
    refresh() {}
  });

  const added = panel.add("اختبار");
  assert.ok(added);
  assert.equal(document.layers.length, 2);
  assert.equal(commits, 1);
  assert.equal(saves, 1);

  assert.equal(panel.remove(added.id), true);
  assert.equal(document.layers.length, 1);
  assert.equal(commits, 2);
  assert.equal(saves, 2);
});

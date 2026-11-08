
/* =========================================================
   RASEM 2.0
   js/layers-history.js

   Layer
   LayerManager
   Commands
   HistoryManager
   ========================================================= */

// =========================================================
// UTILITIES
// =========================================================

function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36).slice(2)}`;
}

function cloneData(value) {
  return structuredClone(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// =========================================================
// LAYER
// =========================================================

export class Layer {
  constructor(options = {}) {
    this.id = options.id || createId("layer");

    this.name = String(
      options.name || "طبقة جديدة"
    );

    this.visible = options.visible !== false;

    this.locked = options.locked === true;

    this.opacity = clamp(
      Number.isFinite(options.opacity)
        ? options.opacity
        : 1,
      0,
      1
    );

    this.elements = Array.isArray(options.elements)
      ? cloneData(options.elements)
      : [];
  }

  setName(name) {
    this.name = String(name || "طبقة");
    return true;
  }

  setVisibility(value) {
    this.visible = Boolean(value);
    return true;
  }

  setLocked(value) {
    this.locked = Boolean(value);
    return true;
  }

  setOpacity(value) {
    const opacity = Number(value);

    if (!Number.isFinite(opacity)) {
      return false;
    }

    this.opacity = clamp(opacity, 0, 1);
    return true;
  }

  addElement(element) {
    if (
      this.locked ||
      !this.visible ||
      !element ||
      typeof element !== "object"
    ) {
      return false;
    }

    const item = cloneData(element);

    item.id = item.id || createId("element");

    if (this.elements.some(
      existing => existing.id === item.id
    )) {
      return false;
    }

    this.elements.push(item);
    return true;
  }

  removeElement(id) {
    if (this.locked) return false;

    const index = this.elements.findIndex(
      item => item.id === id
    );

    if (index === -1) return false;

    this.elements.splice(index, 1);
    return true;
  }

  clear() {
    if (this.locked || !this.elements.length) {
      return false;
    }

    this.elements = [];
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      locked: this.locked,
      opacity: this.opacity,
      elements: cloneData(this.elements)
    };
  }
}

// =========================================================
// LAYER MANAGER
// =========================================================

export class LayerManager {
  constructor(documentModel, renderer = null, history = null) {
    if (!documentModel) {
      throw new TypeError(
        "LayerManager requires a document model"
      );
    }

    this.document = documentModel;
    this.renderer = renderer;
    this.history = history;

    this.destroyed = false;
  }

  get layers() {
    return this.document.layers;
  }

  get activeLayer() {
    return this.document.activeLayer;
  }

  get activeLayerId() {
    return this.document.activeLayerId;
  }

  canEdit(layer = this.activeLayer) {
    return Boolean(
      !this.destroyed &&
      layer &&
      !layer.locked &&
      layer.visible
    );
  }

  notify() {
    this.document.touch?.();
    this.renderer?.render?.(this.document);
  }

  commit() {
    this.history?.commit?.();
  }

  add(name = "طبقة جديدة") {
    if (this.destroyed) return null;

    const layer = this.document.addLayer(name);

    if (!layer) return null;

    this.commit();
    this.notify();

    return layer;
  }

  remove(id = this.activeLayerId) {
    if (this.destroyed || !id) return false;

    if (this.layers.length <= 1) return false;

    const layer = this.layers.find(
      item => item.id === id
    );

    if (!layer || layer.locked) return false;

    const removed = this.document.removeLayer(id);

    if (!removed) return false;

    this.commit();
    this.notify();

    return true;
  }

  setActive(id) {
    if (this.destroyed) return false;

    const result = this.document.setActiveLayer(id);

    if (!result) return false;

    this.notify();

    return true;
  }

  rename(id, name) {
    const layer = this.get(id);

    if (!layer || layer.locked) return false;

    layer.name = String(name || "طبقة");

    this.commit();
    this.notify();

    return true;
  }

  get(id) {
    return this.layers.find(
      layer => layer.id === id
    ) || null;
  }

  setVisibility(id, visible) {
    const layer = this.get(id);

    if (!layer) return false;

    if (layer.visible === Boolean(visible)) {
      return false;
    }

    layer.visible = Boolean(visible);

    this.commit();
    this.notify();

    return true;
  }

  toggleVisibility(id) {
    const layer = this.get(id);

    if (!layer) return false;

    return this.setVisibility(id, !layer.visible);
  }

  setLocked(id, locked) {
    const layer = this.get(id);

    if (!layer) return false;

    if (layer.locked === Boolean(locked)) {
      return false;
    }

    layer.locked = Boolean(locked);

    this.commit();
    this.notify();

    return true;
  }

  toggleLocked(id) {
    const layer = this.get(id);

    if (!layer) return false;

    return this.setLocked(id, !layer.locked);
  }

  setOpacity(id, opacity) {
    const layer = this.get(id);

    if (!layer) return false;

    const value = Number(opacity);

    if (!Number.isFinite(value)) return false;

    const next = clamp(value, 0, 1);

    if (layer.opacity === next) return false;

    layer.opacity = next;

    this.commit();
    this.notify();

    return true;
  }

  move(id, targetIndex) {
    if (this.destroyed) return false;

    const index = this.layers.findIndex(
      layer => layer.id === id
    );

    if (index === -1) return false;

    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= this.layers.length
    ) {
      return false;
    }

    if (index === targetIndex) return false;

    const [layer] = this.layers.splice(index, 1);

    this.layers.splice(targetIndex, 0, layer);

    this.commit();
    this.notify();

    return true;
  }

  duplicate(id = this.activeLayerId) {
    const source = this.get(id);

    if (!source || this.destroyed) return null;

    const duplicate = new Layer({
      name: `${source.name} - نسخة`,
      visible: source.visible,
      locked: false,
      opacity: source.opacity,
      elements: source.elements.map(element => ({
        ...cloneData(element),
        id: createId("element")
      }))
    });

    this.layers.push(duplicate);

    this.document.activeLayerId = duplicate.id;

    this.commit();
    this.notify();

    return duplicate;
  }

  clear(id = this.activeLayerId) {
    const layer = this.get(id);

    if (!this.canEdit(layer)) return false;

    if (!layer.elements.length) return false;

    layer.elements = [];

    this.commit();
    this.notify();

    return true;
  }

  destroy() {
    this.destroyed = true;

    this.document = null;
    this.renderer = null;
    this.history = null;
  }
}

// =========================================================
// COMMANDS
// =========================================================

export class Command {
  execute() {
    throw new Error("execute() must be implemented");
  }

  undo() {
    throw new Error("undo() must be implemented");
  }
}

// =========================================================
// ADD ELEMENT COMMAND
// =========================================================

export class AddElementCommand extends Command {
  constructor(documentModel, element, layerId) {
    super();

    this.document = documentModel;
    this.element = cloneData(element);

    this.layerId = layerId ||
      documentModel.activeLayerId;
  }

  execute() {
    return this.document.addElement(
      this.element,
      this.layerId
    );
  }

  undo() {
    const layer = this.document.layers.find(
      item => item.id === this.layerId
    );

    if (!layer) return false;

    const index = layer.elements.findIndex(
      item => item.id === this.element.id
    );

    if (index === -1) return false;

    layer.elements.splice(index, 1);
    this.document.touch();

    return true;
  }
}

// =========================================================
// REMOVE ELEMENT COMMAND
// =========================================================

export class RemoveElementCommand extends Command {
  constructor(documentModel, elementId) {
    super();

    this.document = documentModel;
    this.elementId = elementId;

    this.layerId = null;
    this.element = null;
    this.index = -1;
  }

  execute() {
    for (const layer of this.document.layers) {
      const index = layer.elements.findIndex(
        item => item.id === this.elementId
      );

      if (index === -1) continue;

      if (layer.locked) return false;

      this.layerId = layer.id;
      this.index = index;

      this.element = cloneData(
        layer.elements[index]
      );

      layer.elements.splice(index, 1);

      this.document.touch();

      return true;
    }

    return false;
  }

  undo() {
    const layer = this.document.layers.find(
      item => item.id === this.layerId
    );

    if (!layer || !this.element) return false;

    if (layer.elements.some(
      item => item.id === this.elementId
    )) {
      return false;
    }

    layer.elements.splice(
      clamp(this.index, 0, layer.elements.length),
      0,
      cloneData(this.element)
    );

    this.document.touch();

    return true;
  }
}

// =========================================================
// CLEAR LAYER COMMAND
// =========================================================

export class ClearLayerCommand extends Command {
  constructor(documentModel, layerId) {
    super();

    this.document = documentModel;
    this.layerId = layerId;

    this.previousElements = null;
  }

  execute() {
    const layer = this.document.layers.find(
      item => item.id === this.layerId
    );

    if (!layer || layer.locked) return false;

    if (!layer.elements.length) return false;

    this.previousElements = cloneData(layer.elements);

    layer.elements = [];

    this.document.touch();

    return true;
  }

  undo() {
    const layer = this.document.layers.find(
      item => item.id === this.layerId
    );

    if (!layer || !this.previousElements) return false;

    layer.elements = cloneData(this.previousElements);

    this.document.touch();

    return true;
  }
}

// =========================================================
// UPDATE ELEMENT COMMAND
// =========================================================

export class UpdateElementCommand extends Command {
  constructor(documentModel, elementId, changes) {
    super();

    this.document = documentModel;
    this.elementId = elementId;
    this.changes = cloneData(changes);

    this.previous = null;
    this.layerId = null;
  }

  execute() {
    for (const layer of this.document.layers) {
      const element = layer.elements.find(
        item => item.id === this.elementId
      );

      if (!element) continue;

      if (layer.locked) return false;

      this.layerId = layer.id;
      this.previous = cloneData(element);

      Object.assign(element, cloneData(this.changes));

      this.document.touch();

      return true;
    }

    return false;
  }

  undo() {
    const layer = this.document.layers.find(
      item => item.id === this.layerId
    );

    if (!layer || !this.previous) return false;

    const index = layer.elements.findIndex(
      item => item.id === this.elementId
    );

    if (index === -1) return false;

    layer.elements[index] = cloneData(this.previous);

    this.document.touch();

    return true;
  }
}

// =========================================================
// HISTORY MANAGER
// =========================================================

export class HistoryManager {
  constructor(documentModel, renderer = null, options = {}) {
    if (!documentModel) {
      throw new TypeError("HistoryManager requires a document");
    }

    this.document = documentModel;
    this.renderer = renderer;
    this.limit = Number.isInteger(options.limit)
      ? Math.max(1, options.limit)
      : 100;

    this.undoStack = [];
    this.redoStack = [];
    this.onChange = options.onChange || null;
    this.destroyed = false;

    this.lastSnapshot = this.snapshot();
    this.notify();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  snapshot() {
    return cloneData(this.document.toJSON());
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.layers)) {
      return false;
    }

    this.document.layers = cloneData(snapshot.layers);
    this.document.activeLayerId = snapshot.activeLayerId;
    this.document.camera = cloneData(snapshot.camera);
    this.document.updatedAt = Date.now();

    return true;
  }

  pushUndo(snapshot) {
    this.undoStack.push(cloneData(snapshot));

    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  commit() {
    if (this.destroyed) return false;

    const current = this.snapshot();

    if (
      JSON.stringify(this.lastSnapshot) ===
      JSON.stringify(current)
    ) {
      return false;
    }

    this.pushUndo(this.lastSnapshot);
    this.lastSnapshot = cloneData(current);
    this.redoStack = [];

    this.notify();
    return true;
  }

  execute(command) {
    if (
      this.destroyed ||
      !command ||
      typeof command.execute !== "function" ||
      typeof command.undo !== "function"
    ) {
      return false;
    }

    const before = this.snapshot();

    if (!command.execute()) return false;

    const after = this.snapshot();

    if (
      JSON.stringify(before) === JSON.stringify(after)
    ) {
      return false;
    }

    this.pushUndo(before);
    this.lastSnapshot = cloneData(after);
    this.redoStack = [];

    this.notify();
    return true;
  }

  undo() {
    if (this.destroyed || !this.canUndo) {
      return false;
    }

    const current = this.snapshot();
    const previous = this.undoStack.pop();

    this.redoStack.push(current);

    if (!this.restoreSnapshot(previous)) {
      this.undoStack.push(previous);
      this.redoStack.pop();
      return false;
    }

    this.lastSnapshot = this.snapshot();
    this.render();
    this.notify();

    return true;
  }

  redo() {
    if (this.destroyed || !this.canRedo) {
      return false;
    }

    const next = this.redoStack.pop();
    const current = this.snapshot();

    this.pushUndo(current);

    if (!this.restoreSnapshot(next)) {
      this.undoStack.pop();
      this.redoStack.push(next);
      return false;
    }

    this.lastSnapshot = this.snapshot();
    this.render();
    this.notify();

    return true;
  }

  render() {
    this.renderer?.render?.(this.document);
  }

  reset() {
    if (this.destroyed) return;

    this.undoStack = [];
    this.redoStack = [];
    this.lastSnapshot = this.snapshot();

    this.notify();
  }

  clear() {
    this.reset();
  }

  notify() {
    if (typeof this.onChange === "function") {
      this.onChange({
        canUndo: this.canUndo,
        canRedo: this.canRedo,
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length
      });
    }
  }

  destroy() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastSnapshot = null;
    this.document = null;
    this.renderer = null;
    this.onChange = null;
    this.destroyed = true;
  }
}

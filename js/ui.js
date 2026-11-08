
/* =========================================================
   RASEM 2.0
   js/ui.js

   UI Components:
   - Toolbar
   - ColorPicker
   - BrushSettings
   - LayerPanel
   - SelectionPanel
   - Gallery
   - UIManager
========================================================= */

const DEFAULT_COLOR = "#111111";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getElement(id) {
  return document.getElementById(id);
}

function emit(element, name, detail = {}) {
  if (!element) return;

  element.dispatchEvent(
    new CustomEvent(name, {
      bubbles: true,
      detail
    })
  );
}

// =========================================================
// TOOLBAR
// =========================================================

export class Toolbar {
  constructor(toolManager, history, storage, options = {}) {
    this.tools = toolManager;
    this.history = history;
    this.storage = storage;

    this.root = options.root || document;
    this.buttons = new Map();

    this.destroyed = false;

    this.onClick = this.onClick.bind(this);

    this.bind();
  }

  bind() {
    this.root.addEventListener(
      "click",
      this.onClick
    );

    this.refresh();
  }

  onClick(event) {
    const button = event.target.closest("[data-tool]");

    if (!button || !this.root.contains(button)) {
      return;
    }

    const tool = button.dataset.tool;

    if (!tool || !this.tools) return;

    if (this.tools.activate(tool) !== false) {
      this.refresh(tool);
    }
  }

  refresh(activeTool = null) {
    const current =
      activeTool ||
      this.tools?.activeToolName ||
      this.tools?.activeTool?.name ||
      this.tools?.currentTool;

    for (const button of this.root.querySelectorAll("[data-tool]")) {
      const active = button.dataset.tool === current;

      button.classList.toggle("active", active);
      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    }
  }

  setTool(tool) {
    if (!this.tools || typeof tool !== "string") {
      return false;
    }

    const result = this.tools.activate(tool);

    if (result !== false) {
      this.refresh(tool);
      return true;
    }

    return false;
  }

  destroy() {
    if (this.destroyed) return;

    this.root.removeEventListener(
      "click",
      this.onClick
    );

    this.buttons.clear();
    this.destroyed = true;
  }
}

// =========================================================
// COLOR PICKER
// =========================================================

export class ColorPicker {
  constructor(engine, options = {}) {
    this.engine = engine;

    this.input =
      options.input ||
      getElement(options.inputId || "colorPicker");

    this.preview =
      options.preview ||
      getElement(options.previewId || "colorPreview");

    this.value = DEFAULT_COLOR;
    this.destroyed = false;

    this.onChange = this.onChange.bind(this);

    if (this.input) {
      this.input.addEventListener(
        "input",
        this.onChange
      );
    }

    this.setColor(
      this.input?.value || DEFAULT_COLOR
    );
  }

  onChange(event) {
    this.setColor(event.target.value);
  }

  setColor(color) {
    if (
      typeof color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color)
    ) {
      return false;
    }

    this.value = color;

    if (this.input) {
      this.input.value = color;
    }

    if (this.preview) {
      this.preview.style.backgroundColor = color;
    }

    this.engine?.setSettings({
      color
    });

    emit(this.input, "rasem:colorchange", {
      color
    });

    return true;
  }

  getColor() {
    return this.value;
  }

  destroy() {
    if (this.destroyed) return;

    this.input?.removeEventListener(
      "input",
      this.onChange
    );

    this.engine = null;
    this.destroyed = true;
  }
}

// =========================================================
// BRUSH SETTINGS
// =========================================================

export class BrushSettings {
  constructor(engine, options = {}) {
    this.engine = engine;

    this.root = options.root || document;

    this.settings = {
      size: 5,
      opacity: 1,
      smoothing: 0.35,
      minDistance: 0.08,
      pressureEnabled: true,
      sensitivity: 0.8
    };

    this.destroyed = false;

    this.onInput = this.onInput.bind(this);
    this.onChange = this.onChange.bind(this);

    this.root.addEventListener(
      "input",
      this.onInput
    );

    this.root.addEventListener(
      "change",
      this.onChange
    );

    this.refresh();
  }

  getControls() {
    return {
      size: this.root.querySelector('[data-setting="size"]'),
      opacity: this.root.querySelector('[data-setting="opacity"]'),
      smoothing: this.root.querySelector('[data-setting="smoothing"]'),
      minDistance: this.root.querySelector('[data-setting="minDistance"]'),
      pressureEnabled: this.root.querySelector('[data-setting="pressureEnabled"]'),
      sensitivity: this.root.querySelector('[data-setting="sensitivity"]')
    };
  }

  readSettings() {
    const controls = this.getControls();

    if (controls.size) {
      this.settings.size = clamp(
        validNumber(controls.size.value, 3),
        0.1,
        500
      );
    }

    if (controls.opacity) {
      this.settings.opacity = clamp(
        validNumber(controls.opacity.value, 1),
        0,
        1
      );
    }

    if (controls.smoothing) {
      this.settings.smoothing = clamp(
        validNumber(controls.smoothing.value, 0.5),
        0,
        1
      );
    }

    if (controls.minDistance) {
      this.settings.minDistance = clamp(
        validNumber(controls.minDistance.value, 0.08),
        0,
        10
      );
    }

    if (controls.pressureEnabled) {
      this.settings.pressureEnabled =
        controls.pressureEnabled.checked;
    }

    if (controls.sensitivity) {
      this.settings.sensitivity = clamp(
        validNumber(controls.sensitivity.value, 0.8),
        0,
        1
      );
    }

    return { ...this.settings };
  }

  onInput() {
    this.apply();
  }

  onChange() {
    this.apply();
  }

  apply() {
    if (!this.engine) return false;

    const settings = this.readSettings();

    this.engine.setSettings({
      size: settings.size,
      opacity: settings.opacity,
      smoothing: settings.smoothing,
      minDistance: settings.minDistance,
      pressureEnabled: settings.pressureEnabled
    });

    const sizeOutput = this.root.querySelector("#brushSizeValue");
    const opacityOutput = this.root.querySelector("#brushOpacityValue");

    if (sizeOutput) {
      sizeOutput.value = String(settings.size);
      sizeOutput.textContent = String(settings.size);
    }

    if (opacityOutput) {
      const percentage = Math.round(settings.opacity * 100) + "%";
      opacityOutput.value = percentage;
      opacityOutput.textContent = percentage;
    }

    emit(this.root, "rasem:brushchange", {
      settings
    });

    return true;
  }

  setSettings(settings = {}) {
    for (const [key, value] of Object.entries(settings)) {
      if (!(key in this.settings)) continue;

      if (typeof value === "boolean") {
        this.settings[key] = value;
      } else if (Number.isFinite(value)) {
        this.settings[key] = value;
      }
    }

    const controls = this.getControls();

    for (const [key, control] of Object.entries(controls)) {
      if (!control) continue;

      if (control.type === "checkbox") {
        control.checked = this.settings[key];
      } else {
        control.value = String(this.settings[key]);
      }
    }

    return this.apply();
  }

  refresh() {
    const controls = this.getControls();

    for (const [key, control] of Object.entries(controls)) {
      if (!control) continue;

      if (control.type === "checkbox") {
        control.checked = this.settings[key];
      } else {
        control.value = String(this.settings[key]);
      }
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.root.removeEventListener(
      "input",
      this.onInput
    );

    this.root.removeEventListener(
      "change",
      this.onChange
    );

    this.engine = null;
    this.destroyed = true;
  }
}

// =========================================================
// LAYER PANEL
// =========================================================

export class LayerPanel {
  constructor(documentModel, history, renderer, options = {}) {
    this.document = documentModel;
    this.history = history;
    this.renderer = renderer;

    this.root =
      options.root ||
      getElement(options.rootId || "layerList");

    this.destroyed = false;
    this.onChange = options.onChange || null;

    this.onClick = this.onClick.bind(this);

    this.root?.addEventListener(
      "click",
      this.onClick
    );

    this.refresh();
  }

  commitChange() {
    this.history?.commit?.();
    this.onChange?.();
  }

  get layers() {
    return this.document?.layers || [];
  }

  refresh() {
    if (!this.root || !this.document) return;

    const fragment = document.createDocumentFragment();

    const badge = document.getElementById("layersCountBadge");
    if (badge) {
      badge.textContent = String(this.layers.length);
    }

    this.layers.forEach((layer, index) => {
      const item = document.createElement("div");
      item.className = "layer-item";
      item.dataset.layerId = layer.id;

      if (layer.id === this.document.activeLayerId) {
        item.classList.add("active");
      }

      const infoRow = document.createElement("div");
      infoRow.className = "layer-info-row";

      const select = document.createElement("button");
      select.type = "button";
      select.dataset.action = "select";
      select.textContent = layer.name;
      select.className = "layer-name";
      select.title = "انقر لتفعيل الطبقة، نقرتين لإعادة التسمية";
      select.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const newName = prompt("أدخل اسم الطبقة الجديد:", layer.name);
        if (newName && newName.trim()) {
          this.document.updateLayer(layer.id, { name: newName.trim() });
          this.commitChange();
          this.refresh();
        }
      });

      const controls = document.createElement("div");
      controls.className = "layer-controls";

      // Move Up
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.dataset.action = "move-up";
      upBtn.innerHTML = "▲";
      upBtn.title = "رفع الطبقة";
      upBtn.disabled = index === 0;

      // Move Down
      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.dataset.action = "move-down";
      downBtn.innerHTML = "▼";
      downBtn.title = "خفض الطبقة";
      downBtn.disabled = index === this.layers.length - 1;

      // Visibility
      const visibility = document.createElement("button");
      visibility.type = "button";
      visibility.dataset.action = "visibility";
      visibility.textContent = layer.visible !== false ? "👁" : "🕶";
      visibility.title = "إظهار/إخفاء الطبقة";

      // Lock
      const lock = document.createElement("button");
      lock.type = "button";
      lock.dataset.action = "lock";
      lock.textContent = layer.locked ? "🔒" : "🔓";
      lock.title = "قفل/إلغاء قفل الطبقة";

      // Delete (if more than 1 layer)
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.dataset.action = "delete";
      delBtn.innerHTML = "✕";
      delBtn.title = "حذف الطبقة";
      if (this.layers.length <= 1) delBtn.disabled = true;

      controls.append(upBtn, downBtn, visibility, lock, delBtn);
      infoRow.append(select, controls);

      // Opacity row
      const opRow = document.createElement("div");
      opRow.className = "layer-opacity-row";
      opRow.innerHTML = `
        <span class="layer-op-label">الشفافية: ${Math.round((layer.opacity ?? 1) * 100)}%</span>
        <input type="range" class="layer-opacity-slider" min="0" max="1" step="0.05" value="${layer.opacity ?? 1}" data-layer-id="${layer.id}">
      `;

      const opInput = opRow.querySelector("input");
      opInput?.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.document.updateLayer(layer.id, { opacity: val });
        const label = opRow.querySelector(".layer-op-label");
        if (label) label.textContent = `الشفافية: ${Math.round(val * 100)}%`;
        this.renderer?.render(this.document);
      });
      opInput?.addEventListener("change", () => this.commitChange());

      item.append(infoRow, opRow);
      fragment.appendChild(item);
    });

    this.root.replaceChildren(fragment);
  }

  onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !this.root?.contains(button)) return;

    const item = button.closest("[data-layer-id]");
    if (!item) return;

    const layerIndex = this.layers.findIndex(
      entry => entry.id === item.dataset.layerId
    );
    if (layerIndex === -1) return;
    const layer = this.layers[layerIndex];

    const action = button.dataset.action;

    if (action === "select") {
      this.document.setActiveLayer(layer.id);
    } else if (action === "visibility") {
      this.document.updateLayer(layer.id, {
        visible: layer.visible === false ? true : false
      });
    } else if (action === "lock") {
      this.document.updateLayer(layer.id, {
        locked: !layer.locked
      });
    } else if (action === "move-up" && layerIndex > 0) {
      const temp = this.layers[layerIndex];
      this.layers[layerIndex] = this.layers[layerIndex - 1];
      this.layers[layerIndex - 1] = temp;
      this.document.touch?.();
    } else if (action === "move-down" && layerIndex < this.layers.length - 1) {
      const temp = this.layers[layerIndex];
      this.layers[layerIndex] = this.layers[layerIndex + 1];
      this.layers[layerIndex + 1] = temp;
      this.document.touch?.();
    } else if (action === "delete") {
      if (this.layers.length > 1) {
        if (confirm(`هل أنت متأكد من حذف طبقة "${layer.name}"؟`)) {
          this.remove(layer.id);
          return;
        }
      }
    }

    this.renderer?.render(this.document);
    this.refresh();
    this.commitChange();

    emit(this.root, "rasem:layerchange", {
      layerId: layer.id,
      action
    });
  }

  add(name = "طبقة جديدة") {
    const layer = this.document?.addLayer(name);
    if (!layer) return null;

    this.document.setActiveLayer(layer.id);
    this.renderer?.render(this.document);
    this.refresh();
    this.commitChange();
    return layer;
  }

  remove(id) {
    if (!this.document?.removeLayer(id)) {
      return false;
    }

    this.renderer?.render(this.document);
    this.refresh();
    this.commitChange();
    return true;
  }

  destroy() {
    if (this.destroyed) return;

    this.root?.removeEventListener(
      "click",
      this.onClick
    );

    this.document = null;
    this.renderer = null;
    this.onChange = null;

    this.destroyed = true;
  }
}

// =========================================================
// SELECTION PANEL
// =========================================================

export class SelectionPanel {
  constructor(documentModel, renderer, options = {}) {
    this.document = documentModel;
    this.renderer = renderer;

    this.root =
      options.root ||
      getElement(options.rootId || "selectionPanel");

    this.selectedId = null;
    this.destroyed = false;

    this.onClick = this.onClick.bind(this);

    this.root?.addEventListener(
      "click",
      this.onClick
    );
  }

  select(id) {
    if (!id) {
      this.selectedId = null;
      this.refresh();
      return false;
    }

    const exists = this.document?.layers.some(
      layer => layer.elements.some(
        element => element.id === id
      )
    );

    if (!exists) return false;

    this.selectedId = id;
    this.refresh();

    return true;
  }

  getSelected() {
    if (!this.selectedId || !this.document) {
      return null;
    }

    for (const layer of this.document.layers) {
      const element = layer.elements.find(
        item => item.id === this.selectedId
      );

      if (element) {
        return { element, layer };
      }
    }

    return null;
  }

  refresh() {
    if (!this.root) return;

    const selected = this.getSelected();

    this.root.hidden = !selected;

    if (!selected) return;

    const { element } = selected;

    const color = this.root.querySelector(
      '[data-selection="color"]'
    );

    const size = this.root.querySelector(
      '[data-selection="size"]'
    );

    const opacity = this.root.querySelector(
      '[data-selection="opacity"]'
    );

    if (color) {
      color.value = element.style?.color || DEFAULT_COLOR;
    }

    if (size) {
      size.value = element.style?.size ?? 3;
    }

    if (opacity) {
      opacity.value = element.style?.opacity ?? 1;
    }
  }

  onClick(event) {
    if (
      !event.target.closest('[data-action="delete-selection"]')
    ) {
      return;
    }

    const selected = this.getSelected();

    if (!selected) return;

    if (selected.layer.locked) return;

    selected.layer.elements =
      selected.layer.elements.filter(
        element => element.id !== this.selectedId
      );

    this.document.touch();

    this.renderer?.render(this.document);

    this.selectedId = null;
    this.refresh();
  }

  destroy() {
    if (this.destroyed) return;

    this.root?.removeEventListener(
      "click",
      this.onClick
    );

    this.document = null;
    this.renderer = null;

    this.destroyed = true;
  }
}

// =========================================================
// GALLERY
// =========================================================

export class Gallery {
  constructor(storage, options = {}) {
    this.storage = storage;

    this.root =
      options.root ||
      getElement(options.rootId || "gallery");

    this.items = [];
    this.destroyed = false;
  }

  setItems(items) {
    this.items = Array.isArray(items)
      ? items.filter(item =>
          item && typeof item === "object"
        )
      : [];

    this.refresh();
  }

  refresh() {
    if (!this.root) return;

    const fragment = document.createDocumentFragment();

    for (const item of this.items) {
      const card = document.createElement("button");

      card.type = "button";
      card.className = "gallery-item";
      card.dataset.documentId = String(item.id || "");

      const title = document.createElement("span");

      title.textContent = String(
        item.name || "رسم بدون اسم"
      );

      card.appendChild(title);
      fragment.appendChild(card);
    }

    this.root.replaceChildren(fragment);
  }

  destroy() {
    this.items = [];
    this.storage = null;
    this.root = null;
    this.destroyed = true;
  }
}

// =========================================================
// UI MANAGER
// =========================================================

export class UIManager {
  constructor(options = {}) {
    this.engine = options.engine || null;
    this.tools = options.tools || null;
    this.document = options.document || null;
    this.history = options.history || null;
    this.renderer = options.renderer || null;
    this.storage = options.storage || null;
    this.onChange = options.onChange || null;

    this.components = {};

    this.destroyed = false;

    this.init();
  }

  init() {
    this.components.toolbar = this.tools
      ? new Toolbar(
          this.tools,
          this.history,
          this.storage
        )
      : null;

    this.components.colorPicker = this.engine
      ? new ColorPicker(this.engine)
      : null;

    this.components.brushSettings = this.engine
      ? new BrushSettings(this.engine)
      : null;

    this.components.layerPanel = this.document
      ? new LayerPanel(
          this.document,
          this.history,
          this.renderer,
          { onChange: this.onChange }
        )
      : null;

    this.components.selectionPanel = this.document
      ? new SelectionPanel(
          this.document,
          this.renderer
        )
      : null;

    this.components.gallery = this.storage
      ? new Gallery(this.storage)
      : null;
  }

  refresh() {
    for (const component of Object.values(this.components)) {
      component?.refresh?.();
    }
  }

  destroy() {
    if (this.destroyed) return;

    for (const component of Object.values(this.components)) {
      component?.destroy?.();
    }

    this.components = {};

    this.engine = null;
    this.tools = null;
    this.document = null;
    this.history = null;
    this.renderer = null;
    this.storage = null;
    this.onChange = null;

    this.destroyed = true;
  }
}

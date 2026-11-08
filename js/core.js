
/* =========================================================
   RASEM 2.0
   CORE SYSTEM
   File: js/core.js

   Includes:
   1. DrawingDocument
   2. Scene
   3. Camera
   4. Coordinates
   5. EventManager

   ES Module
   ========================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULTS = Object.freeze({
  documentName: "رسم جديد",
  layerName: "طبقة جديدة",
  minZoom: 0.05,
  maxZoom: 100,
  zoomStep: 1.2
});

const ALLOWED_TAGS = new Set([
  "path",
  "line",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "image",
  "text",
  "g"
]);

const GEOMETRY_ATTRIBUTES = new Set([
  "d", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry",
  "width", "height", "points",
  "href", "xlink:href", "preserveAspectRatio",
  "fontSize", "fontFamily"
]);

/* =========================================================
   1. SHARED UTILITIES
   ========================================================= */

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback) {
  return isNumber(value) ? value : fallback;
}

function createId(prefix = "item") {
  const uuid = globalThis.crypto?.randomUUID?.();

  if (uuid) {
    return `${prefix}-${uuid}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36).slice(2)}`;
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createLayer(name = DEFAULTS.layerName) {
  return {
    id: createId("layer"),
    name: String(name),
    visible: true,
    locked: false,
    opacity: 1,
    elements: []
  };
}

function isValidPoint(point) {
  return Boolean(
    point &&
    isNumber(point.x) &&
    isNumber(point.y)
  );
}

function getDistance(a, b) {
  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );
}

function createSVGPoint(svg, x, y) {
  if (!svg?.createSVGPoint) {
    return null;
  }

  const point = svg.createSVGPoint();

  point.x = x;
  point.y = y;

  return point;
}

/* =========================================================
   2. DRAWING DOCUMENT
   ========================================================= */

export class DrawingDocument {
  constructor(data = {}) {
    if (!isObject(data)) {
      data = {};
    }

    this.id = typeof data.id === "string" && data.id
      ? data.id
      : createId("document");

    this.version = "2.0";

    this.name = String(
      data.name || DEFAULTS.documentName
    );

    this.camera = this.validateCamera(data.camera);

    this.layers = [];

    if (Array.isArray(data.layers)) {
      for (const source of data.layers) {
        try {
          const layer = cloneData(source);

          if (this.validateLayer(layer)) {
            this.layers.push(layer);
          }
        } catch {
          // تجاهل الطبقة غير القابلة للنسخ.
        }
      }
    }

    // منع تكرار معرفات الطبقات.
    const usedIds = new Set();

    this.layers = this.layers.filter(layer => {
      if (usedIds.has(layer.id)) {
        return false;
      }

      usedIds.add(layer.id);
      return true;
    });

    if (!this.layers.length) {
      this.layers.push(
        createLayer("الطبقة الأولى")
      );
    }

    const active = this.layers.find(
      layer => layer.id === data.activeLayerId
    );

    this.activeLayerId = active
      ? active.id
      : this.layers[0].id;

    this.createdAt = isNumber(data.createdAt)
      ? data.createdAt
      : Date.now();

    this.updatedAt = isNumber(data.updatedAt)
      ? data.updatedAt
      : Date.now();
  }

  validateCamera(camera = {}) {
    if (!isObject(camera)) {
      camera = {};
    }

    return {
      x: numberOr(camera.x, 0),
      y: numberOr(camera.y, 0),
      zoom: clamp(
        numberOr(camera.zoom, 1),
        DEFAULTS.minZoom,
        DEFAULTS.maxZoom
      ),
      rotation: numberOr(camera.rotation, 0)
    };
  }

  validateLayer(layer) {
    if (!isObject(layer)) return false;

    if (
      typeof layer.id !== "string" ||
      !layer.id ||
      !Array.isArray(layer.elements)
    ) {
      return false;
    }

    layer.name = String(layer.name || "طبقة");

    layer.visible = layer.visible !== false;
    layer.locked = layer.locked === true;

    layer.opacity = clamp(
      numberOr(Number(layer.opacity), 1),
      0,
      1
    );

    return true;
  }

  get activeLayer() {
    return this.layers.find(
      layer => layer.id === this.activeLayerId
    ) || null;
  }

  get drawableLayer() {
    const layer = this.activeLayer;

    if (
      !layer ||
      layer.locked ||
      !layer.visible
    ) {
      return null;
    }

    return layer;
  }

  getElementById(id) {
    if (!id) return null;

    for (const layer of this.layers) {
      const element = layer.elements.find(
        item => item.id === id
      );

      if (element) {
        return {
          element,
          layer
        };
      }
    }

    return null;
  }

  touch() {
    this.updatedAt = Date.now();
  }

  setName(name) {
    if (typeof name !== "string" || !name.trim()) {
      return false;
    }

    this.name = name.trim();
    this.touch();

    return true;
  }

  setActiveLayer(id) {
    const layer = this.layers.find(
      item => item.id === id
    );

    if (!layer) return false;

    this.activeLayerId = id;
    this.touch();

    return true;
  }

  addLayer(name = DEFAULTS.layerName) {
    const layer = createLayer(name);

    this.layers.push(layer);
    this.activeLayerId = layer.id;

    this.touch();

    return layer;
  }

  removeLayer(id) {
    if (this.layers.length <= 1) {
      return false;
    }

    const index = this.layers.findIndex(
      layer => layer.id === id
    );

    if (index === -1) return false;

    this.layers.splice(index, 1);

    if (this.activeLayerId === id) {
      const nextIndex = Math.max(0, index - 1);

      this.activeLayerId =
        this.layers[nextIndex].id;
    }

    this.touch();

    return true;
  }

  updateLayer(id, changes = {}) {
    const layer = this.layers.find(
      item => item.id === id
    );

    if (!layer || !isObject(changes)) {
      return false;
    }

    if ("name" in changes) {
      layer.name = String(changes.name);
    }

    if ("visible" in changes) {
      layer.visible = Boolean(changes.visible);
    }

    if ("locked" in changes) {
      layer.locked = Boolean(changes.locked);
    }

    if ("opacity" in changes) {
      const opacity = Number(changes.opacity);

      if (!Number.isFinite(opacity)) {
        return false;
      }

      layer.opacity = clamp(opacity, 0, 1);
    }

    this.touch();

    return true;
  }

  addElement(element, layerId = this.activeLayerId) {
    const layer = this.layers.find(
      item => item.id === layerId
    );

    if (
      !layer ||
      layer.locked ||
      !layer.visible ||
      !isObject(element)
    ) {
      return false;
    }

    let item;

    try {
      item = cloneData(element);
    } catch {
      return false;
    }

    item.id = item.id || createId("element");
    item.layerId = layerId;

    if (
      this.getElementById(item.id) ||
      layer.elements.some(existing =>
        existing.id === item.id
      )
    ) {
      return false;
    }

    layer.elements.push(item);

    this.touch();

    return item;
  }

  updateElement(id, changes = {}) {
    if (!isObject(changes)) return false;

    const result = this.getElementById(id);

    if (!result || result.layer.locked) {
      return false;
    }

    const updated = {
      ...result.element,
      ...cloneData(changes),
      id: result.element.id,
      layerId: result.element.layerId
    };

    Object.assign(result.element, updated);

    this.touch();

    return true;
  }

  removeElement(id) {
    for (const layer of this.layers) {
      if (layer.locked) continue;

      const index = layer.elements.findIndex(
        element => element.id === id
      );

      if (index === -1) continue;

      layer.elements.splice(index, 1);

      this.touch();

      return true;
    }

    return false;
  }

  clearLayer(id = this.activeLayerId) {
    const layer = this.layers.find(
      item => item.id === id
    );

    if (!layer || layer.locked) return false;

    if (!layer.elements.length) return false;

    layer.elements = [];

    this.touch();

    return true;
  }

  setCamera(camera = {}) {
    if (!isObject(camera)) return false;

    this.camera = this.validateCamera({
      ...this.camera,
      ...camera
    });

    this.touch();

    return true;
  }

  toJSON() {
    return cloneData({
      version: this.version,
      id: this.id,
      name: this.name,
      camera: this.camera,
      activeLayerId: this.activeLayerId,
      layers: this.layers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    });
  }

  static fromJSON(data) {
    return new DrawingDocument(data);
  }
}

/* =========================================================
   3. SCENE
   SVG SCENE AND RENDERING
   ========================================================= */

export class Scene {
  constructor(svg, viewport = null, drawingLayer = null) {
    if (!svg || svg.namespaceURI !== SVG_NS) {
      throw new TypeError(
        "Scene requires a valid SVG element"
      );
    }

    this.svg = svg;

    this.destroyed = false;

    this.viewport =
      viewport ||
      svg.querySelector("#viewport");

    if (!this.viewport) {
      this.viewport = document.createElementNS(
        SVG_NS,
        "g"
      );

      this.viewport.id = "viewport";
      svg.appendChild(this.viewport);
    }

    if (this.viewport.parentNode !== svg) {
      throw new Error(
        "Scene viewport must be a direct child of SVG"
      );
    }

    this.drawingLayer =
      drawingLayer ||
      this.viewport.querySelector("#drawingLayer");

    if (!this.drawingLayer) {
      this.drawingLayer = document.createElementNS(
        SVG_NS,
        "g"
      );

      this.drawingLayer.id = "drawingLayer";
      this.viewport.appendChild(this.drawingLayer);
    }

    if (this.drawingLayer.parentNode !== this.viewport) {
      throw new Error(
        "drawingLayer must be inside viewport"
      );
    }

    this.previewLayer =
      this.viewport.querySelector("#previewLayer");

    if (!this.previewLayer) {
      this.previewLayer = document.createElementNS(
        SVG_NS,
        "g"
      );

      this.previewLayer.id = "previewLayer";
      this.previewLayer.setAttribute(
        "pointer-events",
        "none"
      );

      this.viewport.appendChild(this.previewLayer);
    }

    this.layerGroups = new Map();
    this.previewElements = new Map();

    this.lastDocument = null;
  }

  assertAlive() {
    if (this.destroyed) {
      throw new Error("Scene has been destroyed");
    }
  }

  isValidElement(element) {
    return Boolean(
      isObject(element) &&
      typeof element.id === "string" &&
      element.id.length > 0
    );
  }

  getTag(element) {
    const tag = element.svgTag ||
      (element.type === "shape"
        ? element.shape
        : "path");

    return ALLOWED_TAGS.has(tag)
      ? tag
      : "path";
  }

  createNode(element) {
    if (!this.isValidElement(element)) {
      throw new TypeError("Invalid scene element");
    }

    const node = document.createElementNS(
      SVG_NS,
      this.getTag(element)
    );

    this.updateNode(node, element);

    return node;
  }

  applyGeometry(node, element) {
    const geometry = isObject(element.geometry)
      ? element.geometry
      : {};

    for (const attribute of GEOMETRY_ATTRIBUTES) {
      let value = geometry[attribute];

      if (
        value === undefined &&
        attribute === "d"
      ) {
        value = element.path;
      }

      if (value === undefined || value === null) {
        node.removeAttribute(attribute);
        continue;
      }

      if (
        attribute !== "d" &&
        attribute !== "points" &&
        attribute !== "href" &&
        attribute !== "xlink:href" &&
        attribute !== "preserveAspectRatio" &&
        !Number.isFinite(Number(value))
      ) {
        continue;
      }

      if (
        attribute === "d" ||
        attribute === "points" ||
        attribute === "href" ||
        attribute === "xlink:href" ||
        attribute === "preserveAspectRatio"
      ) {
        if (typeof value !== "string") continue;
      }

      node.setAttribute(attribute, String(value));
    }
  }

  applyStyle(node, element) {
    const style = isObject(element.style)
      ? element.style
      : {};

    const color = typeof style.color === "string"
      ? style.color
      : "#111111";

    const fill = typeof style.fill === "string"
      ? style.fill
      : "none";

    const size = clamp(
      numberOr(Number(style.size), 2),
      0,
      10000
    );

    const opacity = clamp(
      numberOr(Number(style.opacity), 1),
      0,
      1
    );

    node.setAttribute("fill", fill);
    if (style.calligraphyClean === true) {
      node.style.filter = "none";
      node.removeAttribute("filter");
    }
    const customBrush = style.customBrush;

    if (
      typeof customBrush === "string" &&
      customBrush.startsWith("data:image/")
    ) {
      const svg = node.ownerSVGElement;

      if (svg) {
        let defs = svg.querySelector("defs[data-rasem-brushes]");

        if (!defs) {
          defs = document.createElementNS(SVG_NS, "defs");
          defs.setAttribute("data-rasem-brushes", "true");
          svg.insertBefore(defs, svg.firstChild);
        }

        const id = "rasem-brush-" +
          String(node.dataset.id || "custom").replace(/[^a-zA-Z0-9_-]/g, "");

        let pattern = defs.querySelector("#" + id);

        const patternDim = String(Math.max(12, Math.round(size * 2)));

        if (!pattern) {
          pattern = document.createElementNS(SVG_NS, "pattern");
          pattern.id = id;
          pattern.setAttribute("patternUnits", "userSpaceOnUse");
          pattern.setAttribute("width", patternDim);
          pattern.setAttribute("height", patternDim);

          const image = document.createElementNS(SVG_NS, "image");
          image.setAttribute("width", patternDim);
          image.setAttribute("height", patternDim);
          image.setAttribute("preserveAspectRatio", "none");

          pattern.appendChild(image);
          defs.appendChild(pattern);
        } else {
          pattern.setAttribute("width", patternDim);
          pattern.setAttribute("height", patternDim);
          const existingImg = pattern.querySelector("image");
          if (existingImg) {
            existingImg.setAttribute("width", patternDim);
            existingImg.setAttribute("height", patternDim);
          }
        }

        const image = pattern.querySelector("image");
        if (image) {
          image.setAttribute("href", customBrush);
          image.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "xlink:href",
            customBrush
          );
        }

        node.setAttribute("stroke", "url(#" + id + ")");
      }
    } else {
      node.setAttribute("stroke", color);
    }
    node.setAttribute("stroke-width", size);
    node.setAttribute("stroke-opacity", opacity);

    // الخط العربي المغلق يعتمد على التعبئة فقط
    // منع تراكب الحد مع التعبئة عند خفض الشفافية.
    if (style.calligraphyClean === true && fill !== "none") {
      node.setAttribute("stroke", "none");
      node.setAttribute("stroke-width", "0");
      node.removeAttribute("stroke-opacity");
    }

    node.setAttribute(
      "stroke-linecap",
      ["round", "butt", "square"].includes(style.lineCap)
        ? style.lineCap
        : "round"
    );

    node.setAttribute(
      "stroke-linejoin",
      ["round", "bevel", "miter"].includes(style.lineJoin)
        ? style.lineJoin
        : "round"
    );

    if (fill !== "none") {
      node.setAttribute("fill-opacity", opacity);
    } else {
      node.removeAttribute("fill-opacity");
    }

    if (
      typeof style.dashArray === "string" &&
      /^[\d\s.,-]+$/.test(style.dashArray)
    ) {
      node.setAttribute(
        "stroke-dasharray",
        style.dashArray
      );
    } else {
      node.removeAttribute("stroke-dasharray");
    }
  }

  updateNode(node, element) {
    node.dataset.id = element.id;

    if (element.type === "text" || node.tagName.toLowerCase() === "text") {
      node.textContent = element.text || element.geometry?.text || "";
      const gx = element.geometry?.x ?? 0;
      const gy = element.geometry?.y ?? 0;
      node.setAttribute("x", String(gx));
      node.setAttribute("y", String(gy));
      const fsize = element.style?.fontSize || element.style?.size || 24;
      node.setAttribute("font-size", String(fsize));
      node.setAttribute("font-family", element.style?.fontFamily || "'Cairo', 'Segoe UI', system-ui, sans-serif");
      node.setAttribute("font-weight", String(element.style?.fontWeight || "600"));
      const col = element.style?.color || element.style?.fill || "#111111";
      node.setAttribute("fill", col);
      node.setAttribute("stroke", "none");
      node.setAttribute("direction", "rtl");
      node.setAttribute("xml:space", "preserve");
      node.style.userSelect = "none";
      node.style.cursor = "move";
    } else {
      this.applyGeometry(node, element);
      this.applyStyle(node, element);
    }

    node.setAttribute(
      "visibility",
      element.visible === false ? "hidden" : "visible"
    );

    if (typeof element.transform === "string") {
      node.setAttribute("transform", element.transform);
    } else {
      node.removeAttribute("transform");
    }
  }

  createLayerGroup(layer) {
    const group = document.createElementNS(
      SVG_NS,
      "g"
    );

    group.dataset.layerId = layer.id;

    this.updateLayerGroup(group, layer);

    return group;
  }

  updateLayerGroup(group, layer) {
    group.dataset.layerId = layer.id;

    group.setAttribute(
      "opacity",
      clamp(numberOr(Number(layer.opacity), 1), 0, 1)
    );

    group.setAttribute(
      "display",
      layer.visible === false ? "none" : "inline"
    );

    group.setAttribute(
      "pointer-events",
      layer.locked ? "none" : "auto"
    );
  }

  reconcile(container, elements) {
    const existing = new Map();

    for (const child of [...container.children]) {
      const id = child.dataset.id;

      if (id) {
        existing.set(id, child);
      }
    }

    const seen = new Set();

    let position = container.firstElementChild;

    for (const element of elements) {
      if (!this.isValidElement(element)) continue;
      if (seen.has(element.id)) continue;

      seen.add(element.id);

      let node = existing.get(element.id);

      if (
        node &&
        node.localName !== this.getTag(element)
      ) {
        node.remove();
        node = null;
      }

      if (!node) {
        node = this.createNode(element);
      } else {
        this.updateNode(node, element);
      }

      if (node !== position) {
        container.insertBefore(node, position);
      }

      position = node.nextElementSibling;
    }

    for (const child of [...container.children]) {
      if (!seen.has(child.dataset.id)) {
        child.remove();
      }
    }
  }

  render(documentModel) {
    this.assertAlive();

    if (!documentModel ||
        !Array.isArray(documentModel.layers)) {
      throw new TypeError("Invalid drawing document");
    }

    const activeIds = new Set();

    let position = this.drawingLayer.firstElementChild;

    for (const layer of documentModel.layers) {
      if (
        !isObject(layer) ||
        typeof layer.id !== "string" ||
        !Array.isArray(layer.elements)
      ) {
        continue;
      }

      activeIds.add(layer.id);

      let group = this.layerGroups.get(layer.id);

      if (!group) {
        group = this.createLayerGroup(layer);
        this.layerGroups.set(layer.id, group);
      } else {
        this.updateLayerGroup(group, layer);
      }

      this.reconcile(group, layer.elements);

      if (group !== position) {
        this.drawingLayer.insertBefore(
          group,
          position || null
        );
      }

      position = group.nextElementSibling;
    }

    for (const [id, group] of this.layerGroups) {
      if (!activeIds.has(id)) {
        group.remove();
        this.layerGroups.delete(id);
      }
    }

    this.lastDocument = documentModel;

    return true;
  }

  renderActiveLayer(layer) {
    this.assertAlive();

    if (
      !layer ||
      typeof layer.id !== "string" ||
      !Array.isArray(layer.elements)
    ) {
      return false;
    }

    let group = this.layerGroups.get(layer.id);

    if (!group) {
      group = this.createLayerGroup(layer);
      this.layerGroups.set(layer.id, group);
      this.drawingLayer.appendChild(group);
    }

    this.updateLayerGroup(group, layer);

    this.reconcile(group, layer.elements);

    return true;
  }

  updateElement(element) {
    this.assertAlive();

    if (!this.isValidElement(element)) {
      return false;
    }

    let node = this.previewElements.get(element.id);

    const tag = this.getTag(element);

    if (node && node.localName !== tag) {
      node.remove();
      this.previewElements.delete(element.id);
      node = null;
    }

    if (!node) {
      node = this.createNode(element);

      this.previewElements.set(
        element.id,
        node
      );

      this.previewLayer.appendChild(node);
    } else {
      this.updateNode(node, element);
    }

    return true;
  }

  renderPreviewPath(path, style = {}) {
    if (typeof path !== "string") {
      return false;
    }

    return this.updateElement({
      id: "temporary-preview",
      type: "stroke",
      path,
      style: {
        color: style.color ?? "#8065ed",
        size: style.size ?? 2,
        opacity: style.opacity ?? 0.8,
        fill: style.fill ?? "none",
        lineCap: style.lineCap ?? "round",
        lineJoin: style.lineJoin ?? "round"
      }
    });
  }

  clearPreview(id) {
    if (this.destroyed) return;

    if (id !== undefined) {
      const node = this.previewElements.get(id);

      if (node) {
        node.remove();
        this.previewElements.delete(id);
      }

      return;
    }

    this.previewLayer.replaceChildren();
    this.previewElements.clear();
  }

  clear() {
    if (this.destroyed) return;

    this.drawingLayer.replaceChildren();
    this.clearPreview();

    this.layerGroups.clear();
  }

  destroy() {
    if (this.destroyed) return;

    this.clear();

    this.svg = null;
    this.viewport = null;
    this.drawingLayer = null;
    this.previewLayer = null;

    this.lastDocument = null;

    this.destroyed = true;
  }
}

/* =========================================================
   4. CAMERA
   ========================================================= */

export class Camera {
  constructor(svg, viewport, options = {}) {
    if (!svg || !viewport) {
      throw new TypeError(
        "Camera requires SVG and viewport"
      );
    }

    this.svg = svg;
    this.viewport = viewport;

    this.minZoom = numberOr(
      options.minZoom,
      DEFAULTS.minZoom
    );

    this.maxZoom = numberOr(
      options.maxZoom,
      DEFAULTS.maxZoom
    );

    if (this.minZoom <= 0 || this.maxZoom < this.minZoom) {
      throw new RangeError("Invalid zoom limits");
    }

    this.zoomStep = numberOr(
      options.zoomStep,
      DEFAULTS.zoomStep
    );

    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.rotation = 0;

    this.document = options.document || null;
    this.onChange = options.onChange || null;

    this.destroyed = false;

    if (options.state) {
      this.restore(options.state, false);
    } else {
      this.render();
    }
  }

  get state() {
    return {
      x: this.x,
      y: this.y,
      zoom: this.zoom,
      rotation: this.rotation
    };
  }

  clampZoom(value) {
    if (!isNumber(value)) return this.zoom;

    return clamp(
      value,
      this.minZoom,
      this.maxZoom
    );
  }

  validateState(state = {}) {
    return {
      x: numberOr(state.x, 0),
      y: numberOr(state.y, 0),
      zoom: this.clampZoom(
        numberOr(state.zoom, 1)
      ),
      rotation: numberOr(state.rotation, 0)
    };
  }

  getViewBox() {
    const box = this.svg.viewBox?.baseVal;

    if (
      box &&
      box.width > 0 &&
      box.height > 0
    ) {
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height
      };
    }

    const rect = this.svg.getBoundingClientRect();

    return {
      x: 0,
      y: 0,
      width: rect.width || 1,
      height: rect.height || 1
    };
  }

  getCenter() {
    const box = this.getViewBox();

    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2
    };
  }

  createPoint(x, y) {
    return createSVGPoint(this.svg, x, y);
  }

  screenPointToSvg(x, y) {
    const matrix = this.svg.getScreenCTM();

    if (!matrix) return null;

    try {
      const point = this.createPoint(x, y);

      if (!point) return null;

      const result = point.matrixTransform(
        matrix.inverse()
      );

      return isValidPoint(result)
        ? { x: result.x, y: result.y }
        : null;
    } catch {
      return null;
    }
  }

  screenToWorld(x, y) {
    const matrix = this.viewport.getScreenCTM();

    if (!matrix) return null;

    try {
      const point = this.createPoint(x, y);

      if (!point) return null;

      const result = point.matrixTransform(
        matrix.inverse()
      );

      return isValidPoint(result)
        ? { x: result.x, y: result.y }
        : null;
    } catch {
      return null;
    }
  }

  worldToScreen(point) {
    if (!isValidPoint(point)) return null;

    const matrix = this.viewport.getScreenCTM();

    if (!matrix) return null;

    const result = this.createPoint(
      point.x,
      point.y
    )?.matrixTransform(matrix);

    if (!result || !isValidPoint(result)) {
      return null;
    }

    return {
      x: result.x,
      y: result.y
    };
  }

  screenVectorToSvg(dx, dy) {
    const matrix = this.svg.getScreenCTM();

    if (!matrix) return null;

    try {
      const origin = this.createPoint(0, 0);
      const target = this.createPoint(dx, dy);

      if (!origin || !target) return null;

      const inverse = matrix.inverse();

      const a = origin.matrixTransform(inverse);
      const b = target.matrixTransform(inverse);

      return {
        x: b.x - a.x,
        y: b.y - a.y
      };
    } catch {
      return null;
    }
  }

  pan(dx, dy) {
    if (!isNumber(dx) || !isNumber(dy)) {
      return false;
    }

    this.x += dx;
    this.y += dy;

    this.render();
    this.notifyChange();

    return true;
  }

  panScreen(dx, dy) {
    if (!isNumber(dx) || !isNumber(dy)) {
      return false;
    }

    const delta = this.screenVectorToSvg(dx, dy);

    if (!delta) return false;

    return this.pan(delta.x, delta.y);
  }

  zoomAt(factor, screenX, screenY) {
    if (
      !isNumber(factor) ||
      factor <= 0 ||
      !isNumber(screenX) ||
      !isNumber(screenY)
    ) {
      return false;
    }

    const before = this.screenToWorld(
      screenX,
      screenY
    );

    if (!before) return false;

    const nextZoom = this.clampZoom(
      this.zoom * factor
    );

    if (nextZoom === this.zoom) return false;

    this.zoom = nextZoom;

    this.render();

    const after = this.worldToScreen(before);

    if (!after) return false;

    const delta = this.screenVectorToSvg(
      screenX - after.x,
      screenY - after.y
    );

    if (!delta) return false;

    this.x += delta.x;
    this.y += delta.y;

    this.render();
    this.notifyChange();

    return true;
  }

  zoomIn() {
    const rect = this.svg.getBoundingClientRect();

    return this.zoomAt(
      this.zoomStep,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }

  zoomOut() {
    const rect = this.svg.getBoundingClientRect();

    return this.zoomAt(
      1 / this.zoomStep,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  }

  setZoom(value, screenX, screenY) {
    if (!isNumber(value) || value <= 0) {
      return false;
    }

    const rect = this.svg.getBoundingClientRect();

    return this.zoomAt(
      value / this.zoom,
      isNumber(screenX)
        ? screenX
        : rect.left + rect.width / 2,
      isNumber(screenY)
        ? screenY
        : rect.top + rect.height / 2
    );
  }

  rotateAt(angle, screenX, screenY) {
    if (
      !isNumber(angle) ||
      !isNumber(screenX) ||
      !isNumber(screenY)
    ) {
      return false;
    }

    const before = this.screenToWorld(
      screenX,
      screenY
    );

    if (!before) return false;

    this.rotation += angle;

    this.render();

    const after = this.worldToScreen(before);

    if (!after) return false;

    const delta = this.screenVectorToSvg(
      screenX - after.x,
      screenY - after.y
    );

    if (!delta) return false;

    this.x += delta.x;
    this.y += delta.y;

    this.render();
    this.notifyChange();

    return true;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.rotation = 0;

    this.render();
    this.notifyChange();

    return true;
  }

  render() {
    if (this.destroyed) return;

    const center = this.getCenter();

    const transform = [
      `translate(${center.x + this.x} ${center.y + this.y})`,
      `rotate(${this.rotation * 180 / Math.PI})`,
      `scale(${this.zoom})`,
      `translate(${-center.x} ${-center.y})`
    ].join(" ");

    this.viewport.setAttribute(
      "transform",
      transform
    );

    const label = document.getElementById("zoomLabel");

    if (label) {
      label.textContent =
        `${Math.round(this.zoom * 100)}%`;
    }
  }

  notifyChange() {
    const state = this.state;

    this.document?.setCamera?.(state);

    if (typeof this.onChange === "function") {
      this.onChange(state);
    }
  }

  serialize() {
    return { ...this.state };
  }

  restore(state = {}, notify = true) {
    if (!isObject(state)) return false;

    const next = this.validateState(state);

    this.x = next.x;
    this.y = next.y;
    this.zoom = next.zoom;
    this.rotation = next.rotation;

    this.render();

    if (notify) {
      this.notifyChange();
    }

    return true;
  }

  resize() {
    this.render();
  }

  destroy() {
    if (this.destroyed) return;

    this.document = null;
    this.onChange = null;
    this.svg = null;
    this.viewport = null;

    this.destroyed = true;
  }
}

/* =========================================================
   5. COORDINATES
   ========================================================= */

export class Coordinates {
  constructor(svg, camera = null, viewport = camera?.viewport) {
    if (!svg) {
      throw new TypeError(
        "Coordinates requires an SVG element"
      );
    }

    this.svg = svg;
    this.camera = camera;
    this.viewport = viewport || svg;
  }

  getScreenMatrix() {
    return this.svg?.getScreenCTM?.() || null;
  }

  getViewportMatrix() {
    return this.viewport?.getScreenCTM?.() || null;
  }

  screenToWorld(clientX, clientY) {
    if (
      !isNumber(clientX) ||
      !isNumber(clientY)
    ) {
      return null;
    }

    try {
      const matrix = this.getViewportMatrix();

      if (!matrix) return null;

      const point = createSVGPoint(
        this.svg,
        clientX,
        clientY
      );

      if (!point) return null;

      const result = point.matrixTransform(
        matrix.inverse()
      );

      if (!isValidPoint(result)) return null;

      return {
        x: result.x,
        y: result.y
      };
    } catch {
      return null;
    }
  }

  worldToScreen(x, y) {
    if (isObject(x)) {
      y = x.y;
      x = x.x;
    }

    if (!isNumber(x) || !isNumber(y)) {
      return null;
    }

    try {
      const matrix = this.getViewportMatrix();

      if (!matrix) return null;

      const point = createSVGPoint(this.svg, x, y);

      if (!point) return null;

      const result = point.matrixTransform(matrix);

      if (!isValidPoint(result)) return null;

      return {
        x: result.x,
        y: result.y
      };
    } catch {
      return null;
    }
  }

  screenToSVG(clientX, clientY) {
    if (
      !isNumber(clientX) ||
      !isNumber(clientY)
    ) {
      return null;
    }

    try {
      const matrix = this.getScreenMatrix();

      if (!matrix) return null;

      const point = createSVGPoint(
        this.svg,
        clientX,
        clientY
      );

      if (!point) return null;

      const result = point.matrixTransform(
        matrix.inverse()
      );

      if (!isValidPoint(result)) return null;

      return {
        x: result.x,
        y: result.y
      };
    } catch {
      return null;
    }
  }

  svgToScreen(x, y) {
    if (!isNumber(x) || !isNumber(y)) {
      return null;
    }

    try {
      const matrix = this.getScreenMatrix();

      if (!matrix) return null;

      const point = createSVGPoint(this.svg, x, y);

      if (!point) return null;

      const result = point.matrixTransform(matrix);

      if (!isValidPoint(result)) return null;

      return {
        x: result.x,
        y: result.y
      };
    } catch {
      return null;
    }
  }

  distance(a, b) {
    if (!isValidPoint(a) || !isValidPoint(b)) {
      return NaN;
    }

    return getDistance(a, b);
  }

  midpoint(a, b) {
    if (!isValidPoint(a) || !isValidPoint(b)) {
      return null;
    }

    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    };
  }

  // Compatibility with the previous Camera API.
  static screenToWorld(clientX, clientY, state, rect) {
    if (!state || !rect) return null;

    const zoom = Math.max(
      0.0001,
      numberOr(state.zoom, 1)
    );

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const sx =
      clientX - rect.left - cx - numberOr(state.x, 0);

    const sy =
      clientY - rect.top - cy - numberOr(state.y, 0);

    const angle = -numberOr(state.rotation, 0);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: (sx * cos - sy * sin) / zoom + cx,
      y: (sx * sin + sy * cos) / zoom + cy
    };
  }

  static worldToScreen(point, state, rect) {
    if (!isValidPoint(point) || !state || !rect) {
      return null;
    }

    const zoom = Math.max(
      0.0001,
      numberOr(state.zoom, 1)
    );

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const x = point.x - cx;
    const y = point.y - cy;

    const angle = numberOr(state.rotation, 0);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: rect.left + cx +
        numberOr(state.x, 0) +
        zoom * (x * cos - y * sin),

      y: rect.top + cy +
        numberOr(state.y, 0) +
        zoom * (x * sin + y * cos)
    };
  }
}

/* =========================================================
   6. EVENT MANAGER
   POINTER EVENTS AND MULTITOUCH
   ========================================================= */

export class EventManager {
  constructor(element, handlers = {}, options = {}) {
    if (!element?.addEventListener) {
      throw new TypeError(
        "EventManager requires an event target"
      );
    }

    this.element = element;
    this.handlers = isObject(handlers)
      ? handlers
      : {};

    this.options = {
      preventDefault: options.preventDefault !== false,
      capture: options.capture !== false,
      acceptMouse: options.acceptMouse !== false,
      acceptTouch: options.acceptTouch !== false,
      acceptPen: options.acceptPen !== false,
      allowSecondaryMouse: options.allowSecondaryMouse === true
    };

    this.pointers = new Map();

    this.activePointer = null;

    this.gestureActive = false;
    this.destroyed = false;

    this.previousTouchAction =
      element.style.touchAction;

    // Register pointer listeners in the capture phase so drawing input
    // is received even when an SVG child handles or stops the event.
    this.listenerOptions = {
      capture: this.options.capture,
      passive: false
    };

    this.bind();
  }

  bind() {
    this.element.style.touchAction = "none";

    this.element.addEventListener(
      "pointerdown",
      this.onDown,
      this.listenerOptions
    );

    this.element.addEventListener(
      "pointermove",
      this.onMove,
      this.listenerOptions
    );

    this.element.addEventListener(
      "pointerup",
      this.onUp,
      this.listenerOptions
    );

    this.element.addEventListener(
      "pointercancel",
      this.onCancel,
      this.listenerOptions
    );

    this.element.addEventListener(
      "lostpointercapture",
      this.onLostCapture
    );

    this.element.addEventListener(
      "contextmenu",
      this.onContextMenu
    );
  }

  acceptsPointer(event) {
    switch (event.pointerType) {
      case "mouse":
        return this.options.acceptMouse &&
          (
            this.options.allowSecondaryMouse ||
            event.button === 0
          );

      case "touch":
        return this.options.acceptTouch;

      case "pen":
        return this.options.acceptPen;

      default:
        return false;
    }
  }

  getPointerData() {
    return [...this.pointers.values()].map(pointer => ({
      pointerId: pointer.pointerId,
      pointerType: pointer.pointerType,
      x: pointer.clientX,
      y: pointer.clientY,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      pressure: pointer.pressure,
      buttons: pointer.buttons
    }));
  }

  capture(pointerId) {
    try {
      if (
        this.element.setPointerCapture &&
        this.element.isConnected !== false
      ) {
        this.element.setPointerCapture(pointerId);
      }
    } catch {
      // قد يكون المؤشر قد انتهى بالفعل.
    }
  }

  release(pointerId) {
    try {
      if (
        this.element.hasPointerCapture?.(pointerId)
      ) {
        this.element.releasePointerCapture(pointerId);
      }
    } catch {
      // لا يؤثر فقد الالتقاط على بقية المؤشرات.
    }
  }

  prevent(event) {
    if (
      this.options.preventDefault &&
      event.cancelable
    ) {
      event.preventDefault();
    }
  }

  onDown = event => {
    if (this.destroyed) return;

    if (!this.acceptsPointer(event)) return;

    if (this.pointers.has(event.pointerId)) {
      return;
    }

    this.prevent(event);

    this.pointers.set(event.pointerId, event);

    this.capture(event.pointerId);

    const pointerData = this.getPointerData();

    if (this.pointers.size === 1) {
      this.activePointer = event.pointerId;
      this.gestureActive = false;

      this.handlers.down?.(event, pointerData);

      this.handlers.pointerCount?.(1, event);

      return;
    }

    if (!this.gestureActive) {
      this.gestureActive = true;

      this.handlers.multitouchStart?.(
        pointerData,
        event
      );
    }

    this.handlers.multitouch?.(
      pointerData,
      event
    );

    this.handlers.pointerCount?.(
      this.pointers.size,
      event
    );
  };

  onMove = event => {
    if (
      this.destroyed ||
      !this.pointers.has(event.pointerId)
    ) {
      return;
    }

    this.prevent(event);

    this.pointers.set(event.pointerId, event);

    if (this.pointers.size > 1) {
      this.handlers.multitouch?.(
        this.getPointerData(),
        event
      );

      return;
    }

    if (event.pointerId !== this.activePointer) {
      return;
    }

    let samples = [event];

    if (typeof event.getCoalescedEvents === "function") {
      try {
        const coalesced = event.getCoalescedEvents();

        if (coalesced.length) {
          samples = coalesced;
        }
      } catch {
        // استخدام الحدث الأصلي عند فشل القراءة.
      }
    }

    for (const sample of samples) {
      this.handlers.move?.(
        sample,
        this.getPointerData()
      );
    }
  };

  finishPointer(event, cancelled = false) {
    if (
      this.destroyed ||
      !this.pointers.has(event.pointerId)
    ) {
      return false;
    }

    const wasMultiTouch = this.pointers.size > 1;
    const wasActive =
      event.pointerId === this.activePointer;

    // إنهاء الرسم فقط عندما يكون هناك مؤشر واحد.
    if (!wasMultiTouch && wasActive) {
      if (cancelled) {
        this.handlers.cancel?.(event);
      } else {
        this.handlers.up?.(event);
      }
    }

    this.pointers.delete(event.pointerId);

    // الحذف قبل release يمنع معالجة lostpointercapture مرتين.
    this.release(event.pointerId);

    if (wasActive) {
      this.activePointer = null;
    }

    if (wasMultiTouch) {
      this.gestureActive = false;

      this.handlers.multitouchEnd?.(
        this.getPointerData(),
        event
      );
    }

    this.handlers.pointerCount?.(
      this.pointers.size,
      event
    );

    if (this.pointers.size === 0) {
      this.activePointer = null;
      this.gestureActive = false;
    }

    return true;
  }

  onUp = event => {
    this.finishPointer(event, false);
  };

  onCancel = event => {
    this.finishPointer(event, true);
  };

  onLostCapture = event => {
    this.finishPointer(event, true);
  };

  onContextMenu = event => {
    if (this.options.preventDefault) {
      event.preventDefault();
    }
  };

  cancelAll() {
    if (!this.pointers.size) return false;

    const active = this.activePointer !== null
      ? this.pointers.get(this.activePointer)
      : null;

    if (active && this.pointers.size === 1) {
      this.handlers.cancel?.(active);
    } else if (this.gestureActive) {
      this.handlers.multitouchEnd?.(
        [],
        active || null
      );
    }

    const ids = [...this.pointers.keys()];

    this.pointers.clear();

    for (const id of ids) {
      this.release(id);
    }

    this.activePointer = null;
    this.gestureActive = false;

    this.handlers.pointerCount?.(0, null);

    return true;
  }

  destroy() {
    if (this.destroyed) return;

    this.cancelAll();

    this.element.removeEventListener(
      "pointerdown",
      this.onDown,
      this.listenerOptions
    );

    this.element.removeEventListener(
      "pointermove",
      this.onMove,
      this.listenerOptions
    );

    this.element.removeEventListener(
      "pointerup",
      this.onUp,
      this.listenerOptions
    );

    this.element.removeEventListener(
      "pointercancel",
      this.onCancel,
      this.listenerOptions
    );

    this.element.removeEventListener(
      "lostpointercapture",
      this.onLostCapture
    );

    this.element.removeEventListener(
      "contextmenu",
      this.onContextMenu
    );

    this.element.style.touchAction =
      this.previousTouchAction;

    this.pointers.clear();

    this.handlers = {};
    this.element = null;

    this.destroyed = true;
  }
}

/* =========================================================
   7. CORE VERSION
   ========================================================= */

export const CORE_VERSION = "2.0.0";

export const Core = Object.freeze({
  DrawingDocument,
  Scene,
  Camera,
  Coordinates,
  EventManager
});

/* =========================================================
   END OF CORE.JS
   ========================================================= */

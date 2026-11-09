
/* =========================================================
   RASEM 2.0
   TOOLS MODULE

   Pen
   Pencil
   Marker
   Eraser
   Selector
   Lasso
   Shapes
   Hand
   ToolManager
========================================================= */

import { HitTesting } from "./engine.js?v=20261109-48";

/* =========================================================
   1. TOOL UTILITIES
========================================================= */

const ToolUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  validPoint(point) {
    return Boolean(
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    );
  },

  distance(a, b) {
    return Math.hypot(
      b.x - a.x,
      b.y - a.y
    );
  },

  id(prefix = "element") {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random()
      .toString(36).slice(2)}`;
  },

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  },

  eventPoint(engine, event) {
    if (!event) return null;

    const point = engine.getWorldPoint(event);

    return this.validPoint(point) ? point : null;
  },

  elementBounds(el) {
    if (!el) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (Array.isArray(el.points) && el.points.length > 0) {
      for (const pt of el.points) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    } else if (el.geometry) {
      const g = el.geometry;
      if (Number.isFinite(g.x) && Number.isFinite(g.width)) {
        minX = g.x;
        minY = g.y;
        maxX = g.x + g.width;
        maxY = g.y + g.height;
      } else if (Number.isFinite(g.cx)) {
        const rx = g.rx ?? g.r ?? 10;
        const ry = g.ry ?? g.r ?? 10;
        minX = g.cx - rx;
        minY = g.cy - ry;
        maxX = g.cx + rx;
        maxY = g.cy + ry;
      } else if (Number.isFinite(g.x1)) {
        minX = Math.min(g.x1, g.x2);
        minY = Math.min(g.y1, g.y2);
        maxX = Math.max(g.x1, g.x2);
        maxY = Math.max(g.y1, g.y2);
      }
    }
    if (el.type === "text" || el.svgTag === "text") {
      const tx = el.geometry?.x ?? 0;
      const ty = el.geometry?.y ?? 0;
      const fontSize = el.style?.fontSize || el.style?.size || 24;
      const tw = ((el.text || "").length || 4) * fontSize * 0.65;
      const th = fontSize * 1.2;
      minX = tx;
      minY = ty - th;
      maxX = tx + tw;
      maxY = ty;
    }
    if (!Number.isFinite(minX)) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }
};

/* =========================================================
   2. BASE TOOL
========================================================= */

export class BaseTool {
  constructor(engine, camera = null) {
    if (!engine) {
      throw new TypeError("Tool requires DrawingEngine");
    }

    this.engine = engine;
    this.camera = camera;
    this.name = "base";
    this.active = false;
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  down() {
    return false;
  }

  move() {
    return false;
  }

  up() {
    return false;
  }

  cancel() {
    return false;
  }

  destroy() {
    this.deactivate();
    this.engine = null;
    this.camera = null;
  }
}

/* =========================================================
   3. PENCIL
========================================================= */

export class Pencil extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "pencil";
  }

activate() {
    super.activate();
    this.engine.setSettings({
      tool: "pencil"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   5. MARKER
========================================================= */

export class Feather extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "feather";
  }

activate() {
    super.activate();
    this.engine.setSettings({
      tool: "feather"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   6. CALLIGRAPHY (قلم الخط العربي المشطوف)
========================================================= */

export class Calligraphy extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "calligraphy";
  }

  activate() {
    super.activate();
    this.engine.setSettings({
      tool: "calligraphy"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   7. DUAL-MODE ERASER (الممحاة الذكية المزدوجة)
========================================================= */

export class Eraser extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "eraser";
    this.mode = "partial";
  }

  activate() {
    const wasActive = this.active;
    super.activate();

    if (wasActive) {
      this.mode = this.mode === "partial" ? "stroke" : "partial";
    } else {
      this.mode = "partial";
    }

    this.engine.setSettings({
      tool: "eraser",
      eraserMode: this.mode,
      pressureEnabled: false
    });

    window.dispatchEvent(new CustomEvent("rasem:eraser-mode", {
      detail: { mode: this.mode }
    }));
  }

  setMode(mode) {
    if (mode === "partial" || mode === "stroke") {
      this.mode = mode;
      this.engine.setSettings({ eraserMode: this.mode });
      window.dispatchEvent(new CustomEvent("rasem:eraser-mode", {
        detail: { mode: this.mode }
      }));
    }
  }

  updateCursor(event) {
    const point = ToolUtils.eventPoint(this.engine, event);
    const viewport = this.engine.renderer?.viewport;
    if (!point || !viewport) return;

    let overlay = viewport.querySelector("#eraserCursorOverlay");
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.id = "eraserCursorOverlay";
      overlay.setAttribute("pointer-events", "none");
      overlay.innerHTML = `
        <circle class="eraser-cursor-fill" r="16" fill="rgba(225,29,72,0.12)" stroke="none"/>
        <circle class="eraser-cursor-ring" r="16" fill="none" stroke="#e11d48" stroke-width="1.8" stroke-dasharray="4 2" vector-effect="non-scaling-stroke"/>
        <path class="eraser-cursor-center" d="M-4 0H4 M0 -4V4" fill="none" stroke="#e11d48" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      `;
      viewport.appendChild(overlay);
    }

    const zoom = Number(this.engine.coordinates?.camera?.zoom ??
      this.engine.coordinates?.camera?.scale ?? 1);
    const radius = this.engine.getEraserTolerance?.() ??
      (this.engine.settings.eraserSize / Math.max(0.01, zoom));
    // Keep the visual cursor exactly over the real erase contact point.
    overlay.setAttribute("transform", `translate(${point.x} ${point.y})`);
    for (const ring of overlay.querySelectorAll("circle")) {
      ring.setAttribute("r", String(radius));
    }
    overlay.querySelector(".eraser-cursor-center")?.setAttribute(
      "transform", `scale(${Math.max(0.45, radius / 16)})`
    );
  }

  hideCursor() {
    this.engine.renderer?.viewport?.querySelector("#eraserCursorOverlay")?.remove();
  }

  deactivate() {
    super.deactivate();
    this.hideCursor();
  }

  down(event) {
    this.updateCursor(event);
    return this.engine.start(event);
  }

  move(event) {
    this.updateCursor(event);
    return this.engine.move(event);
  }

  up(event) {
    this.updateCursor(event);
    return this.engine.end(event);
  }

  cancel() {
    const result = this.engine.cancel();
    this.hideCursor();
    return result;
  }

  destroy() {
    this.hideCursor();
    super.destroy();
  }
}

/* =========================================================
   8. SELECTOR (أداة التحديد وصندوق الإحاطة والمقابض)
========================================================= */

export class Selector extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "selector";
    this.selectedIds = new Set();
    this.pointerDown = false;
    this.startPoint = null;
    this.dragMode = null;
    this.activeHandle = null;
    this.initialSnapshot = new Map();
    this.initialBounds = null;
    this.moved = false;
    this.rotationStartAngle = 0;
  }

  getLayer() {
    return this.engine.activeLayer;
  }

  setSelection(ids) {
    this.selectedIds = new Set(ids);
    this.renderOverlay();
    this.emitChange();
  }

  select(id, additive = false) {
    const layer = this.getLayer();
    if (!layer) return false;
    const element = layer.elements.find(item => item.id === id);
    if (!element) return false;

    if (!additive) {
      this.selectedIds.clear();
    }

    if (additive && this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }

    this.renderOverlay();
    this.emitChange();
    return true;
  }

  clearSelection() {
    this.selectedIds.clear();
    this.initialSnapshot.clear();
    this.moved = false;
    this.clearOverlay();
    this.emitChange();
  }

  getSelectedElements() {
    const layer = this.getLayer();
    if (!layer) return [];
    return layer.elements.filter(element => this.selectedIds.has(element.id));
  }

  getBounds() {
    const elements = this.getSelectedElements();
    if (!elements.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of elements) {
      if (Array.isArray(el.points) && el.points.length > 0) {
        for (const pt of el.points) {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        }
      } else if (el.geometry) {
        const g = el.geometry;
        if (Number.isFinite(g.x) && Number.isFinite(g.width)) {
          minX = Math.min(minX, g.x);
          minY = Math.min(minY, g.y);
          maxX = Math.max(maxX, g.x + g.width);
          maxY = Math.max(maxY, g.y + g.height);
        } else if (Number.isFinite(g.cx)) {
          const rx = g.rx ?? g.r ?? 10;
          const ry = g.ry ?? g.r ?? 10;
          minX = Math.min(minX, g.cx - rx);
          minY = Math.min(minY, g.cy - ry);
          maxX = Math.max(maxX, g.cx + rx);
          maxY = Math.max(maxY, g.cy + ry);
        }
      }

      if (el.type === "text" || el.svgTag === "text") {
        const tx = el.geometry?.x ?? 0;
        const ty = el.geometry?.y ?? 0;
        const fontSize = el.style?.fontSize || el.style?.size || 24;
        const tw = ((el.text || "").length || 4) * fontSize * 0.65;
        const th = fontSize * 1.2;
        minX = Math.min(minX, tx);
        minY = Math.min(minY, ty - th);
        maxX = Math.max(maxX, tx + tw);
        maxY = Math.max(maxY, ty);
      }
    }

    if (!Number.isFinite(minX)) return null;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2
    };
  }

  renderOverlay() {
    const bounds = this.getBounds();
    const viewport = this.engine.renderer?.viewport;
    if (!viewport) return;

    let overlay = viewport.querySelector("#selectionOverlay");
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
      overlay.id = "selectionOverlay";
      viewport.appendChild(overlay);
    }

    if (!bounds) {
      overlay.replaceChildren();
      return;
    }

    const { minX, minY, width, height, maxX, maxY } = bounds;
    const padding = 6;
    const bx = minX - padding;
    const by = minY - padding;
    const bw = width + padding * 2;
    const bh = height + padding * 2;

    const handles = [
      { name: "tl", x: bx, y: by, cursor: "nwse-resize" },
      { name: "tr", x: bx + bw, y: by, cursor: "nesw-resize" },
      { name: "br", x: bx + bw, y: by + bh, cursor: "nwse-resize" },
      { name: "bl", x: bx, y: by + bh, cursor: "nesw-resize" },
      { name: "tc", x: bx + bw / 2, y: by, cursor: "ns-resize" },
      { name: "bc", x: bx + bw / 2, y: by + bh, cursor: "ns-resize" },
      { name: "ml", x: bx, y: by + bh / 2, cursor: "ew-resize" },
      { name: "mr", x: bx + bw, y: by + bh / 2, cursor: "ew-resize" }
    ];

    let html = "";

    // Individual dashed outlines around each selected item when multiple are chosen
    if (this.selectedIds.size > 1) {
      for (const el of this.getSelectedElements()) {
        const eb = ToolUtils.elementBounds(el);
        if (eb) {
          html += `
            <rect x="${eb.minX - 3}" y="${eb.minY - 3}" width="${eb.width + 6}" height="${eb.height + 6}"
                  rx="3" fill="rgba(59, 130, 246, 0.05)" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 3"
                  pointer-events="none"/>
          `;
        }
      }
    }

    // Main enclosing dashed selection box
    html += `
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}"
            fill="rgba(37, 99, 235, 0.08)"
            stroke="#2563eb" stroke-width="2" stroke-dasharray="6 4"
            pointer-events="none"/>
    `;

    html += `
      <line x1="${bx + bw / 2}" y1="${by}"
            x2="${bx + bw / 2}" y2="${by - 25}"
            stroke="#2563eb" stroke-width="2"
            pointer-events="none"/>
      <circle data-handle="rotate"
              cx="${bx + bw / 2}" cy="${by - 25}" r="22"
              fill="transparent" stroke="none"
              style="pointer-events:all;touch-action:none;"/>
      <circle class="selection-handle"
              cx="${bx + bw / 2}" cy="${by - 25}" r="10"
              fill="#ffffff" stroke="#2563eb" stroke-width="2"
              pointer-events="none"/>
    `;

    for (const h of handles) {
      html += `
        <rect data-handle="${h.name}"
              x="${h.x - 22}" y="${h.y - 22}" width="44" height="44"
              fill="transparent" stroke="none"
              style="pointer-events:all;touch-action:none;cursor:${h.cursor};"/>
        <circle class="selection-handle"
                cx="${h.x}" cy="${h.y}" r="9"
                fill="#ffffff" stroke="#2563eb" stroke-width="2"
                pointer-events="none"/>
      `;
    }

    overlay.innerHTML = html;
  }

  clearOverlay() {
    const viewport = this.engine.renderer?.viewport;
    const overlay = viewport?.querySelector("#selectionOverlay");
    if (overlay) overlay.replaceChildren();
  }

  emitChange() {
    window.dispatchEvent(new CustomEvent("rasem:selection-change", {
      detail: {
        count: this.selectedIds.size,
        bounds: this.getBounds()
      }
    }));
  }

  down(event) {
    const point = ToolUtils.eventPoint(this.engine, event);
    if (!point) return false;

    const handleEl = event.target?.closest?.("[data-handle]");
    if (handleEl && this.selectedIds.size > 0) {
      this.pointerDown = true;
      this.activeHandle = handleEl.dataset.handle;
      this.dragMode = this.activeHandle === "rotate" ? "rotate" : "handle";
      this.startPoint = point;
      this.initialBounds = this.getBounds();
      if (this.dragMode === "rotate" && this.initialBounds) {
        this.rotationStartAngle = Math.atan2(
          point.y - this.initialBounds.cy,
          point.x - this.initialBounds.cx
        );
      }
      this.snapshotElements();
      this.moved = false;
      return true;
    }

    const hit = this.engine.hitTest(point, 10);
    const bounds = this.getBounds();
    const insideBounds = bounds &&
      point.x >= bounds.minX - 8 && point.x <= bounds.maxX + 8 &&
      point.y >= bounds.minY - 8 && point.y <= bounds.maxY + 8;

    if (hit) {
      if (!this.selectedIds.has(hit.id)) {
        this.select(hit.id, event.shiftKey);
      }
      this.pointerDown = true;
      this.dragMode = "move";
      this.startPoint = point;
      this.snapshotElements();
      this.moved = false;
      return true;
    }

    if (insideBounds && this.selectedIds.size > 0) {
      this.pointerDown = true;
      this.dragMode = "move";
      this.startPoint = point;
      this.snapshotElements();
      this.moved = false;
      return true;
    }

    // Keep selection until the user presses the confirm button.
    this.pointerDown = false;
    return false;
  }

  snapshotElements() {
    this.initialSnapshot.clear();
    for (const el of this.getSelectedElements()) {
      this.initialSnapshot.set(el.id, {
        points: Array.isArray(el.points) ? el.points.map(p => ({ ...p })) : null,
        geometry: el.geometry ? { ...el.geometry } : null,
        style: el.style ? { ...el.style } : null,
        path: el.path,
        transform: el.transform
      });
    }
  }

  move(event) {
    if (!this.pointerDown) return false;
    const point = ToolUtils.eventPoint(this.engine, event);
    if (!point) return false;

    const layer = this.getLayer();
    if (!layer || layer.locked) return false;

    const dx = point.x - this.startPoint.x;
    const dy = point.y - this.startPoint.y;

    if (this.dragMode === "move") {
      for (const el of this.getSelectedElements()) {
        const snap = this.initialSnapshot.get(el.id);
        if (!snap) continue;

        if (el.type === "stroke" && Array.isArray(snap.points)) {
          // Keep the finished brush outline intact; points are source samples,
          // not a centerline from which a calligraphy stroke can be rebuilt.
          el.points = snap.points.map(p => ({
            ...p,
            x: p.x + dx,
            y: p.y + dy
          }));
          el.path = snap.path;
          el.transform = [
            `translate(${dx} ${dy})`,
            snap.transform
          ].filter(Boolean).join(" ");
        } else if (Array.isArray(snap.points)) {
          el.points = snap.points.map(p => ({
            ...p,
            x: p.x + dx,
            y: p.y + dy
          }));
          el.path = this.engine.buildPath(el.points);
        } else if (snap.geometry) {
          el.geometry = { ...snap.geometry };
          if (Number.isFinite(el.geometry.x)) el.geometry.x = snap.geometry.x + dx;
          if (Number.isFinite(el.geometry.y)) el.geometry.y = snap.geometry.y + dy;
          if (Number.isFinite(el.geometry.cx)) el.geometry.cx = snap.geometry.cx + dx;
          if (Number.isFinite(el.geometry.cy)) el.geometry.cy = snap.geometry.cy + dy;
          if (Number.isFinite(el.geometry.x1)) {
            el.geometry.x1 = snap.geometry.x1 + dx;
            el.geometry.y1 = snap.geometry.y1 + dy;
            el.geometry.x2 = snap.geometry.x2 + dx;
            el.geometry.y2 = snap.geometry.y2 + dy;
          }
        }
      }
      this.moved = true;
      this.engine.renderer.renderActiveLayer(layer);
      this.renderOverlay();
      return true;
    }

    if (this.dragMode === "rotate" && this.initialBounds) {
      const center = this.initialBounds;
      const currentAngle = Math.atan2(
        point.y - center.cy,
        point.x - center.cx
      );
      const degrees = (currentAngle - this.rotationStartAngle) * 180 / Math.PI;

      for (const el of this.getSelectedElements()) {
        const snap = this.initialSnapshot.get(el.id);
        if (!snap) continue;

        const rotation = `rotate(${degrees} ${center.cx} ${center.cy})`;
        if (el.type === "stroke" && Array.isArray(snap.points)) {
          const radians = degrees * Math.PI / 180;
          const cos = Math.cos(radians), sin = Math.sin(radians);
          el.points = snap.points.map(p => {
            const x = p.x - center.cx, y = p.y - center.cy;
            return { ...p, x: center.cx + x * cos - y * sin, y: center.cy + x * sin + y * cos };
          });
          el.path = snap.path;
        }
        el.transform = [rotation, snap.transform].filter(Boolean).join(" ");
      }

      this.moved = true;
      this.engine.renderer.renderActiveLayer(layer);
      this.renderOverlay();
      return true;
    }

    if (this.dragMode === "handle" && this.initialBounds) {
      const ib = this.initialBounds;
      let scaleX = 1;
      let scaleY = 1;
      let originX = ib.cx;
      let originY = ib.cy;

      const handle = this.activeHandle;

      if (handle === "br" || handle === "mr" || handle === "tr") {
        originX = ib.minX;
        scaleX = Math.max(0.1, (ib.width + dx) / ib.width);
      } else if (handle === "bl" || handle === "ml" || handle === "tl") {
        originX = ib.maxX;
        scaleX = Math.max(0.1, (ib.width - dx) / ib.width);
      }

      if (handle === "br" || handle === "bc" || handle === "bl") {
        originY = ib.minY;
        scaleY = Math.max(0.1, (ib.height + dy) / ib.height);
      } else if (handle === "tr" || handle === "tc" || handle === "tl") {
        originY = ib.maxY;
        scaleY = Math.max(0.1, (ib.height - dy) / ib.height);
      }

      for (const el of this.getSelectedElements()) {
        const snap = this.initialSnapshot.get(el.id);
        if (!snap) continue;

        if (el.type === "stroke" && Array.isArray(snap.points)) {
          // Transform the existing SVG outline instead of rebuilding it from
          // raw samples, which would lose the nib profile and pressure shape.
          el.points = snap.points.map(p => ({
            ...p,
            x: originX + (p.x - originX) * scaleX,
            y: originY + (p.y - originY) * scaleY
          }));
          el.path = snap.path;
          const scaleTransform = [
            `translate(${originX} ${originY})`,
            `scale(${scaleX} ${scaleY})`,
            `translate(${-originX} ${-originY})`
          ].join(" ");
          el.transform = [scaleTransform, snap.transform].filter(Boolean).join(" ");
        } else if (Array.isArray(snap.points)) {
          el.points = snap.points.map(p => ({
            ...p,
            x: originX + (p.x - originX) * scaleX,
            y: originY + (p.y - originY) * scaleY
          }));
          el.path = this.engine.buildPath(el.points);
        } else if (snap.geometry) {
          el.geometry = { ...snap.geometry };
          if (Number.isFinite(snap.geometry.width) && Number.isFinite(snap.geometry.height)) {
            el.geometry.width = Math.max(10, snap.geometry.width * scaleX);
            el.geometry.height = Math.max(10, snap.geometry.height * scaleY);
          }
          if (Number.isFinite(snap.geometry.x)) {
            el.geometry.x = originX + (snap.geometry.x - originX) * scaleX;
          }
          if (Number.isFinite(snap.geometry.y)) {
            el.geometry.y = originY + (snap.geometry.y - originY) * scaleY;
          }
          if (Number.isFinite(snap.geometry.cx)) {
            el.geometry.cx = originX + (snap.geometry.cx - originX) * scaleX;
            if (Number.isFinite(snap.geometry.rx)) el.geometry.rx = Math.max(2, snap.geometry.rx * scaleX);
            if (Number.isFinite(snap.geometry.ry)) el.geometry.ry = Math.max(2, snap.geometry.ry * scaleY);
            if (Number.isFinite(snap.geometry.r)) el.geometry.r = Math.max(2, snap.geometry.r * ((scaleX + scaleY) / 2));
          }
          if (Number.isFinite(snap.geometry.x1)) {
            el.geometry.x1 = originX + (snap.geometry.x1 - originX) * scaleX;
            el.geometry.y1 = originY + (snap.geometry.y1 - originY) * scaleY;
            el.geometry.x2 = originX + (snap.geometry.x2 - originX) * scaleX;
            el.geometry.y2 = originY + (snap.geometry.y2 - originY) * scaleY;
          }
          if ((el.type === "text" || el.svgTag === "text") && snap.style) {
            const baseFontSize = snap.style.fontSize || snap.style.size || 24;
            const baseWidth = snap.geometry?.scaleX || 1;
            const baseHeight = snap.geometry?.scaleY || 1;

            el.geometry.scaleX = Math.max(0.1, baseWidth * scaleX);
            el.geometry.scaleY = Math.max(0.1, baseHeight * scaleY);

            el.style = {
              ...snap.style,
              fontSize: Math.max(8, Math.round(baseFontSize * Math.sqrt(scaleX * scaleY))),
              size: Math.max(8, Math.round(baseFontSize * Math.sqrt(scaleX * scaleY)))
            };
          }
        }
      }

      this.moved = true;
      this.engine.renderer.renderActiveLayer(layer);
      this.renderOverlay();
      return true;
    }

    return false;
  }

  up() {
    if (!this.pointerDown) return false;
    this.pointerDown = false;
    this.dragMode = null;
    this.activeHandle = null;

    if (this.moved) {
      this.engine.document.touch?.();
      this.engine.commitHistory();
      this.engine.renderer.render(this.engine.document);
      this.renderOverlay();
      this.emitChange();
    }

    const changed = this.moved;
    this.moved = false;
    return changed;
  }


  beginMultiTouch(pointers) {
    if (!Array.isArray(pointers) || pointers.length < 2) return false;

    const layer = this.getLayer();
    if (!layer || layer.locked || !this.selectedIds.size) return false;

    const first = pointers[0];
    const second = pointers[1];

    const firstPoint = this.engine.getWorldPoint({
      clientX: first.clientX ?? first.x,
      clientY: first.clientY ?? first.y
    });

    const secondPoint = this.engine.getWorldPoint({
      clientX: second.clientX ?? second.x,
      clientY: second.clientY ?? second.y
    });

    if (!firstPoint || !secondPoint) return false;

    const dx = secondPoint.x - firstPoint.x;
    const dy = secondPoint.y - firstPoint.y;
    const startDistance = Math.hypot(dx, dy);

    if (!Number.isFinite(startDistance) || startDistance <= 0) return false;

    const elements = new Map();

    for (const el of this.getSelectedElements()) {
      elements.set(el.id, {
        transform: el.transform || "",
        points: Array.isArray(el.points) ? el.points.map(p => ({ ...p })) : null,
        path: el.path
      });
    }

    if (!elements.size) return false;

    this.multiTouchSnapshot = {
      layer,
      elements,
      startDistance,
      startAngle: Math.atan2(dy, dx),
      startCenter: {
        x: (firstPoint.x + secondPoint.x) / 2,
        y: (firstPoint.y + secondPoint.y) / 2
      }
    };

    this.pointerDown = false;
    this.initialSnapshot.clear();
    this.moved = false;

    return true;
  }

  updateMultiTouch(pointers) {
    const snapshot = this.multiTouchSnapshot;

    if (!snapshot || !Array.isArray(pointers) || pointers.length < 2) {
      return false;
    }

    const first = pointers[0];
    const second = pointers[1];

    const firstPoint = this.engine.getWorldPoint({
      clientX: first.clientX ?? first.x,
      clientY: first.clientY ?? first.y
    });

    const secondPoint = this.engine.getWorldPoint({
      clientX: second.clientX ?? second.x,
      clientY: second.clientY ?? second.y
    });

    if (!firstPoint || !secondPoint) return false;

    const dx = secondPoint.x - firstPoint.x;
    const dy = secondPoint.y - firstPoint.y;
    const currentDistance = Math.hypot(dx, dy);

    if (!Number.isFinite(currentDistance) || currentDistance <= 0) {
      return false;
    }

    const factor = Math.max(
      0.05,
      Math.min(20, currentDistance / snapshot.startDistance)
    );

    let angle = Math.atan2(dy, dx) - snapshot.startAngle;

    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;

    const currentCenter = {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2
    };

    const moveX = currentCenter.x - snapshot.startCenter.x;
    const moveY = currentCenter.y - snapshot.startCenter.y;

    for (const el of this.getSelectedElements()) {
      const original = snapshot.elements.get(el.id);
      if (!original) continue;

      const transform = [
        `translate(${moveX} ${moveY})`,
        `translate(${snapshot.startCenter.x} ${snapshot.startCenter.y})`,
        `rotate(${angle * 180 / Math.PI})`,
        `scale(${factor})`,
        `translate(${-snapshot.startCenter.x} ${-snapshot.startCenter.y})`,
        original.transform
      ].filter(Boolean).join(" ");

      if (el.type === "stroke" && Array.isArray(original.points)) {
        el.points = original.points.map(p => {
          const x = p.x - snapshot.startCenter.x;
          const y = p.y - snapshot.startCenter.y;
          const scaledX = x * factor, scaledY = y * factor;
          const rotatedX = scaledX * Math.cos(angle) - scaledY * Math.sin(angle);
          const rotatedY = scaledX * Math.sin(angle) + scaledY * Math.cos(angle);
          return {
            ...p,
            x: snapshot.startCenter.x + rotatedX + moveX,
            y: snapshot.startCenter.y + rotatedY + moveY
          };
        });
        el.path = original.path;
      }
      el.transform = transform;
    }

    this.moved = true;
    this.engine.renderer.renderActiveLayer(snapshot.layer);
    this.renderOverlay();

    return true;
  }

  endMultiTouch() {
    if (!this.multiTouchSnapshot) return false;

    const changed = this.moved;
    this.multiTouchSnapshot = null;
    this.moved = false;

    if (changed) {
      this.engine.document.touch?.();
      this.engine.commitHistory();
      this.engine.renderer.render(this.engine.document);
      this.renderOverlay();
      this.emitChange();
    }

    return changed;
  }

  deleteSelected() {
    const layer = this.getLayer();
    if (!layer || !this.selectedIds.size) return false;

    layer.elements = layer.elements.filter(el => !this.selectedIds.has(el.id));
    this.clearSelection();
    this.engine.document.touch?.();
    this.engine.commitHistory();
    this.engine.renderer.render(this.engine.document);
    return true;
  }

  duplicateSelected() {
    const layer = this.getLayer();
    if (!layer || !this.selectedIds.size) return false;

    const newIds = new Set();
    const cloned = [];

    for (const el of this.getSelectedElements()) {
      const copy = EngineUtils.clone(el);
      copy.id = EngineUtils.createId(copy.type || "element");
      if (copy.type === "stroke" && Array.isArray(copy.points)) {
        // Keep hit-testing/bounds samples in sync while retaining the exact outline.
        copy.points = copy.points.map(p => ({ ...p, x: p.x + 20, y: p.y + 20 }));
        copy.transform = [`translate(20 20)`, copy.transform].filter(Boolean).join(" ");
      } else if (Array.isArray(copy.points)) {
        copy.points = copy.points.map(p => ({ ...p, x: p.x + 20, y: p.y + 20 }));
        copy.path = this.engine.buildPath(copy.points);
      } else if (copy.geometry) {
        if (Number.isFinite(copy.geometry.x)) copy.geometry.x += 20;
        if (Number.isFinite(copy.geometry.y)) copy.geometry.y += 20;
      }
      cloned.push(copy);
      newIds.add(copy.id);
    }

    layer.elements.push(...cloned);
    this.selectedIds = newIds;
    this.engine.document.touch?.();
    this.engine.commitHistory();
    this.engine.renderer.render(this.engine.document);
    this.renderOverlay();
    this.emitChange();
    return true;
  }

  cancel() {
    // Cancel the current pointer gesture without clearing the selection.
    this.pointerDown = false;
    this.dragMode = null;
    this.activeHandle = null;
    this.initialSnapshot.clear();
    this.moved = false;

    this.renderOverlay();
    this.emitChange();
    return true;
  }

  destroy() {
    this.clearSelection();
    super.destroy();
  }
}

/* =========================================================
   9. LASSO (التحديد الحر)
========================================================= */

export class Lasso extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "lasso";
    this.points = [];
    this.selectedIds = new Set();
    this.drawing = false;
  }

  renderTrail() {
    const viewport = this.engine.renderer?.viewport;
    if (!viewport) return;

    let trail = viewport.querySelector("#lassoTrail");
    if (!this.drawing || this.points.length < 2) {
      if (trail) trail.remove();
      return;
    }

    if (!trail) {
      trail = document.createElementNS("http://www.w3.org/2000/svg", "path");
      trail.id = "lassoTrail";
      trail.setAttribute("stroke", "#2563eb");
      trail.setAttribute("stroke-width", "2");
      trail.setAttribute("stroke-dasharray", "6 4");
      trail.setAttribute("stroke-linecap", "round");
      trail.setAttribute("stroke-linejoin", "round");
      trail.setAttribute("fill", "rgba(37, 99, 235, 0.12)");
      trail.setAttribute("pointer-events", "none");
      viewport.appendChild(trail);
    }

    const d = this.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
    trail.setAttribute("d", d);
  }

  clearTrail() {
    const viewport = this.engine.renderer?.viewport;
    const trail = viewport?.querySelector("#lassoTrail");
    if (trail) trail.remove();
  }

  down(event) {
    const point = ToolUtils.eventPoint(this.engine, event);
    if (!point) return false;
    this.clearTrail();
    this.points = [point];
    this.drawing = true;
    return true;
  }

  move(event) {
    if (!this.drawing) return false;
    const point = ToolUtils.eventPoint(this.engine, event);
    if (!point) return false;

    const previous = this.points.at(-1);
    if (previous && ToolUtils.distance(previous, point) < 2) return false;

    this.points.push(point);
    this.renderTrail();
    return true;
  }

  up(event) {
    if (!this.drawing) return false;
    const point = ToolUtils.eventPoint(this.engine, event);
    if (point) this.points.push(point);
    this.drawing = false;
    this.clearTrail();

    const layer = this.engine.activeLayer;
    if (!layer) return false;

    this.selectedIds.clear();

    if (this.points.length >= 3) {
      for (const element of layer.elements) {
        if (!element || element.visible === false) continue;

        if (Array.isArray(element.points) && element.points.length > 0) {
          const intersects = element.points.some(p =>
            HitTesting.pointInPolygon(p, this.points)
          );
          if (intersects) {
            this.selectedIds.add(element.id);
          }
        } else if (element.geometry) {
          const g = element.geometry;
          const x = g.x ?? (g.cx ? g.cx - (g.rx || g.r || 10) : (g.x1 ?? 0));
          const y = g.y ?? (g.cy ? g.cy - (g.ry || g.r || 10) : (g.y1 ?? 0));
          const w = g.width ?? (g.rx ? g.rx * 2 : Math.abs((g.x2 ?? 0) - (g.x1 ?? 0)));
          const h = g.height ?? (g.ry ? g.ry * 2 : Math.abs((g.y2 ?? 0) - (g.y1 ?? 0)));

          const corners = [
            { x: x + w / 2, y: y + h / 2 },
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h }
          ];

          if (corners.some(c => HitTesting.pointInPolygon(c, this.points))) {
            this.selectedIds.add(element.id);
          }
        }
      }
    }

    this.points = [];

    // Transfer selection directly to Selector tool and show overlay
    const tm = this.toolManager || this.engine.toolManager || window.rasem?.tools;
    const selector = tm?.getTool?.("selector") || tm?.get?.("selector");
    if (selector && this.selectedIds.size > 0) {
      selector.setSelection(this.selectedIds);
      tm?.activate?.("selector");
    }

    return this.selectedIds.size > 0;
  }

  cancel() {
    this.drawing = false;
    this.points = [];
    this.clearTrail();
    return true;
  }

  clearSelection() {
    this.selectedIds.clear();
    this.clearTrail();
  }

  destroy() {
    this.cancel();
    this.clearSelection();
    super.destroy();
  }
}

/* =========================================================
   9. SHAPES
========================================================= */

export class Shapes extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    this.name = "shapes";

    this.shape = "rect";
    this.strokeWidth = 3;
    this.strokeColor = null;
    this.fillEnabled = false;
    this.fillColor = "#2563eb";
    this.strokeStyle = "solid";
    this.dashArray = "";
    this.cornerRadius = 0;

    this.startPoint = null;
    this.currentPoint = null;

    this.drawing = false;
    this.previewId = null;

    try {
      const saved = JSON.parse(localStorage.getItem("rasem-shapes-options-v1") || "{}");
      if (saved.shape) this.shape = saved.shape;
      if (Number.isFinite(saved.strokeWidth)) this.strokeWidth = saved.strokeWidth;
      if (typeof saved.fillEnabled === "boolean") this.fillEnabled = saved.fillEnabled;
      if (saved.fillColor) this.fillColor = saved.fillColor;
      if (saved.strokeStyle) this.strokeStyle = saved.strokeStyle;
      if (Number.isFinite(saved.cornerRadius)) this.cornerRadius = saved.cornerRadius;
    } catch {}
  }

  setShape(shape) {
    const allowed = [
      "rect",
      "ellipse",
      "circle",
      "line",
      "triangle",
      "square",
      "diamond",
      "curve",
      "arrow"
    ];

    if (!allowed.includes(shape)) {
      return false;
    }

    this.shape = shape;
    this.saveOptions();
    return true;
  }

  setOptions(options = {}) {
    if (typeof options.shape === "string") this.setShape(options.shape);
    if (Number.isFinite(options.strokeWidth)) this.strokeWidth = Math.max(0.5, options.strokeWidth);
    if (typeof options.fillEnabled === "boolean") this.fillEnabled = options.fillEnabled;
    if (typeof options.fillColor === "string") this.fillColor = options.fillColor;
    if (typeof options.strokeColor === "string") this.strokeColor = options.strokeColor;
    if (typeof options.strokeStyle === "string") this.strokeStyle = options.strokeStyle;
    if (typeof options.dashArray === "string") this.dashArray = options.dashArray;
    if (Number.isFinite(options.cornerRadius)) this.cornerRadius = Math.max(0, options.cornerRadius);
    this.saveOptions();
  }

  saveOptions() {
    try {
      localStorage.setItem("rasem-shapes-options-v1", JSON.stringify({
        shape: this.shape,
        strokeWidth: this.strokeWidth,
        fillEnabled: this.fillEnabled,
        fillColor: this.fillColor,
        strokeStyle: this.strokeStyle,
        cornerRadius: this.cornerRadius
      }));
    } catch {}
  }

  getDashArray() {
    if (this.strokeStyle === "dashed") return "8 5";
    if (this.strokeStyle === "dotted") return "3 3";
    return this.dashArray || "";
  }

  activate() {
    super.activate();

    this.engine.setSettings({
      tool: "shape",
      pressureEnabled: false
    });
  }

  createShape(a, b) {
    const strokeW = Number.isFinite(this.strokeWidth) && this.strokeWidth > 0
      ? this.strokeWidth
      : (this.engine.settings.size || 3);

    const strokeC = this.strokeColor || this.engine.settings.color || "#111111";

    const isNonClosed = ["line", "curve", "arrow"].includes(this.shape);
    const fill = (!isNonClosed && this.fillEnabled)
      ? (this.fillColor || "#2563eb")
      : "none";

    const style = {
      color: strokeC,
      size: strokeW,
      opacity: this.engine.settings.opacity ?? 1,
      fill,
      dashArray: this.getDashArray(),
      lineCap: "round",
      lineJoin: "round"
    };

    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);

    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);

    const base = {
      id: this.previewId,
      type: "shape",
      tool: "shapes",
      style
    };

    if (this.shape === "rect") {
      const geom = {
        x: left,
        y: top,
        width,
        height
      };
      if (this.cornerRadius > 0) {
        geom.rx = Math.min(this.cornerRadius, width / 2, height / 2);
        geom.ry = Math.min(this.cornerRadius, width / 2, height / 2);
      }
      return {
        ...base,
        svgTag: "rect",
        geometry: geom
      };
    }

    // Square: equal width and height
    if (this.shape === "square") {
      const side = Math.max(width, height);
      const geom = {
        x: a.x <= b.x ? a.x : a.x - side,
        y: a.y <= b.y ? a.y : a.y - side,
        width: side,
        height: side
      };
      if (this.cornerRadius > 0) {
        geom.rx = Math.min(this.cornerRadius, side / 2);
        geom.ry = Math.min(this.cornerRadius, side / 2);
      }
      return {
        ...base,
        svgTag: "rect",
        geometry: geom
      };
    }

    // Triangle
    if (this.shape === "triangle") {
      return {
        ...base,
        svgTag: "polygon",
        geometry: {
          points: `${(a.x+b.x)/2},${top} ${left+width},${top+height} ${left},${top+height}`
        }
      };
    }

    // Diamond
    if (this.shape === "diamond") {
      return {
        ...base,
        svgTag: "polygon",
        geometry: {
          points: `${(a.x+b.x)/2},${top} ${left+width},${(a.y+b.y)/2} ${(a.x+b.x)/2},${top+height} ${left},${(a.y+b.y)/2}`
        }
      };
    }

    // Curved line
    if (this.shape === "curve") {
      const controlX = (a.x+b.x)/2;
      const controlY = Math.min(a.y,b.y) - height * 0.5;

      return {
        ...base,
        svgTag: "path",
        geometry: {
          d: `M ${a.x} ${a.y} Q ${controlX} ${controlY} ${b.x} ${b.y}`
        }
      };
    }

    // Arrow
    if (this.shape === "arrow") {
      const dx = b.x-a.x;
      const dy = b.y-a.y;
      const length = Math.hypot(dx,dy) || 1;
      const ux = dx/length;
      const uy = dy/length;
      const head = Math.min(20,length*0.3);
      const px = -uy*head*0.5;
      const py = ux*head*0.5;
      const bx = b.x-ux*head;
      const by = b.y-uy*head;

      return {
        ...base,
        svgTag: "path",
        geometry: {
          d: `M ${a.x} ${a.y} L ${b.x} ${b.y} M ${bx+px} ${by+py} L ${b.x} ${b.y} L ${bx-px} ${by-py}`
        }
      };
    }

    if (this.shape === "ellipse") {
      return {
        ...base,
        svgTag: "ellipse",
        geometry: {
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          rx: width / 2,
          ry: height / 2
        }
      };
    }

    if (this.shape === "circle") {
      const radius = Math.min(width, height) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;

      return {
        ...base,
        svgTag: "ellipse",
        geometry: {
          cx: a.x + Math.sign(dx || 1) * radius,
          cy: a.y + Math.sign(dy || 1) * radius,
          rx: radius,
          ry: radius
        }
      };
    }

    return {
      ...base,
      svgTag: "line",
      geometry: {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y
      }
    };
  }

  down(event) {
    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    this.startPoint = point;
    this.currentPoint = point;

    this.previewId = ToolUtils.id("shape-preview");
    this.drawing = true;

    return true;
  }

  move(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    this.currentPoint = point;

    const shape = this.createShape(
      this.startPoint,
      this.currentPoint
    );

    return this.engine.renderer.updateElement(shape);
  }

  up(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (point) {
      this.currentPoint = point;
    }

    const layer = this.engine.activeLayer;

    if (!layer || layer.locked || layer.visible === false) {
      this.cancel();
      return false;
    }

    const distance = ToolUtils.distance(
      this.startPoint,
      this.currentPoint
    );

    if (distance < 0.5) {
      this.cancel();
      return false;
    }

    const shape = this.createShape(
      this.startPoint,
      this.currentPoint
    );

    // إزالة معرف المعاينة واستبداله بمعرف نهائي.
    shape.id = ToolUtils.id("shape");

    let added = false;

    if (typeof this.engine.document.addElement === "function") {
      added = this.engine.document.addElement(shape);
    } else {
      layer.elements.push(ToolUtils.clone(shape));
      this.engine.document.touch?.();
      added = true;
    }

    this.engine.renderer.clearPreview(this.previewId);

    if (added) {
      this.engine.commitHistory();
      this.engine.renderer.render(this.engine.document);
    }

    this.reset();

    return added;
  }

  reset() {
    this.drawing = false;
    this.startPoint = null;
    this.currentPoint = null;
    this.previewId = null;
  }

  cancel() {
    if (!this.drawing) return false;

    this.engine.renderer.clearPreview(this.previewId);

    this.reset();

    return true;
  }
}

/* =========================================================
   10. HAND
========================================================= */

export class Hand extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    if (!camera) {
      throw new TypeError("Hand requires Camera");
    }

    this.name = "hand";

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  down(event) {
    if (
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return false;
    }

    this.dragging = true;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    return true;
  }

  move(event) {
    if (!this.dragging) return false;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    return this.camera.panScreen(dx, dy);
  }

  up() {
    const wasDragging = this.dragging;

    this.dragging = false;

    return wasDragging;
  }

  cancel() {
    const wasDragging = this.dragging;

    this.dragging = false;

    return wasDragging;
  }
}

/* =========================================================
   11. TEXT TOOL
========================================================= */

export class TextTool extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "text";
  }

  down(event) {
    const point = ToolUtils.eventPoint(this.engine, event);
    if (!point) return false;

    this.promptText(point);
    return true;
  }

  promptText(point) {
    const modal = document.getElementById("textInputModalBackdrop");
    const dialog = document.getElementById("textInputModal");
    const textarea = document.getElementById("textToolInput");
    const fontSelect = document.getElementById("textToolFontSize");
    const fontSizeValue = document.getElementById("textToolFontSizeVal");

    if (!modal || !dialog || !textarea || !fontSelect) {
      console.error("TextTool: نافذة إدخال النص أو عناصرها غير موجودة");
      return;
    }

    modal.hidden = false;
    dialog.hidden = false;

    textarea.value = "";

    const updateFontSize = () => {
      if (fontSizeValue) {
        fontSizeValue.textContent = `${fontSelect.value}px`;
      }
    };

    fontSelect.oninput = updateFontSize;
    updateFontSize();

    const hide = () => {
      modal.hidden = true;
      dialog.hidden = true;
    };

    const closeBtn = document.getElementById("cancelTextInputBtn");
    const cancelBtn = document.getElementById("abortTextInputBtn");
    const confirmBtn = document.getElementById("confirmTextInputBtn");

    if (closeBtn) closeBtn.onclick = hide;
    if (cancelBtn) cancelBtn.onclick = hide;

    modal.onclick = (event) => {
      if (event.target === modal) hide();
    };

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const text = textarea.value.trim();

        if (!text) {
          textarea.focus();
          return;
        }

        const fontSize = parseInt(fontSelect.value || "32", 10);
        const color = this.engine.settings?.color || "#111111";

        const element = {
          id: ToolUtils.id("text"),
          type: "text",
          svgTag: "text",
          text,
          geometry: {
            x: Math.round(point.x),
            y: Math.round(point.y)
          },
          style: {
            color,
            fill: color,
            fontSize,
            size: fontSize,
            fontFamily: "'Cairo', 'Segoe UI', system-ui, sans-serif",
            fontWeight: "600"
          }
        };

        this.engine.document.addElement(element);
        this.engine.commitHistory();
        this.engine.renderer.render(this.engine.document);
        hide();

        const selector =
          this.engine.toolManager?.get("selector") ||
          window.rasem?.tools?.get?.("selector");

        if (selector) {
          this.engine.toolManager?.activate("selector");
          selector.select(element.id);
        }
      };
    }

    setTimeout(() => textarea.focus(), 60);
  }
}

/* =========================================================
   12. TOOL MANAGER
========================================================= */

export class ToolManager {
  constructor(engine, camera) {
    if (!engine || !camera) {
      throw new TypeError(
        "ToolManager requires DrawingEngine and Camera"
      );
    }

    this.engine = engine;
    this.camera = camera;

    this.tools = new Map();

    this.activeTool = null;
    this.activeToolName = null;

    this.destroyed = false;

    this.registerDefaults();

    this.activate("pencil");
  }

  registerDefaults() {
    this.register("calligraphy", new Calligraphy(this.engine, this.camera));
    this.register("pencil", new Pencil(this.engine, this.camera));
    this.register("feather", new Feather(this.engine, this.camera));
    this.register("eraser", new Eraser(this.engine, this.camera));
    this.register("text", new TextTool(this.engine, this.camera));

    this.register("selector", new Selector(this.engine, this.camera));
    this.register("lasso", new Lasso(this.engine, this.camera));

    this.register("shapes", new Shapes(this.engine, this.camera));
    this.register("hand", new Hand(this.engine, this.camera));
  }

  register(name, tool) {
    if (
      this.destroyed ||
      typeof name !== "string" ||
      !name ||
      !tool
    ) {
      return false;
    }

    const previous = this.tools.get(name);

    if (previous) {
      previous.destroy?.();
    }

    this.engine.toolManager = this;
    tool.toolManager = this;
    this.tools.set(name, tool);

    return true;
  }

  activate(name) {
    if (this.destroyed) return false;

    const shapeAliases = {
      line: "line",
      rect: "rect",
      circle: "circle",
      ellipse: "ellipse",
      triangle: "triangle",
      square: "square",
      diamond: "diamond",
      curve: "curve",
      arrow: "arrow"
    };

    if (Object.prototype.hasOwnProperty.call(shapeAliases, name)) {
      const shapesTool = this.tools.get("shapes");
      if (!shapesTool) return false;

      shapesTool.setShape(shapeAliases[name]);

      if (this.activeTool !== shapesTool) {
        this.activeTool?.deactivate();

        if (this.engine.drawing) {
          this.engine.cancel();
        }

        this.activeTool = shapesTool;
        this.activeToolName = name;
        shapesTool.activate();
      } else {
        this.activeToolName = name;
      }

      return true;
    }

    const tool = this.tools.get(name);

    if (!tool) return false;

    if (this.activeTool === tool) {
      if (name === "eraser") {
        tool.activate();
      }
      return true;
    }

    this.activeTool?.deactivate();

    // لا نترك عملية رسم معلقة عند تبديل الأداة.
    if (this.engine.drawing) {
      this.engine.cancel();
    }

    this.activeTool = tool;
    this.activeToolName = name;

    tool.activate();

    window.dispatchEvent(new CustomEvent("rasem:tool-changed", {
      detail: { tool: name }
    }));

    if (name !== "hand" && name !== "selector" && name !== "lasso") {
      window.rasem = window.rasem || {};
      window.rasem.lastDrawingTool = name;
    }

    return true;
  }

  setTool(name) {
    return this.activate(name);
  }

  get(name) {
    return this.getTool(name);
  }

  getTool(name) {
    return this.tools.get(name) || null;
  }

  handleDown(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.down(event);
  }

  handleMove(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.move(event);
  }

  handleUp(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.up(event);
  }

  handleCancel() {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.cancel();
  }

  handleMultitouch() {
    if (this.destroyed) return false;

    if (this.engine.drawing) {
      this.engine.cancel();
    }

    this.activeTool?.cancel();

    return true;
  }

  setShape(shape) {
    const tool = this.getTool("shapes");

    return tool?.setShape(shape) ?? false;
  }

  deleteSelection() {
    const selector = this.getTool("selector");
    const lasso = this.getTool("lasso");

    let changed = false;

    if (selector?.selectedIds.size) {
      changed = selector.deleteSelection();
    } else if (lasso?.selectedIds.size) {
      const layer = this.engine.activeLayer;

      if (!layer || layer.locked) return false;

      const ids = lasso.selectedIds;

      const before = layer.elements.length;

      layer.elements = layer.elements.filter(
        element => !ids.has(element.id)
      );

      changed = layer.elements.length !== before;

      if (changed) {
        this.engine.document.touch?.();
        this.engine.commitHistory();
        this.engine.renderer.render(this.engine.document);
      }

      lasso.clearSelection();
    }

    return changed;
  }

  getSelectedElements() {
    const selector = this.getTool("selector");
    const lasso = this.getTool("lasso");

    if (selector?.selectedIds.size) {
      return selector.getSelectedElements();
    }

    if (lasso?.selectedIds.size) {
      return lasso.getSelection();
    }

    return [];
  }

  destroy() {
    if (this.destroyed) return;

    this.activeTool?.cancel();

    for (const tool of this.tools.values()) {
      tool.destroy?.();
    }

    this.tools.clear();

    this.activeTool = null;
    this.activeToolName = null;

    this.engine = null;
    this.camera = null;

    this.destroyed = true;
  }
}


/* =========================================================
   RASEM 2.0
   js/precision.js

   Grid
   Snapping
   Guides
   Measurement
   ========================================================= */

// =========================================================
// UTILITIES
// =========================================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validNumber(value, fallback = 0) {
  return Number.isFinite(Number(value))
    ? Number(value)
    : fallback;
}

function validPoint(point) {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

function distance(a, b) {
  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function clonePoint(point) {
  return {
    x: point.x,
    y: point.y
  };
}

// =========================================================
// GRID
// =========================================================

export class Grid {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;

    this.size = clamp(
      validNumber(options.size, 20),
      1,
      10000
    );

    this.subdivisions = clamp(
      Math.floor(validNumber(options.subdivisions, 4)),
      1,
      20
    );

    this.origin = {
      x: validNumber(options.origin?.x),
      y: validNumber(options.origin?.y)
    };

    this.visible = options.visible ?? true;

    this.color = options.color || "#808080";

    this.opacity = clamp(
      validNumber(options.opacity, 0.25),
      0,
      1
    );

    this.snap = options.snap ?? false;
  }

  configure(options = {}) {
    if (typeof options.enabled === "boolean") {
      this.enabled = options.enabled;
    }

    if (typeof options.visible === "boolean") {
      this.visible = options.visible;
    }

    if (typeof options.snap === "boolean") {
      this.snap = options.snap;
    }

    if (Number.isFinite(options.size)) {
      this.size = clamp(options.size, 1, 10000);
    }

    if (Number.isFinite(options.subdivisions)) {
      this.subdivisions = clamp(
        Math.floor(options.subdivisions),
        1,
        20
      );
    }

    if (options.origin && validPoint(options.origin)) {
      this.origin = clonePoint(options.origin);
    }

    if (typeof options.color === "string") {
      this.color = options.color;
    }

    if (Number.isFinite(options.opacity)) {
      this.opacity = clamp(options.opacity, 0, 1);
    }

    return this;
  }

  get minorSize() {
    return this.size / this.subdivisions;
  }

  snapValue(value, spacing = this.size, origin = 0) {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(spacing) ||
      spacing <= 0
    ) {
      return value;
    }

    return origin +
      Math.round((value - origin) / spacing) * spacing;
  }

  snapPoint(point, spacing = this.size) {
    if (!validPoint(point)) return null;

    return {
      x: this.snapValue(
        point.x,
        spacing,
        this.origin.x
      ),
      y: this.snapValue(
        point.y,
        spacing,
        this.origin.y
      )
    };
  }

  snapMinor(point) {
    return this.snapPoint(point, this.minorSize);
  }

  getLines(bounds, options = {}) {
    if (
      !bounds ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    ) {
      return {
        vertical: [],
        horizontal: []
      };
    }

    const spacing = options.minor
      ? this.minorSize
      : this.size;

    const startX = bounds.x ?? 0;
    const startY = bounds.y ?? 0;

    const endX = startX + bounds.width;
    const endY = startY + bounds.height;

    const firstX =
      Math.floor((startX - this.origin.x) / spacing);

    const lastX =
      Math.ceil((endX - this.origin.x) / spacing);

    const firstY =
      Math.floor((startY - this.origin.y) / spacing);

    const lastY =
      Math.ceil((endY - this.origin.y) / spacing);

    const vertical = [];
    const horizontal = [];

    const maxLines = 2000;

    for (
      let i = firstX;
      i <= lastX && vertical.length < maxLines;
      i++
    ) {
      vertical.push({
        x: this.origin.x + i * spacing,
        y1: startY,
        y2: endY
      });
    }

    for (
      let i = firstY;
      i <= lastY && horizontal.length < maxLines;
      i++
    ) {
      horizontal.push({
        y: this.origin.y + i * spacing,
        x1: startX,
        x2: endX
      });
    }

    return { vertical, horizontal };
  }

  toJSON() {
    return {
      enabled: this.enabled,
      size: this.size,
      subdivisions: this.subdivisions,
      origin: clonePoint(this.origin),
      visible: this.visible,
      color: this.color,
      opacity: this.opacity,
      snap: this.snap
    };
  }
}

// =========================================================
// SNAPPING
// =========================================================

export class Snapping {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;

    this.threshold = clamp(
      validNumber(options.threshold, 8),
      0,
      200
    );

    this.grid = options.grid || null;

    this.snapToGrid = options.snapToGrid ?? true;
    this.snapToGuides = options.snapToGuides ?? true;
    this.snapToObjects = options.snapToObjects ?? true;

    this.guides = options.guides || null;

    this.objects = [];

    this.lastResult = null;
  }

  configure(options = {}) {
    if (typeof options.enabled === "boolean") {
      this.enabled = options.enabled;
    }

    if (Number.isFinite(options.threshold)) {
      this.threshold = clamp(
        options.threshold,
        0,
        200
      );
    }

    if (typeof options.snapToGrid === "boolean") {
      this.snapToGrid = options.snapToGrid;
    }

    if (typeof options.snapToGuides === "boolean") {
      this.snapToGuides = options.snapToGuides;
    }

    if (typeof options.snapToObjects === "boolean") {
      this.snapToObjects = options.snapToObjects;
    }

    return this;
  }

  setGrid(grid) {
    this.grid = grid;
  }

  setGuides(guides) {
    this.guides = guides;
  }

  setObjects(objects) {
    this.objects = Array.isArray(objects)
      ? objects
      : [];
  }

  getScreenThreshold(zoom = 1) {
    return this.threshold /
      Math.max(0.01, validNumber(zoom, 1));
  }

  findNearest(value, candidates, threshold) {
    let best = null;
    let bestDistance = threshold;

    for (const candidate of candidates) {
      if (!Number.isFinite(candidate)) continue;

      const currentDistance = Math.abs(
        value - candidate
      );

      if (currentDistance <= bestDistance) {
        bestDistance = currentDistance;
        best = candidate;
      }
    }

    return best;
  }

  getObjectAnchors(excludedId = null) {
    const anchors = {
      x: [],
      y: []
    };

    for (const object of this.objects) {
      if (!object || object.id === excludedId) continue;

      const bounds = object.bounds;

      if (
        !bounds ||
        !Number.isFinite(bounds.x) ||
        !Number.isFinite(bounds.y) ||
        !Number.isFinite(bounds.width) ||
        !Number.isFinite(bounds.height)
      ) {
        continue;
      }

      anchors.x.push(
        bounds.x,
        bounds.x + bounds.width / 2,
        bounds.x + bounds.width
      );

      anchors.y.push(
        bounds.y,
        bounds.y + bounds.height / 2,
        bounds.y + bounds.height
      );
    }

    return anchors;
  }

  snap(point, options = {}) {
    if (!validPoint(point)) return null;

    if (!this.enabled) {
      this.lastResult = {
        point: clonePoint(point),
        snapped: false,
        axes: []
      };

      return clonePoint(point);
    }

    const zoom = validNumber(options.zoom, 1);

    const threshold = this.getScreenThreshold(zoom);

    const result = clonePoint(point);

    const axes = [];

    if (
      this.snapToGrid &&
      this.grid?.enabled &&
      this.grid.snap
    ) {
      const snapped = this.grid.snapPoint(result);

      if (snapped) {
        if (Math.abs(snapped.x - result.x) <= threshold) {
          result.x = snapped.x;
          axes.push({
            axis: "x",
            type: "grid",
            value: snapped.x
          });
        }

        if (Math.abs(snapped.y - result.y) <= threshold) {
          result.y = snapped.y;
          axes.push({
            axis: "y",
            type: "grid",
            value: snapped.y
          });
        }
      }
    }

    if (this.snapToGuides && this.guides) {
      const guideResult = this.guides.snapPoint(
        result,
        threshold
      );

      if (guideResult) {
        result.x = guideResult.point.x;
        result.y = guideResult.point.y;

        axes.push(...guideResult.axes);
      }
    }

    if (this.snapToObjects) {
      const anchors = this.getObjectAnchors(
        options.excludeId
      );

      const x = this.findNearest(
        result.x,
        anchors.x,
        threshold
      );

      const y = this.findNearest(
        result.y,
        anchors.y,
        threshold
      );

      if (x !== null) {
        result.x = x;

        axes.push({
          axis: "x",
          type: "object",
          value: x
        });
      }

      if (y !== null) {
        result.y = y;

        axes.push({
          axis: "y",
          type: "object",
          value: y
        });
      }
    }

    this.lastResult = {
      point: clonePoint(result),
      snapped: axes.length > 0,
      axes
    };

    return result;
  }

  getResult() {
    return this.lastResult
      ? cloneDataSafe(this.lastResult)
      : null;
  }

  reset() {
    this.lastResult = null;
  }
}

function cloneDataSafe(value) {
  return structuredClone(value);
}

// =========================================================
// GUIDES
// =========================================================

export class Guides {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;

    this.visible = options.visible ?? true;

    this.guides = [];

    this.nextId = 1;

    if (Array.isArray(options.guides)) {
      for (const guide of options.guides) {
        this.add(guide);
      }
    }
  }

  add(options = {}) {
    if (!["vertical", "horizontal"].includes(options.type)) {
      return null;
    }

    const position = Number(options.position);

    if (!Number.isFinite(position)) {
      return null;
    }

    const guide = {
      id: options.id || `guide-${this.nextId++}`,
      type: options.type,
      position,
      color: options.color || "#00a8ff",
      locked: options.locked === true
    };

    if (this.guides.some(item => item.id === guide.id)) {
      return null;
    }

    this.guides.push(guide);

    return { ...guide };
  }

  addVertical(x, options = {}) {
    return this.add({
      ...options,
      type: "vertical",
      position: x
    });
  }

  addHorizontal(y, options = {}) {
    return this.add({
      ...options,
      type: "horizontal",
      position: y
    });
  }

  get(id) {
    return this.guides.find(
      guide => guide.id === id
    ) || null;
  }

  update(id, changes = {}) {
    const guide = this.get(id);

    if (!guide || guide.locked) return false;

    if (Number.isFinite(changes.position)) {
      guide.position = changes.position;
    }

    if (typeof changes.color === "string") {
      guide.color = changes.color;
    }

    return true;
  }

  remove(id) {
    const index = this.guides.findIndex(
      guide => guide.id === id
    );

    if (index === -1 || this.guides[index].locked) {
      return false;
    }

    this.guides.splice(index, 1);

    return true;
  }

  clear() {
    const previous = this.guides.length;

    this.guides = this.guides.filter(
      guide => guide.locked
    );

    return previous !== this.guides.length;
  }

  snapPoint(point, threshold) {
    if (!this.enabled || !validPoint(point)) {
      return null;
    }

    const result = clonePoint(point);
    const axes = [];

    for (const guide of this.guides) {
      if (guide.type === "vertical") {
        if (Math.abs(point.x - guide.position) <= threshold) {
          result.x = guide.position;

          axes.push({
            axis: "x",
            type: "guide",
            id: guide.id,
            value: guide.position
          });
        }
      }

      if (guide.type === "horizontal") {
        if (Math.abs(point.y - guide.position) <= threshold) {
          result.y = guide.position;

          axes.push({
            axis: "y",
            type: "guide",
            id: guide.id,
            value: guide.position
          });
        }
      }
    }

    return axes.length
      ? { point: result, axes }
      : null;
  }

  getLines(bounds) {
    if (!bounds) return [];

    return this.guides.map(guide => {
      if (guide.type === "vertical") {
        return {
          id: guide.id,
          type: guide.type,
          x1: guide.position,
          y1: bounds.y,
          x2: guide.position,
          y2: bounds.y + bounds.height,
          color: guide.color
        };
      }

      return {
        id: guide.id,
        type: guide.type,
        x1: bounds.x,
        y1: guide.position,
        x2: bounds.x + bounds.width,
        y2: guide.position,
        color: guide.color
      };
    });
  }

  toJSON() {
    return {
      enabled: this.enabled,
      visible: this.visible,
      guides: this.guides.map(
        guide => ({ ...guide })
      )
    };
  }
}

// =========================================================
// MEASUREMENT
// =========================================================

export class Measurement {
  constructor(options = {}) {
    this.unit = options.unit || "px";

    this.scale = clamp(
      validNumber(options.scale, 1),
      0.0001,
      1000000
    );

    this.precision = clamp(
      Math.floor(validNumber(options.precision, 2)),
      0,
      8
    );

    this.active = false;

    this.startPoint = null;
    this.endPoint = null;

    this.measurements = [];
  }

  configure(options = {}) {
    if (typeof options.unit === "string") {
      this.unit = options.unit;
    }

    if (Number.isFinite(options.scale)) {
      if (options.scale <= 0) return false;

      this.scale = clamp(
        options.scale,
        0.0001,
        1000000
      );
    }

    if (Number.isFinite(options.precision)) {
      this.precision = clamp(
        Math.floor(options.precision),
        0,
        8
      );
    }

    return true;
  }

  start(point) {
    if (!validPoint(point)) return false;

    this.startPoint = clonePoint(point);
    this.endPoint = clonePoint(point);

    this.active = true;

    return true;
  }

  update(point) {
    if (!this.active || !validPoint(point)) {
      return false;
    }

    this.endPoint = clonePoint(point);

    return true;
  }

  calculate(a = this.startPoint, b = this.endPoint) {
    if (!validPoint(a) || !validPoint(b)) {
      return null;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const rawDistance = Math.hypot(dx, dy);

    const length = rawDistance * this.scale;

    const angle = Math.atan2(dy, dx) *
      (180 / Math.PI);

    return {
      dx,
      dy,
      distance: length,
      horizontal: Math.abs(dx) * this.scale,
      vertical: Math.abs(dy) * this.scale,
      angle,
      midpoint: midpoint(a, b),
      start: clonePoint(a),
      end: clonePoint(b),
      unit: this.unit,
      formatted: this.format(length)
    };
  }

  format(value) {
    if (!Number.isFinite(value)) return "";

    return `${value.toFixed(this.precision)} ${this.unit}`;
  }

  finish() {
    if (!this.active) return null;

    const result = this.calculate();

    if (!result) {
      this.reset();
      return null;
    }

    const measurement = {
      id: `measurement-${Date.now()}-${Math.random()
        .toString(36).slice(2)}`,
      ...result
    };

    this.measurements.push(measurement);

    this.reset();

    return measurement;
  }

  add(a, b) {
    const result = this.calculate(a, b);

    if (!result) return null;

    const measurement = {
      id: `measurement-${Date.now()}-${Math.random()
        .toString(36).slice(2)}`,
      ...result
    };

    this.measurements.push(measurement);

    return measurement;
  }

  remove(id) {
    const index = this.measurements.findIndex(
      item => item.id === id
    );

    if (index === -1) return false;

    this.measurements.splice(index, 1);

    return true;
  }

  clear() {
    this.measurements = [];
  }

  reset() {
    this.active = false;
    this.startPoint = null;
    this.endPoint = null;
  }

  getCurrent() {
    return this.active
      ? this.calculate()
      : null;
  }

  toJSON() {
    return {
      unit: this.unit,
      scale: this.scale,
      precision: this.precision,
      measurements: cloneDataSafe(this.measurements)
    };
  }
}


import { ArabicWritingAssistant } from "./arabic-writing.js";

/* =========================================================
   RASEM 2.0
   ENGINE MODULE
   Smoothing + Pressure + StrokeBuilder
   + HitTesting + DrawingEngine
========================================================= */

const EngineUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },

  validPoint(point) {
    return Boolean(
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    );
  },

  distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  },

  createId(prefix = "stroke") {
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
  }
};

/* =========================================================
   1. SMOOTHING
========================================================= */

export class Smoothing {
  constructor(options = {}) {
    this.strength = EngineUtils.clamp(
      EngineUtils.number(options.strength, 0.35),
      0,
      1
    );

    this.minDistance = EngineUtils.clamp(
      EngineUtils.number(options.minDistance, 0.35),
      0,
      100
    );
  }

  distance(a, b) {
    return EngineUtils.distance(a, b);
  }

  midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      pressure: (
        EngineUtils.number(a.pressure, 0.5) +
        EngineUtils.number(b.pressure, 0.5)
      ) / 2
    };
  }

  simplify(points) {
    if (!Array.isArray(points) || points.length <= 2) {
      return Array.isArray(points) ? [...points] : [];
    }

    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      if (
        this.distance(
          result[result.length - 1],
          points[i]
        ) >= this.minDistance
      ) {
        result.push(points[i]);
      }
    }

    const last = points[points.length - 1];

    if (result[result.length - 1] !== last) {
      result.push(last);
    }

    return result;
  }

  filter(points) {
    if (!Array.isArray(points) || points.length <= 2) {
      return Array.isArray(points)
        ? points.map(point => ({ ...point }))
        : [];
    }

    const strength = EngineUtils.clamp(this.strength, 0, 1);
    let result = points.map(point => ({ ...point }));
    if (strength <= 0) return result;

    // تقدير كثافة أخذ العينات وطول الضربة لاختيار عدد تمريرات مناسب.
    let totalLength = 0;
    for (let i = 1; i < points.length; i++) {
      totalLength += this.distance(points[i - 1], points[i]);
    }
    const averageStep = totalLength / Math.max(1, points.length - 1);
    // عند 100% نرفع عدد التمريرات بوضوح، مع مراعاة أن
    // المسارات القصيرة جداً قليلة العينات لا تحتمل الإفراط في التنعيم.
    const passes = points.length < 3
      ? 1
      : (strength >= 0.95
        ? (points.length < 5 ? 1 : 6)
        : (strength >= 0.85
          ? (points.length < 5 ? 1 : 5)
          : (strength >= 0.72
            ? (points.length < 5 ? 1 : 4)
            : (strength >= 0.22 ? 2 : 1))));

    // الضربات الكثيفة تستفيد من تنعيم إضافي خفيف، أما النقاط المتباعدة
    // فلا نبالغ في تحريكها حتى لا نفقد شكل المسار الأصلي.
    const densityFactor = EngineUtils.clamp(
      1.15 - Math.max(0, averageStep - 2) * 0.035,
      0.78,
      1.15
    );
    // استجابة تصاعدية: القيم المنخفضة تبقى قريبة من سلوكها السابق،
    // بينما تزداد قوة التصحيح بقفزة واضحة قرب 100%.
    const blend = EngineUtils.clamp(
      (0.18 + strength * 0.44 + Math.pow(strength, 4) * 0.22) * densityFactor,
      0.12,
      0.86
    );

    const turnAt = (source, index) => {
      if (index <= 0 || index >= source.length - 1) return 0;
      const a = source[index - 1];
      const b = source[index];
      const c = source[index + 1];
      const ax = b.x - a.x;
      const ay = b.y - a.y;
      const bx = c.x - b.x;
      const by = c.y - b.y;
      if (Math.hypot(ax, ay) < 0.0001 || Math.hypot(bx, by) < 0.0001) return 0;
      return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    };

    for (let pass = 0; pass < passes; pass++) {
      const source = result;
      const filtered = source.map(point => ({ ...point }));

      for (let i = 1; i < source.length - 1; i++) {
        const previous = source[i - 1];
        const current = source[i];
        const next = source[i + 1];
        const turn = turnAt(source, i);

        // نحافظ على الزوايا المقصودة عندما يكون الانعطاف حاداً ومستقراً.
        // أما الانحراف الحاد الذي ينعكس مباشرة في النقطة التالية فعادةً
        // يكون اهتزازاً عابراً من اليد ويُسمح بتصحيحه.
        if (source.length >= 5 && Math.abs(turn) > 0.96) {
          const beforeTurn = turnAt(source, i - 1);
          const afterTurn = turnAt(source, i + 1);
          const isAlternatingJitter =
            beforeTurn * turn < 0 &&
            afterTurn * turn < 0 &&
            Math.abs(beforeTurn) > Math.abs(turn) * 0.28 &&
            Math.abs(afterTurn) > Math.abs(turn) * 0.28;

          if (!isAlternatingJitter) continue;
        }

        // مرشح محلي منخفض التردد: يقلل التعرجات السريعة من دون
        // تسطيح المنحنى كله أو تغيير نقطة البداية والنهاية.
        const targetX = (previous.x + 2 * current.x + next.x) / 4;
        const targetY = (previous.y + 2 * current.y + next.y) / 4;

        filtered[i].x = current.x + (targetX - current.x) * blend;
        filtered[i].y = current.y + (targetY - current.y) * blend;
      }

      result = filtered;
    }

    return result;
  }

  process(points) {
    return this.filter(this.simplify(points));
  }

  toPath(points) {
    if (!Array.isArray(points) || !points.length) {
      return "";
    }

    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x} ${p.y} l 0.01 0`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const current = points[i];
      const next = points[i + 1];

      if (next) {
        const mid = this.midpoint(current, next);

        path +=
          ` Q ${current.x} ${current.y}` +
          ` ${mid.x} ${mid.y}`;
      } else {
        path += ` L ${current.x} ${current.y}`;
      }
    }

    return path;
  }
}

/* =========================================================
   2. PRESSURE
========================================================= */

export class Pressure {
  constructor(options = {}) {
    this.min = EngineUtils.clamp(
      EngineUtils.number(options.min, 0.05),
      0,
      1
    );

    this.max = EngineUtils.clamp(
      EngineUtils.number(options.max, 1),
      this.min,
      1
    );

    this.smoothing = EngineUtils.clamp(
      EngineUtils.number(options.smoothing, 0.35),
      0,
      1
    );

    this.fallback = EngineUtils.clamp(
      EngineUtils.number(options.fallback, 0.5),
      this.min,
      this.max
    );

    this.lastPressure = this.fallback;
  }

  read(event = {}) {
    let pressure = event.pressure;

    if (
      event.pointerType !== "pen" ||
      !Number.isFinite(pressure) ||
      pressure <= 0
    ) {
      pressure = this.fallback;
    }

    pressure = EngineUtils.clamp(pressure, 0, 1);

    this.lastPressure +=
      (pressure - this.lastPressure) * this.smoothing;

    return EngineUtils.clamp(
      this.lastPressure,
      this.min,
      this.max
    );
  }

  normalize(value) {
    return EngineUtils.clamp(
      EngineUtils.number(value, this.fallback),
      0,
      1
    );
  }

  width(pressure, size, sensitivity = 1) {
    const p = this.normalize(pressure);

    const factor =
      1 - EngineUtils.clamp(sensitivity, 0, 1) +
      EngineUtils.clamp(sensitivity, 0, 1) * p;

    return Math.max(
      0.5,
      EngineUtils.number(size, 1) * factor
    );
  }

  reset() {
    this.lastPressure = this.fallback;
  }
}

/* =========================================================
   3. STROKE BUILDER
========================================================= */

export class StrokeBuilder {
  constructor(options = {}) {
    this.smoothing = new Smoothing({
      strength: options.smoothing ?? 0.3,
      minDistance: options.minDistance ?? 0.35
    });
    this.baseSmoothingStrength = this.smoothing.strength;
    this.baseSmoothingMinDistance = this.smoothing.minDistance;

    this.pressure = new Pressure();
    this.reset();
  }

  reset() {
    this.id = null;
    this.points = [];

    this.baseSize = 5;
    this.color = "#111111";
    this.opacity = 1;
    this.tool = "pen";

    this.sensitivity = 0.8;
    this.pressureEnabled = true;
    this.brushStyle = {
      lineCap: "round",
      dashArray: "",
      image: null
    };
    this.active = false;

    this.pressure.reset();
  }

  begin(point, settings = {}) {
    if (!EngineUtils.validPoint(point)) {
      return false;
    }

    this.reset();

    this.id = EngineUtils.createId();

    this.baseSize = EngineUtils.clamp(
      EngineUtils.number(settings.size, 5),
      0.5,
      500
    );

    this.color = settings.color || "#111111";

    this.opacity = EngineUtils.clamp(
      EngineUtils.number(settings.opacity, 1),
      0,
      1
    );

    this.tool = settings.tool || "pen";
    this.calligraphyAngle = settings.calligraphyAngle ?? 45;
    this.brushStyle = settings.brushStyle || null;

    this.sensitivity = EngineUtils.clamp(
      EngineUtils.number(settings.sensitivity, 0.8),
      0,
      1
    );

    this.pressureEnabled =
      settings.pressureEnabled !== false;

    this.active = true;

    return this.addPoint(point);
  }

  addPoint(point) {
    if (!this.active || !EngineUtils.validPoint(point)) {
      return false;
    }

    const previous = this.points.at(-1);

    if (
      previous &&
      EngineUtils.distance(previous, point) <
        (this.tool === "calligraphy" ? 0.02 : 0.2)
    ) {
      return false;
    }

    const pressure = this.pressureEnabled
      ? this.pressure.normalize(point.pressure)
      : 1;

    this.points.push({
      x: point.x,
      y: point.y,
      pressure,
      time: EngineUtils.number(point.time, Date.now())
    });

    return true;
  }

  getFilteredPoints() {
    const isCalligraphy = this.tool === "calligraphy";

    // استخدم قوة التصحيح نفسها لقلم الخط العربي وبقية الأقلام؛
    // خفضها سابقاً كان يترك اهتزازات المنحنيات ظاهرة.
    this.smoothing.strength = this.baseSmoothingStrength;

    this.smoothing.minDistance = isCalligraphy
      ? Math.min(this.baseSmoothingMinDistance, 0.02)
      : this.baseSmoothingMinDistance;

    return this.smoothing.process(this.points);
  }

  getCenterPath() {
    return this.smoothing.toPath(
      this.getFilteredPoints()
    );
  }

  getVariableWidthOutline() {
    const points = this.getFilteredPoints();

    if (!points.length) return "";

    if (points.length === 1) {
      const p = points[0];

      const radius = Math.max(
        0.25,
        this.pressure.width(
          p.pressure,
          this.baseSize,
          this.sensitivity
        ) / 2
      );

      return [
        `M ${p.x - radius} ${p.y}`,
        `a ${radius} ${radius} 0 1 0 ${radius * 2} 0`,
        `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`
      ].join(" ");
    }

    const left = [];
    const right = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];

      let dx = next.x - previous.x;
      let dy = next.y - previous.y;

      let length = Math.hypot(dx, dy);

      if (length < 0.0001) {
        dx = 1;
        dy = 0;
        length = 1;
      }

      const nx = -dy / length;
      const ny = dx / length;

      const radius = Math.max(
        0.25,
        this.pressure.width(
          p.pressure,
          this.baseSize,
          this.sensitivity
        ) / 2
      );

      left.push({
        x: p.x + nx * radius,
        y: p.y + ny * radius
      });

      right.push({
        x: p.x - nx * radius,
        y: p.y - ny * radius
      });
    }

    const outline = [
      ...left,
      ...right.reverse()
    ];

    return outline.map((p, index) =>
      `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    ).join(" ") + " Z";
  }

  getCalligraphyOutline() {
    const points = this.getFilteredPoints();
    if (!points.length) return "";

    const angle = Number.isFinite(this.calligraphyAngle) ? this.calligraphyAngle : 45;
    const angleRad = angle * (Math.PI / 180);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const nibWidths = {
      "cal-thuluth": 1.25,
      "cal-naskh": 1.0,
      "cal-ruqah": 0.85,
      "cal-fine": 0.60
    };

    const nibScale = nibWidths[this.brushStyle?.preset] || 1;
    const radius = Math.max(0.6, (this.baseSize / 2) * nibScale);

    const getRadius = (point) => {
      const pressureMultiplier = this.pressureEnabled
        ? (0.35 + (point.pressure || 1) * 0.65)
        : 1;
      return radius * pressureMultiplier;
    };

    // كل مقطع يُرسم كمضلع مستقل داخل مسار واحد.
    // توحيد اتجاه المضلعات يجعل تعبئتها غير الصفرية متصلة
    // ويمنع تحوّل مناطق التقاطع الذاتي إلى ثقوب.
    const makeSegment = (start, end, startRadius, endRadius) => {
      const polygon = [
        {
          x: start.x + cosA * startRadius,
          y: start.y + sinA * startRadius
        },
        {
          x: end.x + cosA * endRadius,
          y: end.y + sinA * endRadius
        },
        {
          x: end.x - cosA * endRadius,
          y: end.y - sinA * endRadius
        },
        {
          x: start.x - cosA * startRadius,
          y: start.y - sinA * startRadius
        }
      ];

      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        area += a.x * b.y - b.x * a.y;
      }

      if (area < 0) polygon.reverse();

      return polygon.map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      ).join(" ") + " Z";
    };

    const segments = [];

    if (points.length === 1) {
      const point = points[0];
      const r = getRadius(point);
      const halfLength = Math.max(0.6, r * 0.5);
      const tangentX = -sinA;
      const tangentY = cosA;

      const start = {
        x: point.x - tangentX * halfLength,
        y: point.y - tangentY * halfLength
      };
      const end = {
        x: point.x + tangentX * halfLength,
        y: point.y + tangentY * halfLength
      };

      segments.push(makeSegment(start, end, r, r));
    } else {
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1];
        const end = points[i];

        segments.push(
          makeSegment(start, end, getRadius(start), getRadius(end))
        );
      }
    }

    return segments.join(" ");
  }

  build(options = {}) {
    if (!this.id || !this.points.length) {
      return null;
    }

    const pressureEnabled =
      options.pressureEnabled ?? this.pressureEnabled;

    const isCalligraphy = this.tool === "calligraphy" || this.brushStyle?.preset === "calligraphy" || String(this.brushStyle?.preset || "").startsWith("cal-");

    const variableWidth = isCalligraphy || (
      pressureEnabled &&
      this.tool !== "marker" &&
      this.tool !== "pencil"
    );

    let path = "";
    if (isCalligraphy) {
      path = this.getCalligraphyOutline();
    } else if (variableWidth) {
      path = this.getVariableWidthOutline();
    } else {
      path = this.getCenterPath();
    }

    if (!path) return null;

    const brushStyle = this.brushStyle || {};

    return {
      id: this.id,
      type: "stroke",
      tool: this.tool,

      points: this.points.map(p => ({ ...p })),

      path,

      renderMode: (variableWidth || isCalligraphy) ? "fill" : "stroke",

      style: {
        color: this.color,
        size: this.baseSize,
        opacity: this.opacity,
        fill: (variableWidth || isCalligraphy) ? this.color : "none",
        lineCap: brushStyle.lineCap || "round",
        lineJoin: brushStyle.lineJoin || "round",
        dashArray: brushStyle.dashArray || "",
        customBrush: brushStyle.image || null,
        calligraphyClean: isCalligraphy
      }
    };
  }
}

/* =========================================================
   4. HIT TESTING
========================================================= */

export class HitTesting {
  static distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return EngineUtils.distance(point, a);
    }

    const t = EngineUtils.clamp(
      (
        (point.x - a.x) * dx +
        (point.y - a.y) * dy
      ) / lengthSquared,
      0,
      1
    );

    const nearest = {
      x: a.x + t * dx,
      y: a.y + t * dy
    };

    return EngineUtils.distance(point, nearest);
  }

  static distanceToPolyline(point, points) {
    if (!Array.isArray(points) || !points.length) {
      return Infinity;
    }

    if (points.length === 1) {
      return EngineUtils.distance(point, points[0]);
    }

    let minimum = Infinity;

    for (let i = 1; i < points.length; i++) {
      minimum = Math.min(
        minimum,
        this.distanceToSegment(
          point,
          points[i - 1],
          points[i]
        )
      );
    }

    return minimum;
  }

  static pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return false;
    }

    let inside = false;

    for (
      let i = 0, j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const intersects =
        (a.y > point.y) !== (b.y > point.y) &&
        point.x <
          (b.x - a.x) * (point.y - a.y) /
          ((b.y - a.y) || 0.0000001) + a.x;

      if (intersects) inside = !inside;
    }

    return inside;
  }

  static samplePointsFromPath(pathStr) {
    if (typeof pathStr !== "string" || !pathStr) return [];
    const points = [];
    const matches = pathStr.match(/-?\d+(?:\.\d+)?/g);
    if (matches && matches.length >= 2) {
      for (let i = 0; i < matches.length - 1; i += 2) {
        const x = Number(matches[i]);
        const y = Number(matches[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y });
        }
      }
    }
    return points;
  }

  static getElementDistance(element, point) {
    if (!element || !EngineUtils.validPoint(point)) {
      return Infinity;
    }

    const size = EngineUtils.number(element.style?.size, 3);

    // 1. Array of points (freehand drawing)
    if (Array.isArray(element.points) && element.points.length > 0) {
      const distance = this.distanceToPolyline(point, element.points);
      return Math.max(0, distance - size / 2);
    }

    // 2. SVG Path string (curves, arrows, lines, complex strokes)
    if (typeof element.path === "string" && element.path.trim().length > 0) {
      const pathPoints = this.samplePointsFromPath(element.path);
      if (pathPoints.length > 0) {
        const distance = this.distanceToPolyline(point, pathPoints);
        return Math.max(0, distance - size / 2);
      }
    }

    // 3. Geometry attributes (lines, shapes, bounding boxes)
    const geometry = element.geometry || {};

    // Line / Arrow segment geometry (x1, y1, x2, y2)
    if (
      geometry.x1 !== undefined && geometry.y1 !== undefined &&
      geometry.x2 !== undefined && geometry.y2 !== undefined
    ) {
      const p1 = { x: Number(geometry.x1), y: Number(geometry.y1) };
      const p2 = { x: Number(geometry.x2), y: Number(geometry.y2) };
      if (EngineUtils.validPoint(p1) && EngineUtils.validPoint(p2)) {
        const dist = this.distanceToSegment(point, p1, p2);
        return Math.max(0, dist - size / 2);
      }
    }

    // Text elements hit testing
    if (element.type === "text" || element.svgTag === "text") {
      const tx = EngineUtils.number(geometry.x, 0);
      const ty = EngineUtils.number(geometry.y, 0);
      const fontSize = EngineUtils.number(element.style?.fontSize || element.style?.size, 24);
      const textLen = (element.text || "").length || 4;
      const tw = textLen * fontSize * 0.65;
      const th = fontSize * 1.2;
      const closestX = EngineUtils.clamp(point.x, tx, tx + tw);
      const closestY = EngineUtils.clamp(point.y, ty - th, ty);
      const dist = EngineUtils.distance(point, { x: closestX, y: closestY });
      return Math.max(0, dist);
    }

    // Rect, Square, Image, Circle bounding box
    const x = EngineUtils.number(geometry.x, 0);
    const y = EngineUtils.number(geometry.y, 0);
    const width = EngineUtils.number(geometry.width, 0);
    const height = EngineUtils.number(geometry.height, 0);

    if (width > 0 && height > 0) {
      const closestX = EngineUtils.clamp(point.x, x, x + width);
      const closestY = EngineUtils.clamp(point.y, y, y + height);
      const dist = EngineUtils.distance(point, { x: closestX, y: closestY });
      return Math.max(0, dist - size / 2);
    }

    return Infinity;
  }

  static hitTest(elements, point, tolerance = 8) {
    if (
      !Array.isArray(elements) ||
      !EngineUtils.validPoint(point)
    ) {
      return null;
    }

    const safeTolerance = Math.max(
      0,
      EngineUtils.number(tolerance, 8)
    );

    // البحث من الأعلى إلى الأسفل حسب ترتيب الرسم.
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];

      if (!element || element.visible === false) {
        continue;
      }

      const distance = this.getElementDistance(
        element,
        point
      );

      if (distance <= safeTolerance) {
        return element;
      }
    }

    return null;
  }
}

/* =========================================================
   AUTO SHAPE RECOGNITION
   Converts a held, completed hand-drawn shape into clean geometry.
========================================================= */

function shapePointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function simplifyShapePath(points, tolerance) {
  if (points.length <= 2) return points.slice();

  let farthestIndex = 0;
  let farthestDistance = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lengthSquared = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    let distance;
    if (lengthSquared < 0.0001) {
      distance = shapePointDistance(first, points[i]);
    } else {
      const t = EngineUtils.clamp(
        ((points[i].x - first.x) * dx + (points[i].y - first.y) * dy) /
          lengthSquared,
        0,
        1
      );
      distance = Math.hypot(
        points[i].x - (first.x + t * dx),
        points[i].y - (first.y + t * dy)
      );
    }
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = i;
    }
  }

  if (farthestDistance <= tolerance) return [first, last];

  const left = simplifyShapePath(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyShapePath(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function interpolateShapeEdges(vertices, pressure, stepsPerEdge = 5) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    for (let step = 0; step < stepsPerEdge; step++) {
      const t = step / stepsPerEdge;
      result.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure,
        time: Date.now()
      });
    }
  }
  return result;
}

function recognizeHeldShape(sourcePoints, strength = 0.35) {
  if (!Array.isArray(sourcePoints) || sourcePoints.length < 8) return null;

  const points = sourcePoints.filter(EngineUtils.validPoint);
  if (points.length < 8) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pressureTotal = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    pressureTotal += EngineUtils.number(point.pressure, 1);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const diagonal = Math.hypot(width, height);
  if (diagonal < 24 || (width < 8 && height < 8)) return null;

  const averagePressure = pressureTotal / points.length;
  const first = points[0];
  const last = points[points.length - 1];
  const endGap = shapePointDistance(first, last);
  const isClosed = endGap <= Math.max(12, diagonal * 0.22);
  const tolerance = Math.max(2, diagonal * (0.025 + strength * 0.025));

  if (isClosed) {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rx = width / 2;
    const ry = height / 2;
    const aspect = width / height;

    // دائرة أو بيضاوي: نقيس انتظام نصف القطر بعد تطبيع حدود الرسم.
    if (aspect >= 0.55 && aspect <= 1.8) {
      let radialError = 0;
      for (const point of points) {
        const nx = (point.x - centerX) / rx;
        const ny = (point.y - centerY) / ry;
        radialError += Math.abs(Math.hypot(nx, ny) - 1);
      }
      radialError /= points.length;

      if (radialError < 0.24 + strength * 0.12) {
        const makeCircle = aspect >= 0.82 && aspect <= 1.22;
        const radiusX = makeCircle ? (rx + ry) / 2 : rx;
        const radiusY = makeCircle ? radiusX : ry;
        const circlePoints = [];
        for (let i = 0; i < 64; i++) {
          const angle = (Math.PI * 2 * i) / 64;
          circlePoints.push({
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY,
            pressure: averagePressure,
            time: Date.now()
          });
        }
        circlePoints.push({ ...circlePoints[0], time: Date.now() });
        return { type: makeCircle ? "circle" : "ellipse", points: circlePoints };
      }
    }

    // تبسيط المسار المغلق إلى زواياه الرئيسية لاكتشاف المثلث والمستطيل.
    const ring = points.slice();
    if (endGap < diagonal * 0.18) ring.pop();
    if (ring.length >= 6) {
      let splitIndex = 1;
      let splitDistance = 0;
      for (let i = 1; i < ring.length; i++) {
        const distance = shapePointDistance(ring[0], ring[i]);
        if (distance > splitDistance) {
          splitDistance = distance;
          splitIndex = i;
        }
      }

      const firstArc = simplifyShapePath(ring.slice(0, splitIndex + 1), tolerance);
      const secondArc = simplifyShapePath(
        [...ring.slice(splitIndex), ring[0]],
        tolerance
      );
      let vertices = [...firstArc.slice(0, -1), ...secondArc.slice(0, -1)];

      // إزالة الرؤوس المتقاربة الناتجة عن الاهتزاز حول الزاوية نفسها.
      const compact = [];
      for (const vertex of vertices) {
        if (!compact.length || shapePointDistance(compact[compact.length - 1], vertex) > diagonal * 0.12) {
          compact.push(vertex);
        }
      }
      if (compact.length > 2 && shapePointDistance(compact[0], compact.at(-1)) < diagonal * 0.12) compact.pop();
      vertices = compact;

      if (vertices.length >= 3 && vertices.length <= 12) {
        let rightAngles = 0;
        for (let i = 0; i < vertices.length; i++) {
          const previous = vertices[(i + vertices.length - 1) % vertices.length];
          const current = vertices[i];
          const next = vertices[(i + 1) % vertices.length];
          const ax = previous.x - current.x;
          const ay = previous.y - current.y;
          const bx = next.x - current.x;
          const by = next.y - current.y;
          const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
          if (denominator > 0 && Math.abs((ax * bx + ay * by) / denominator) < 0.38) {
            rightAngles++;
          }
        }

        if (vertices.length === 3) {
          return {
            type: "triangle",
            points: interpolateShapeEdges(vertices, averagePressure, 8)
          };
        }

        if (rightAngles >= 3) {
          return {
            type: Math.abs(width - height) / Math.max(width, height) < 0.16
              ? "square"
              : "rectangle",
            points: interpolateShapeEdges(vertices, averagePressure, 8)
          };
        }

        if (vertices.length === 4) {
          const sides = vertices.map((p, i) =>
            shapePointDistance(p, vertices[(i + 1) % 4]));
          const oppositeParallel = (a, b) => {
            const cross = a.x * b.y - a.y * b.x;
            return Math.abs(cross) / Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
          };
          const edgeA = { x: vertices[1].x - vertices[0].x, y: vertices[1].y - vertices[0].y };
          const edgeB = { x: vertices[3].x - vertices[2].x, y: vertices[3].y - vertices[2].y };
          const edgeC = { x: vertices[2].x - vertices[1].x, y: vertices[2].y - vertices[1].y };
          const edgeD = { x: vertices[0].x - vertices[3].x, y: vertices[0].y - vertices[3].y };
          const parallelA = oppositeParallel(edgeA, edgeB) < 0.16;
          const parallelB = oppositeParallel(edgeC, edgeD) < 0.16;
          const equalSides = sides.every(side =>
            Math.abs(side - sides[0]) / Math.max(1, sides[0]) < 0.18);
          const type = parallelA && parallelB
            ? (equalSides ? "rhombus" : "parallelogram")
            : (parallelA || parallelB ? "trapezoid" : "quadrilateral");
          return { type, points: interpolateShapeEdges(vertices, averagePressure, 8) };
        }

        if (vertices.length >= 5) {
          const center = {
            x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
            y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length
          };
          const radii = vertices.map(p => shapePointDistance(center, p));
          const high = Math.max(...radii);
          const low = Math.min(...radii);
          const alternating = vertices.length >= 8 &&
            radii.every((r, i) =>
              i % 2 === 0 ? r >= (high + low) / 2 : r <= (high + low) / 2);
          if (alternating && low / Math.max(1, high) < 0.78) {
            return { type: "star", points: interpolateShapeEdges(vertices, averagePressure, 8) };
          }
          const names = {
            5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon",
            9: "nonagon", 10: "decagon", 11: "hendecagon", 12: "dodecagon"
          };
          return {
            type: names[vertices.length] || "polygon",
            points: interpolateShapeEdges(vertices, averagePressure, 8)
          };
        }
      }
    }
  }

  // الخط المستقيم: يجب أن يكون طويلاً ومنخفض الانحراف عن المحور بين طرفيه.
  const lineLength = shapePointDistance(first, last);
  if (lineLength >= 30 && !isClosed) {
    let maximumDeviation = 0;
    for (const point of points) {
      const deviation = Math.abs(
        (last.x - first.x) * (first.y - point.y) -
        (first.x - point.x) * (last.y - first.y)
      ) / lineLength;
      maximumDeviation = Math.max(maximumDeviation, deviation);
    }
    if (maximumDeviation / lineLength < 0.035 + strength * 0.025) {
      return {
        type: "line",
        points: [
          { ...first, pressure: averagePressure },
          { ...last, pressure: averagePressure }
        ]
      };
    }
  }

  // المنحنيات المفتوحة: قوس دائري أو منحنى حر ناعم.
  if (!isClosed && points.length >= 8) {
    const start = points[0];
    const middle = points[Math.floor(points.length / 2)];
    const finish = points[points.length - 1];
    const determinant = 2 * (
      start.x * (middle.y - finish.y) +
      middle.x * (finish.y - start.y) +
      finish.x * (start.y - middle.y)
    );

    if (Math.abs(determinant) > 0.001) {
      const a2 = start.x * start.x + start.y * start.y;
      const b2 = middle.x * middle.x + middle.y * middle.y;
      const c2 = finish.x * finish.x + finish.y * finish.y;
      const cx = (a2 * (middle.y - finish.y) +
        b2 * (finish.y - start.y) + c2 * (start.y - middle.y)) / determinant;
      const cy = (a2 * (finish.x - middle.x) +
        b2 * (start.x - finish.x) + c2 * (middle.x - start.x)) / determinant;
      const radius = shapePointDistance({ x: cx, y: cy }, start);
      if (Number.isFinite(radius) && radius >= 8) {
        const angles = points.map(p => Math.atan2(p.y - cy, p.x - cx));
        let sweep = 0;
        for (let i = 1; i < angles.length; i++) {
          let delta = angles[i] - angles[i - 1];
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          sweep += delta;
        }
        let radialError = 0;
        for (const p of points) {
          radialError += Math.abs(shapePointDistance({ x: cx, y: cy }, p) - radius);
        }
        radialError /= points.length * radius;
        if (Math.abs(sweep) > 0.25 && Math.abs(sweep) < Math.PI * 2.1 && radialError < 0.075) {
          const arcPoints = [];
          const steps = Math.max(24, Math.ceil(Math.abs(sweep) * 20));
          for (let i = 0; i <= steps; i++) {
            const angle = angles[0] + sweep * i / steps;
            arcPoints.push({
              x: cx + Math.cos(angle) * radius,
              y: cy + Math.sin(angle) * radius,
              pressure: averagePressure,
              time: Date.now()
            });
          }
          return { type: "arc", points: arcPoints };
        }
      }
    }

    // منحنى حر: نعيد أخذ العينات على المسار لتقليل الاهتزاز دون تغيير اتجاهه.
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
      pathLength += shapePointDistance(points[i - 1], points[i]);
    }
    const chordLength = shapePointDistance(start, finish);
    if (pathLength > chordLength * 1.08 && pathLength < chordLength * 3.8) {
      const sampled = [];
      const count = Math.max(48, Math.min(120, points.length * 3));
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
        cumulative.push(cumulative[i - 1] + shapePointDistance(points[i - 1], points[i]));
      }
      const total = cumulative[cumulative.length - 1];
      let segment = 1;
      for (let i = 0; i < count; i++) {
        const target = total * i / (count - 1);
        while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
        const a = points[segment - 1];
        const b = points[segment];
        const span = cumulative[segment] - cumulative[segment - 1];
        const t = span > 0 ? (target - cumulative[segment - 1]) / span : 0;
        sampled.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          pressure: averagePressure,
          time: Date.now()
        });
      }
      return { type: "freeform-curve", points: sampled };
    }
  }

  return null;
}

/* =========================================================
   5. DRAWING ENGINE
========================================================= */

export class DrawingEngine {
  constructor(documentModel, renderer, history, coordinates) {
    if (!documentModel || !renderer || !history || !coordinates) {
      throw new TypeError(
        "DrawingEngine requires document, renderer, history and coordinates"
      );
    }

    this.document = documentModel;
    this.renderer = renderer;
    this.history = history;
    this.coordinates = coordinates;

    this.settings = {
      tool: "pen",
      color: "#111111",
      size: 3,
      opacity: 1,
      pressureEnabled: true,
      sensitivity: 0.8,
      minDistance: 0.08,
      lineCorrection: 0.35,
      eraserSize: 16,
      eraserMode: "partial",
      calligraphyAngle: 45
    };

    this.builder = new StrokeBuilder({
      smoothing: this.settings.lineCorrection,
      minDistance: this.settings.minDistance
    });

    this.drawing = false;
    this.activePointer = null;

    this.currentElement = null;
    this.points = [];

    this.lastPoint = null;
    this.changed = false;

    this.erasedIds = new Set();
    this.destroyed = false;
    this.shapeRecognitionTimer = null;
    this.shapeRecognitionApplied = false;
    this.arabicWriting = new ArabicWritingAssistant(
      this.document,
      this.renderer,
      { onCommit: () => this.commitHistory() }
    );
  }

  get activeLayer() {
    return this.document?.activeLayer ?? null;
  }

  canDraw() {
    const layer = this.activeLayer;

    return Boolean(
      !this.destroyed &&
      layer &&
      !layer.locked &&
      layer.visible !== false &&
      Array.isArray(layer.elements)
    );
  }

  getWorldPoint(event) {
    if (
      !event ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return null;
    }

    const point = this.coordinates.screenToWorld(
      event.clientX,
      event.clientY
    );

    return EngineUtils.validPoint(point) ? point : null;
  }

  setSettings(settings = {}) {
    if (!settings || typeof settings !== "object") {
      return false;
    }

    if (typeof settings.tool === "string") {
      this.settings.tool = settings.tool;
    }

    if (settings.eraserMode === "partial" || settings.eraserMode === "stroke") {
      this.settings.eraserMode = settings.eraserMode;
    }

    if (Number.isFinite(settings.calligraphyAngle)) {
      this.settings.calligraphyAngle = EngineUtils.clamp(
        settings.calligraphyAngle,
        0,
        180
      );
    }

    if (
      typeof settings.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(settings.color)
    ) {
      this.settings.color = settings.color;
    }

    if (Number.isFinite(settings.size)) {
      this.settings.size = EngineUtils.clamp(
        settings.size,
        0.1,
        500
      );
    }

    if (Number.isFinite(settings.opacity)) {
      this.settings.opacity = EngineUtils.clamp(
        settings.opacity,
        0,
        1
      );
    }

    if (Number.isFinite(settings.minDistance)) {
      this.settings.minDistance = EngineUtils.clamp(
        settings.minDistance,
        0,
        10
      );
    }

    const correctionValue = Number.isFinite(settings.lineCorrection)
      ? settings.lineCorrection
      : settings.smoothing;
    if (Number.isFinite(correctionValue)) {
      this.settings.lineCorrection = EngineUtils.clamp(
        correctionValue,
        0,
        1
      );
    }

    if (Number.isFinite(settings.sensitivity)) {
      this.settings.sensitivity = EngineUtils.clamp(
        settings.sensitivity,
        0,
        1
      );
    }

    if (Number.isFinite(settings.eraserSize)) {
      this.settings.eraserSize = EngineUtils.clamp(
        settings.eraserSize,
        1,
        500
      );
    }

    if (typeof settings.pressureEnabled === "boolean") {
      this.settings.pressureEnabled = settings.pressureEnabled;
    }

    if (settings.brushStyle && typeof settings.brushStyle === "object") {
      const cap = settings.brushStyle.lineCap;
      const dash = settings.brushStyle.dashArray;
      const img = settings.brushStyle.image;

      this.brushStyle = {
        preset: settings.brushStyle.preset || null,
        lineCap: ["round", "butt", "square"].includes(cap)
          ? cap : "round",
        dashArray: typeof dash === "string" &&
          /^[\d\s.,-]*$/.test(dash) ? dash : "",
        image: typeof img === "string" && img.startsWith("data:image/")
          ? img
          : null
      };
    }

    this.builder.smoothing.strength =
      this.settings.lineCorrection;
    this.builder.baseSmoothingStrength =
      this.settings.lineCorrection;

    this.builder.smoothing.minDistance =
      this.settings.minDistance;
    this.builder.baseSmoothingMinDistance =
      this.settings.minDistance;

    return true;
  }

  getPressure(event = {}) {
    if (!this.settings.pressureEnabled) {
      return 1;
    }

    return this.builder.pressure.read(event);
  }

  start(event, pointerData = null) {
    if (
      this.destroyed ||
      this.drawing ||
      !this.canDraw()
    ) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event?.pointerId !== undefined
    ) {
      return false;
    }

    const point = this.getWorldPoint(event);

    if (!point) return false;

    this.clearShapeRecognitionTimer();
    this.shapeRecognitionApplied = false;
    this.drawing = true;
    this.activePointer = event.pointerId ?? null;

    this.points = [];
    this.lastPoint = null;
    this.changed = false;
    this.erasedIds.clear();

    if (this.settings.tool === "eraser") {
      this.eraseAt(point);
      return true;
    }

    const input = pointerData || event;

    this.builder.begin({
      ...point,
      pressure: this.getPressure(input),
      time: input.timeStamp
    }, {
      tool: this.settings.tool,
      color: this.settings.color,
      size: this.settings.size,
      opacity: this.settings.opacity,
      sensitivity: this.settings.sensitivity,
      pressureEnabled: this.settings.pressureEnabled,
      calligraphyAngle: this.settings.calligraphyAngle,
      brushStyle: { ...this.brushStyle }
    });

    this.points = this.builder.points;

    this.currentElement = {
      id: this.builder.id,
      type: "stroke",
      tool: this.settings.tool,
      points: this.points,
      path: "",
      style: {
        color: this.settings.color,
        size: this.settings.size,
        opacity: this.settings.opacity,
        fill: "none",
        lineCap: "round",
        lineJoin: "round"
      }
    };

    this.renderCurrent();

    return true;
  }

  addPoint(point, event = {}, force = false) {
    if (!EngineUtils.validPoint(point)) {
      return false;
    }

    if (
      this.lastPoint &&
      !force &&
      EngineUtils.distance(point, this.lastPoint) <
        this.settings.minDistance
    ) {
      return false;
    }

    const sample = {
      ...point,
      pressure: this.settings.pressureEnabled
        ? this.getPressure(event)
        : 1,
      time: EngineUtils.number(event.timeStamp, Date.now())
    };

    const added = this.builder.addPoint(sample);

    if (!added) return false;

    this.points = this.builder.points;
    this.lastPoint = sample;

    return true;
  }

  move(event, pointerData = null) {
    if (!this.drawing || this.destroyed || this.shapeRecognitionApplied) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event.pointerId !== this.activePointer
    ) {
      return false;
    }

    const point = this.getWorldPoint(event);

    if (!point) return false;

    if (this.settings.tool === "eraser") {
      return this.eraseAt(point);
    }

    const input = pointerData || event;

    const added = this.addPoint(point, input);

    if (added) {
      // أثناء ملامسة الشاشة نعرض مسار الرسم الحي فقط؛
      // التعرف النهائي على الأشكال مؤجل حتى pointerup.
      this.renderCurrent();
    }

    return added;
  }

  clearShapeRecognitionTimer() {
    if (this.shapeRecognitionTimer !== null) {
      clearTimeout(this.shapeRecognitionTimer);
      this.shapeRecognitionTimer = null;
    }
  }

  scheduleShapeRecognition() {
    this.clearShapeRecognitionTimer();
    if (
      !this.drawing ||
      this.shapeRecognitionApplied ||
      !["pen", "pencil", "marker"].includes(this.settings.tool) ||
      this.settings.lineCorrection <= 0 ||
      this.builder.points.length < 8
    ) return;

    const candidate = recognizeHeldShape(
      this.builder.points,
      this.settings.lineCorrection
    );
    if (!candidate) return;

    // لا نثبت الشكل إلا بعد توقف الإصبع فترة قصيرة عند نهاية الرسم.
    this.shapeRecognitionTimer = setTimeout(() => {
      this.shapeRecognitionTimer = null;
      if (!this.drawing || this.shapeRecognitionApplied) return;

      const confirmed = recognizeHeldShape(
        this.builder.points,
        this.settings.lineCorrection
      );
      if (!confirmed) return;

      this.builder.points = confirmed.points.map(point => ({ ...point }));
      this.points = this.builder.points;
      this.lastPoint = this.builder.points.at(-1) || null;
      this.shapeRecognitionApplied = true;
      this.renderCurrent();
    }, 650);
  }

  buildPath(points) {
    return this.builder.smoothing.toPath(
      this.builder.smoothing.process(points)
    );
  }

  renderCurrent() {
    if (!this.currentElement) return false;

    const built = this.builder.build();

    if (!built) return false;

    this.currentElement = {
      ...this.currentElement,
      ...built,
      points: this.builder.points
    };

    return this.renderer.updateElement(
      this.currentElement
    );
  }

  end(event = {}) {
    if (!this.drawing || this.destroyed) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event.pointerId !== undefined &&
      event.pointerId !== this.activePointer
    ) {
      return false;
    }

    // رفع القلم هو الحدث الحاسم لنهاية الضربة:
    // نلتقط إحداثيات pointerup نفسها قبل بناء المسار النهائي،
    // لأن آخر pointermove قد لا يصل إلى آخر موضع فعلي للمس.
    this.clearShapeRecognitionTimer();

    let finalizedElement = null;
    if (this.settings.tool !== "eraser" && this.currentElement) {
      const finalPoint = this.getWorldPoint(event);
      const lastPoint = this.builder.points.at(-1);

      if (
        finalPoint &&
        EngineUtils.validPoint(finalPoint) &&
        (!lastPoint || EngineUtils.distance(finalPoint, lastPoint) > 0.02)
      ) {
        // بعض الأجهزة ترسل pressure=0 في pointerup؛ احتفظ بضغط آخر
        // عينة حقيقية حتى لا تظهر نقطة النهاية كرفيعة أو مقطوعة.
        const finalEvent = (
          event.pointerType === "pen" &&
          (!Number.isFinite(event.pressure) || event.pressure <= 0)
        )
          ? {
              pointerType: event.pointerType,
              pressure: lastPoint?.pressure ?? 0.5,
              timeStamp: event.timeStamp
            }
          : event;

        this.addPoint(finalPoint, finalEvent, true);
      }

      // لا نعتمد الشكل أثناء استمرار اللمس أو عند التوقف المؤقت.
      // يبدأ التعرف والتصحيح النهائيان فقط بعد رفع الإصبع (pointerup)،
      // بعد ضم آخر نقطة فعلية إلى الضربة.
      if (
        !this.shapeRecognitionApplied &&
        ["pen", "pencil", "marker"].includes(this.settings.tool) &&
        this.settings.lineCorrection > 0 &&
        this.builder.points.length >= 8
      ) {
        const confirmed = recognizeHeldShape(
          this.builder.points,
          this.settings.lineCorrection
        );

        if (confirmed?.points?.length) {
          this.builder.points = confirmed.points.map(point => ({ ...point }));
          this.points = this.builder.points;
          this.lastPoint = this.builder.points.at(-1) || null;
          this.shapeRecognitionApplied = true;
        }
      }

      // بناء النسخة المصححة وعرضها بعد رفع الإصبع مباشرة.
      finalizedElement = this.builder.build();
      if (finalizedElement) {
        this.currentElement = {
          ...this.currentElement,
          ...finalizedElement,
          points: this.builder.points
        };
        this.renderer.updateElement(this.currentElement);
      }
    }

    const layer = this.activeLayer;
    let committed = false;

    if (
      layer &&
      !layer.locked &&
      layer.visible !== false
    ) {
      if (this.settings.tool === "eraser") {
        if (this.changed) {
          this.commitHistory();
          committed = true;
        }
      } else if (this.currentElement && this.points.length) {
        const element = finalizedElement || this.builder.build();

        if (element) {
          const brushStyle = this.brushStyle || {
            lineCap: "round",
            dashArray: ""
          };

          element.style = {
            ...(element.style || {}),
            lineCap: brushStyle.lineCap,
            dashArray: brushStyle.dashArray,
            customBrush: brushStyle.image || null
          };

          if (element.tool === "calligraphy") {
            element.calligraphyMeta = {
              angle: this.settings.calligraphyAngle,
              preset: brushStyle.preset || null,
              pressureEnabled: this.settings.pressureEnabled !== false,
              sensitivity: this.settings.sensitivity
            };
          }

          const exists = layer.elements.some(
            item => item.id === element.id
          );

          if (!exists) {
            if (typeof this.document.addElement === "function") {
              committed = this.document.addElement(element);
            } else {
              layer.elements.push(EngineUtils.clone(element));

              this.document.touch?.();
              committed = true;
            }

            if (committed) {
              this.commitHistory();
              this.arabicWriting?.observe(element, layer, this.settings);
            }
          }
        }
      }
    }

    this.renderer.clearPreview();

    if (committed) {
      this.renderer.render(this.document);
    }

    this.reset();

    return committed;
  }

  cancel() {
    this.clearShapeRecognitionTimer();
    if (!this.drawing) return false;

    this.renderer.clearPreview();

    // الممحاة تعدل العناصر مباشرة، لذلك نحفظ
    // عملية الحذف حتى عند إلغاء المؤشر.
    if (
      this.settings.tool === "eraser" &&
      this.changed
    ) {
      this.commitHistory();
      this.renderer.render(this.document);
    }

    this.reset();

    return true;
  }

  interrupt(commit = true) {
    if (!this.drawing) return false;

    if (commit) {
      return this.end({
        pointerId: this.activePointer
      });
    }

    return this.cancel();
  }

  getEraserTolerance() {
    const zoom = EngineUtils.number(
      this.coordinates.camera?.zoom ??
      this.coordinates.camera?.scale,
      1
    );

    return this.settings.eraserSize /
      Math.max(0.01, zoom);
  }


  async fillAt(event) {
    const layer = this.activeLayer;
    if (!this.canDraw() || !event) return false;

    const color = this.settings.color;
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) {
      return false;
    }

    const svg = this.renderer?.svg;
    if (!svg || typeof XMLSerializer === "undefined") return false;

    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;

    // تحديد دقة مناسبة للهاتف لتقليل استهلاك الذاكرة.
    const scale = Math.min(1, 1100 / rect.width, 1100 / rect.height);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    const total = width * height;

    if (total > 1300000) return false;

    // ربط نقطة الضغط بإحداثيات SVG الفعلية، مع مراعاة viewBox والتحويلات.
    const svgMatrix = svg.getScreenCTM();
    if (!svgMatrix) return false;

    let viewBox = svg.viewBox?.baseVal;
    if (!viewBox || !(viewBox.width > 0 && viewBox.height > 0)) {
      viewBox = {
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height
      };
    }

    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    let svgPointer;
    try {
      svgPointer = pointer.matrixTransform(svgMatrix.inverse());
    } catch {
      return false;
    }

    const seedX = Math.floor(
      (svgPointer.x - viewBox.x) * width / viewBox.width
    );
    const seedY = Math.floor(
      (svgPointer.y - viewBox.y) * height / viewBox.height
    );

    if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
      return false;
    }

    const clone = svg.cloneNode(true);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    // تضمين التنسيقات المحسوبة حتى تظهر الخطوط كما يراها المستخدم.
    try {
      const originals = [svg, ...svg.querySelectorAll("*")];
      const copies = [clone, ...clone.querySelectorAll("*")];
      const properties = [
        "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
        "stroke-dasharray", "fill", "fill-opacity", "stroke-opacity",
        "opacity", "display", "visibility", "font-family", "font-size",
        "font-weight"
      ];

      for (let i = 0; i < Math.min(originals.length, copies.length); i++) {
        const computed = getComputedStyle(originals[i]);
        const inline = properties
          .map(key => `${key}:${computed.getPropertyValue(key)}`)
          .join(";");
        const previous = copies[i].getAttribute("style") || "";
        copies[i].setAttribute("style", previous + ";" + inline);
      }
    } catch {
      // يستمر باستخدام التنسيقات الموجودة في SVG عند تعذر قراءة computed style.
    }

    // نسخة الفحص تعرض حدود العناصر فقط، وليس تعبئاتها الأصلية.
    const outlineTags = new Set([
      "path", "rect", "circle", "ellipse",
      "polygon", "polyline", "line"
    ]);

    for (const node of clone.querySelectorAll("*")) {
      if (outlineTags.has(node.localName)) {
        // !important يمنع قيمة fill المنسوخة داخل style من إظهار التعبئة الأصلية.
        node.style?.setProperty("fill", "none", "important");
        node.style?.setProperty("fill-opacity", "1", "important");
        node.setAttribute("fill", "none");
        node.setAttribute("fill-opacity", "1");
      }
    }

    // جعل صورة الفحص تغطي كامل viewBox دون هوامش letterbox.
    clone.setAttribute("preserveAspectRatio", "none");

    let objectUrl = null;

    try {
      const source = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([source], {
        type: "image/svg+xml;charset=utf-8"
      });
      objectUrl = URL.createObjectURL(blob);

      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = objectUrl;
      });

      // تحويل نسخة SVG إلى صورة نقطية لفحص الحدود.
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });

      if (!context) return false;

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const pixels = context.getImageData(0, 0, width, height).data;
      const seed = seedY * width + seedX;

      // كل بكسل مرئي من الخطوط الملونة أو الداكنة يمثل جزءاً من الحدود.
      const boundary = new Uint8Array(total);

      for (let i = 0; i < total; i++) {
        const alpha = pixels[i * 4 + 3];
        if (alpha > 12) boundary[i] = 1;
      }

      // توسيع الحدود بكسلاً واحداً لإغلاق الفجوات الناتجة عن تنعيم الحواف.
      const expandedBoundary = new Uint8Array(total);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          if (!boundary[index]) continue;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;

              if (
                nx >= 0 && nx < width &&
                ny >= 0 && ny < height
              ) {
                expandedBoundary[ny * width + nx] = 1;
              }
            }
          }
        }
      }

      const isBoundary = index => expandedBoundary[index] === 1;

      if (isBoundary(seed)) return false;

      const visited = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;
      queue[tail++] = seed;
      visited[seed] = 1;

      let touchesEdge = false;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);

        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          touchesEdge = true;
        }

        const neighbors = [
          x > 0 ? index - 1 : -1,
          x + 1 < width ? index + 1 : -1,
          y > 0 ? index - width : -1,
          y + 1 < height ? index + width : -1
        ];

        for (const next of neighbors) {
          if (next < 0 || visited[next] || isBoundary(next)) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }

        if (tail >= total) break;
      }

      // منع تعبئة المساحة الخارجية المفتوحة بالخطأ.
      if (touchesEdge || tail < 2) return false;

      // ضم حافة الخط إلى التعبئة عندما يكون لونها مطابقاً للون المختار.
      const fillMask = visited.slice();
      const targetR = parseInt(color.slice(1, 3), 16);
      const targetG = parseInt(color.slice(3, 5), 16);
      const targetB = parseInt(color.slice(5, 7), 16);

      for (let index = 0; index < total; index++) {
        if (!visited[index]) continue;

        const x = index % width;
        const y = Math.floor(index / width);

        const neighbors = [
          x > 0 ? index - 1 : -1,
          x + 1 < width ? index + 1 : -1,
          y > 0 ? index - width : -1,
          y + 1 < height ? index + width : -1
        ];

        for (const next of neighbors) {
          if (next < 0 || !boundary[next]) continue;

          const p = next * 4;
          if (
            pixels[p + 3] > 12 &&
            Math.abs(pixels[p] - targetR) <= 45 &&
            Math.abs(pixels[p + 1] - targetG) <= 45 &&
            Math.abs(pixels[p + 2] - targetB) <= 45
          ) {
            fillMask[next] = 1;
          }
        }
      }

      // تحويل المنطقة إلى مسارات مستطيلة متصلة، وليس صورة نقطية.
      const parts = [];

      // تحويل كل بكسل من صورة الفحص إلى إحداثيات SVG ثم إلى العالم.
      const screenToWorld = (px, py) => {
        const svgPoint = svg.createSVGPoint();
        svgPoint.x = viewBox.x + px * viewBox.width / width;
        svgPoint.y = viewBox.y + py * viewBox.height / height;

        const screenPoint = svgPoint.matrixTransform(svgMatrix);

        return this.coordinates.screenToWorld(
          screenPoint.x,
          screenPoint.y
        );
      };

      for (let y = 0; y < height; y++) {
        let x = 0;
        while (x < width) {
          while (x < width && !fillMask[y * width + x]) x++;
          if (x >= width) break;

          const start = x;
          while (x < width && fillMask[y * width + x]) x++;
          const end = x;

          const a = screenToWorld(start, y);
          const b = screenToWorld(end, y);
          const c = screenToWorld(end, y + 1);
          const d = screenToWorld(start, y + 1);

          if (![a, b, c, d].every(p =>
            p && Number.isFinite(p.x) && Number.isFinite(p.y)
          )) return false;

          parts.push(
            `M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}L${d.x} ${d.y}Z`
          );

          if (parts.length > 30000) return false;
        }
      }

      if (!parts.length || this.activeLayer !== layer || !this.canDraw()) {
        return false;
      }

      const element = {
        id: globalThis.crypto?.randomUUID
          ? `bucket-${globalThis.crypto.randomUUID()}`
          : `bucket-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "path",
        path: parts.join(""),
        tool: "bucket",
        style: {
          fill: color,
          color,
          size: 0,
          opacity: 1
        }
      };

      let committed = false;
      if (typeof this.document.addElement === "function") {
        committed = this.document.addElement(element);
      } else {
        layer.elements.push(element);
        this.document.touch?.();
        committed = true;
      }

      if (committed) {
        this.commitHistory();
        this.renderer.render(this.document);
      }
      return committed;
    } catch (error) {
      console.error("Bucket fill failed:", error);
      return false;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  eraseAt(point) {
    const layer = this.activeLayer;
    if (
      !layer ||
      layer.locked ||
      layer.visible === false ||
      !EngineUtils.validPoint(point)
    ) return false;

    const radius = this.getEraserTolerance();

    // ممحاة الخط الكامل: تبقى كما هي.
    if (this.settings.eraserMode === "stroke") {
      const result = HitTesting.hitTest(layer.elements, point, radius);
      if (!result || this.erasedIds.has(result.id)) return false;

      const index = layer.elements.findIndex(
        element => element.id === result.id
      );
      if (index === -1) return false;

      layer.elements.splice(index, 1);
      this.erasedIds.add(result.id);
      this.changed = true;
      this.document.touch?.();
      this.renderer.renderActiveLayer(layer);
      return true;
    }

    let modified = false;
    const elementsToRemove = [];
    const elementsToAdd = [];

    const distanceToEraser = p =>
      Math.hypot(p.x - point.x, p.y - point.y);

    const interpolatePoint = (a, b, t) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      pressure:
        EngineUtils.number(a.pressure, 1) +
        (EngineUtils.number(b.pressure, 1) -
          EngineUtils.number(a.pressure, 1)) * t,
      time:
        EngineUtils.number(a.time, 0) +
        (EngineUtils.number(b.time, 0) -
          EngineUtils.number(a.time, 0)) * t
    });

    const samePoint = (a, b) =>
      Math.hypot(a.x - b.x, a.y - b.y) < 0.000001;

    for (let elIdx = 0; elIdx < layer.elements.length; elIdx++) {
      const element = layer.elements[elIdx];
      if (!element || element.visible === false) continue;

      const dist = HitTesting.getElementDistance(element, point);
      if (dist > radius) continue;

      if (Array.isArray(element.points) && element.points.length > 0) {
        const points = element.points;
        const fragments = [];
        let current = [];

        const flushFragment = () => {
          if (current.length > 1) fragments.push(current);
          current = [];
        };

        if (points.length === 1) {
          if (distanceToEraser(points[0]) > radius) {
            current.push({ ...points[0] });
          }
          flushFragment();
        } else {
          for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;

            // نقاط تقاطع القطعة مع دائرة الممحاة.
            const A = dx * dx + dy * dy;
            const B = 2 * (
              (p0.x - point.x) * dx +
              (p0.y - point.y) * dy
            );
            const C =
              (p0.x - point.x) ** 2 +
              (p0.y - point.y) ** 2 -
              radius * radius;

            const cuts = [0, 1];

            if (A > 0.0000001) {
              const discriminant = B * B - 4 * A * C;
              if (discriminant >= 0) {
                const root = Math.sqrt(discriminant);
                const t1 = (-B - root) / (2 * A);
                const t2 = (-B + root) / (2 * A);

                if (t1 > 0 && t1 < 1) cuts.push(t1);
                if (t2 > 0 && t2 < 1) cuts.push(t2);
              }
            }

            cuts.sort((x, y) => x - y);

            for (let j = 1; j < cuts.length; j++) {
              const t0 = cuts[j - 1];
              const t1 = cuts[j];
              if (t1 - t0 < 0.0000001) continue;

              const middle = interpolatePoint(
                p0,
                p1,
                (t0 + t1) / 2
              );

              if (distanceToEraser(middle) > radius) {
                const from = interpolatePoint(p0, p1, t0);
                const to = interpolatePoint(p0, p1, t1);

                if (
                  current.length &&
                  samePoint(current[current.length - 1], from)
                ) {
                  if (!samePoint(current[current.length - 1], to)) {
                    current.push(to);
                  }
                } else {
                  flushFragment();
                  current = [from, to];
                }
              } else {
                flushFragment();
              }
            }
          }

          flushFragment();
        }

        const style = element.style || {};
        const tool = element.tool || "pen";

        for (const fragment of fragments) {
          if (fragment.length < 2) continue;

          // إعادة بناء الجزء بنفس نمط القلم بدلاً من تحويله إلى خط عادي.
          const builder = new StrokeBuilder();
          const started = builder.begin(fragment[0], {
            size: style.size ?? 5,
            color: style.color || "#111111",
            opacity: style.opacity ?? 1,
            tool,
            calligraphyAngle:
              element.calligraphyAngle ??
              element.settings?.calligraphyAngle ??
              this.settings.calligraphyAngle ??
              45,
            sensitivity:
              element.sensitivity ??
              this.settings.sensitivity ??
              0.8,
            pressureEnabled: element.pressureEnabled !== false,
            brushStyle: {
              lineCap: style.lineCap || "round",
              lineJoin: style.lineJoin || "round",
              dashArray: style.dashArray || "",
              image: style.customBrush || null,
              preset: element.brushStyle?.preset
            }
          });

          if (!started) continue;

          for (let i = 1; i < fragment.length; i++) {
            builder.addPoint(fragment[i]);
          }

          const built = builder.build({
            pressureEnabled: element.pressureEnabled !== false
          });
          if (!built) continue;

          const newElement = EngineUtils.clone(element);
          newElement.id = EngineUtils.createId("stroke");
          newElement.points = built.points;
          newElement.path = built.path;
          newElement.renderMode = built.renderMode;
          newElement.style = {
            ...style,
            ...built.style
          };

          elementsToAdd.push(newElement);
        }

        elementsToRemove.push(elIdx);
        modified = true;
      } else {
        // العناصر التي لا تحتوي نقاطاً تُحذف عند ملامسة الممحاة.
        elementsToRemove.push(elIdx);
        modified = true;
      }
    }

    if (!modified) return false;

    for (let i = elementsToRemove.length - 1; i >= 0; i--) {
      layer.elements.splice(elementsToRemove[i], 1);
    }

    for (const newElement of elementsToAdd) {
      layer.elements.push(newElement);
    }

    this.changed = true;
    this.document.touch?.();
    this.renderer.renderActiveLayer(layer);
    return true;
  }

  hitTest(point, tolerance = 8) {
    const layer = this.activeLayer;

    if (!layer || !EngineUtils.validPoint(point)) {
      return null;
    }

    const zoom = EngineUtils.number(
      this.coordinates.camera?.zoom ??
      this.coordinates.camera?.scale,
      1
    );

    const worldTolerance =
      EngineUtils.number(tolerance, 8) /
      Math.max(0.01, zoom);

    return HitTesting.hitTest(
      layer.elements,
      point,
      worldTolerance
    );
  }

  removeElement(id) {
    const layer = this.activeLayer;

    if (!layer || layer.locked || !id) {
      return false;
    }

    const index = layer.elements.findIndex(
      element => element.id === id
    );

    if (index === -1) return false;

    layer.elements.splice(index, 1);

    this.document.touch?.();

    this.commitHistory();
    this.renderer.render(this.document);

    return true;
  }

  clear() {
    const layer = this.activeLayer;

    if (
      !layer ||
      layer.locked ||
      !layer.elements.length
    ) {
      return false;
    }

    layer.elements = [];

    this.document.touch?.();

    this.commitHistory();
    this.renderer.render(this.document);

    return true;
  }

  commitHistory() {
    if (typeof this.history.commit === "function") {
      this.history.commit();
      return true;
    }

    return false;
  }

  onCommit() {
    this.commitHistory();
    this.renderer.render(this.document);
  }

  reset() {
    this.clearShapeRecognitionTimer();
    this.shapeRecognitionApplied = false;
    this.drawing = false;
    this.activePointer = null;

    this.currentElement = null;
    this.points = [];
    this.lastPoint = null;

    this.changed = false;
    this.erasedIds.clear();

    this.builder.reset();
  }

  destroy() {
    if (this.destroyed) return;

    if (this.drawing) {
      this.cancel();
    }

    this.reset();

    this.arabicWriting?.destroy();
    this.arabicWriting = null;

    this.document = null;
    this.renderer = null;
    this.history = null;
    this.coordinates = null;

    this.destroyed = true;
  }
}

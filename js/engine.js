
import { ArabicWritingAssistant } from "./arabic-writing.js";
import { recognizeShape } from "./shape-recognition.js?v=20261108-02";

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
    // عند 100% نرفع تدخل التصحيح إلى 50 تمريرة لمعالجة الاهتزازات
    // بقوة أكبر، مع إبقاء الضربات القصيرة قليلة العينات محمية من الإفراط.
    // Keep correction bounded: large strokes must not trigger dozens of
    // full-array passes on the UI thread.
    const passes = points.length < 5
      ? 1
      : (strength >= 0.85 ? 6 : strength >= 0.72 ? 4 : strength >= 0.22 ? 2 : 1);

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
      (0.18 + strength * 0.48 + Math.pow(strength, 4) * 0.24) * densityFactor,
      0.12,
      0.90
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
    // أثناء الضربة نعرض العينات الخام؛ لا يبدأ التنعيم إلا بعد سكون الإصبع.
    this.deferSmoothing = false;

    // Incremental live calligraphy outline cache. It is reset with each stroke.
    this.calligraphyPreviewPointCount = 0;
    this.calligraphyPreviewPath = "";
    this.calligraphyPreviewDelta = "";
    this.workerFilteredPoints = null;

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
    this.lineCorrectionStrength = EngineUtils.clamp(
      EngineUtils.number(settings.lineCorrection, 0.35),
      0,
      1
    );
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
    if (!this.deferSmoothing && Array.isArray(this.workerFilteredPoints)) {
      return this.workerFilteredPoints;
    }

    // لا يُصحح مسار الخط العربي أثناء الكتابة أو الرسم أو حركة القلم.
    // تبقى العينات الأصلية كما هي حتى يثبت القلم ويستمر الضغط طوال مهلة السكون.
    const preset = String(this.brushStyle?.preset || "");
    const isCalligraphy =
      this.tool === "calligraphy" ||
      preset === "calligraphy" ||
      preset.startsWith("cal-");

    if (isCalligraphy) {
      if (this.deferSmoothing) {
        // Raw input samples are immutable during live drawing. Reuse the
        // array instead of cloning every old point on every animation frame.
        return this.points;
      }

      // مرشح خفيف خاص بالخط العربي: تمريرة واحدة ثابتة الكلفة.
      // لا نستخدم مرشح الأقلام العام لأنه قد ينفذ عشرات التمريرات
      // على آلاف العينات ويجمّد واجهة الرسم أثناء الكتابة الطويلة.
      const strength = EngineUtils.clamp(this.lineCorrectionStrength, 0, 1);
      if (strength <= 0 || this.points.length < 3) {
        return this.points.map(point => ({ ...point }));
      }

      const blend = 0.08 + strength * 0.27;
      const source = this.points;
      const filtered = source.map(point => ({ ...point }));

      for (let i = 1; i < source.length - 1; i++) {
        const previous = source[i - 1];
        const current = source[i];
        const next = source[i + 1];

        const ax = current.x - previous.x;
        const ay = current.y - previous.y;
        const bx = next.x - current.x;
        const by = next.y - current.y;
        const aLength = Math.hypot(ax, ay);
        const bLength = Math.hypot(bx, by);

        if (aLength < 0.0001 || bLength < 0.0001) continue;

        const turn = Math.atan2(
          ax * by - ay * bx,
          ax * bx + ay * by
        );

        // احتفظ بالانعطافات الحادة المقصودة؛ نعالج الاهتزازات الخفيفة فقط.
        if (Math.abs(turn) > 0.85) continue;

        const targetX = (previous.x + 2 * current.x + next.x) / 4;
        const targetY = (previous.y + 2 * current.y + next.y) / 4;

        filtered[i].x = current.x + (targetX - current.x) * blend;
        filtered[i].y = current.y + (targetY - current.y) * blend;
      }

      return filtered;
    }

    this.smoothing.strength = this.baseSmoothingStrength;
    this.smoothing.minDistance = this.baseSmoothingMinDistance;

    // بقية الأقلام فقط تخضع للتصحيح المؤجل بعد السكون.
    if (this.deferSmoothing) {
      return this.points.map(point => ({ ...point }));
    }

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

  getPresetBrushOutline() {
    const points = this.getFilteredPoints();
    if (!points.length) return "";
    const preset = String(this.brushStyle?.preset || "round");
    const angle = (Number.isFinite(this.calligraphyAngle) ? this.calligraphyAngle : 45) * Math.PI / 180;
    const nibX = Math.cos(angle), nibY = Math.sin(angle);
    const profiles = {
      flat:"flat", chisel:"flat", "cal-kufi":"flat", "cal-italic":"flat", "cal-oblique":"flat",
      square:"square", point:"point", oval:"oval", soft:"soft", dry:"dry", chalk:"dry",
      watercolor:"watercolor", spray:"spray", ink:"ink", highlighter:"highlighter",
      "marker-round":"marker", round:"round"
    };
    const kind = profiles[preset];
    if (!kind || preset === "dash" || preset === "custom") return "";
    const pressureAt = p => this.pressureEnabled ? EngineUtils.clamp(0.35 + EngineUtils.number(p.pressure, 0.5) * 0.65, 0.25, 1.15) : 1;
    const radiusAt = (p, i) => {
      let r = this.baseSize * 0.5 * pressureAt(p);
      if (kind === "point") r *= 0.22 + pressureAt(p) * 0.78;
      if (kind === "oval") r *= 0.72;
      if (kind === "soft" || kind === "watercolor") r *= 1.12;
      if (kind === "highlighter") r *= 0.92;
      const prev=points[Math.max(0,i-1)], next=points[Math.min(points.length-1,i+1)];
      const elapsed=Math.max(1,EngineUtils.number(next.time,p.time)-EngineUtils.number(prev.time,p.time));
      const speed=EngineUtils.distance(prev,next)/elapsed;
      r *= EngineUtils.clamp(1.12-speed*0.22,0.78,1.12);
      if (kind === "flat") {
        const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
        r *= 0.12 + Math.abs(Math.sin(Math.atan2(b.y-a.y,b.x-a.x)-angle))*0.88;
      }
      return Math.max(0.35,r);
    };
    const poly = pts => pts.map((p,i)=>`${i?"L":"M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")+" Z";
    if (points.length === 1) {
      const p=points[0],r=radiusAt(p,0);
      if(kind==="flat"){const tx=-nibY,ty=nibX,h=Math.max(1,r*0.7);return poly([
        {x:p.x-tx*h+nibX*r,y:p.y-ty*h+nibY*r},{x:p.x+tx*h+nibX*r,y:p.y+ty*h+nibY*r},
        {x:p.x+tx*h-nibX*r,y:p.y+ty*h-nibY*r},{x:p.x-tx*h-nibX*r,y:p.y-ty*h-nibY*r}]);}
      return `M ${p.x-r} ${p.y} a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 ${-r*2} 0`;
    }
    const left=[],right=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
      let r=radiusAt(p,i);
      if(kind==="oval")r*=0.72+0.28*Math.abs(Math.cos(Math.atan2(dy,dx)-angle));
      left.push({x:p.x+nx*r,y:p.y+ny*r});right.push({x:p.x-nx*r,y:p.y-ny*r});
    }
    if(kind==="dry"){
      const lanes=[];
      for(const lane of [-2,0,2]){
        const l=[],r=[],off=lane*this.baseSize*0.13,half=Math.max(0.35,this.baseSize*0.055);
        for(let i=0;i<points.length;i++){
          const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
          const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
          l.push({x:p.x+nx*(off+half),y:p.y+ny*(off+half)});r.push({x:p.x+nx*(off-half),y:p.y+ny*(off-half)});
        }
        lanes.push(poly([...l,...r.reverse()]));
      }
      return lanes.join(" ");
    }
    if(kind==="spray"){
      const dots=[];
      for(let i=0;i<points.length;i+=2){const p=points[i];for(let k=0;k<5;k++){
        const seed=(i+1)*127+(k+3)*71,ox=Math.sin(seed)*this.baseSize*0.75,oy=Math.cos(seed*1.7)*this.baseSize*0.75;
        const r=Math.max(0.35,this.baseSize*(0.035+((Math.sin(seed*2.1)+1)*0.018)));
        dots.push(`M ${p.x+ox-r} ${p.y+oy} a ${r} ${r} 0 1 0 ${r*2} 0 a ${r} ${r} 0 1 0 ${-r*2} 0`);
      }}
      return dots.join(" ");
    }
    return poly([...left,...right.reverse()]);
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
      "cal-fine": 0.60,
      "cal-kufi": 1.35,
      "cal-italic": 1.10,
      "cal-stub": 0.95,
      "cal-oblique": 1.05
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

    // While the pointer is down, append only the newly received segment.
    // Rebuilding every previous quadrilateral on every frame made long
    // calligraphy strokes approach quadratic work.
    if (this.active && this.deferSmoothing) {
      let delta = "";
      if (this.calligraphyPreviewPointCount > points.length) { this.calligraphyPreviewDelta = "";
        this.calligraphyPreviewPointCount = 0;
        this.calligraphyPreviewPath = "";
      }

      if (this.calligraphyPreviewPointCount === 0 && points.length > 0) {
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
        this.calligraphyPreviewPath = makeSegment(start, end, r, r);
        delta = this.calligraphyPreviewPath;
        this.calligraphyPreviewPointCount = 1;
      }

      // A one-point stroke uses the existing nib-cap preview. Once a second
      // point arrives, replace that temporary cap with the normal first segment.
      if (this.calligraphyPreviewPointCount === 1 && points.length > 1) {
        this.calligraphyPreviewPath = "";
      }

      for (
        let i = Math.max(1, this.calligraphyPreviewPointCount);
        i < points.length;
        i++
      ) {
        const segment = makeSegment(
          points[i - 1],
          points[i],
          getRadius(points[i - 1]),
          getRadius(points[i])
        );
        this.calligraphyPreviewPath += " " + segment;
        delta += " " + segment;
      }

      this.calligraphyPreviewDelta = delta.trim();
      this.calligraphyPreviewPointCount = points.length;
      return this.calligraphyPreviewPath;
    }

    this.calligraphyPreviewDelta = "";
    const segments = [];

    // Keep the angled nib cap at the true stroke origin even after
    // the second point arrives. Without it, the first quadrilateral starts
    // exactly at the first sample and leaves a visibly cut/flat stroke head.
    const firstPoint = points[0];
    const firstRadius = getRadius(firstPoint);
    const halfLength = Math.max(0.6, firstRadius * 0.5);
    const tangentX = -sinA;
    const tangentY = cosA;
    const capStart = {
      x: firstPoint.x - tangentX * halfLength,
      y: firstPoint.y - tangentY * halfLength
    };
    const capEnd = {
      x: firstPoint.x + tangentX * halfLength,
      y: firstPoint.y + tangentY * halfLength
    };
    segments.push(makeSegment(capStart, capEnd, firstRadius, firstRadius));

    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      segments.push(
        makeSegment(start, end, getRadius(start), getRadius(end))
      );
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

    const preset = String(this.brushStyle?.preset || "round");
    const presetOutline = !isCalligraphy && !["round", "dash", "custom"].includes(preset);
    const variableWidth = isCalligraphy || presetOutline || (pressureEnabled && this.tool !== "marker" && this.tool !== "pencil");
    let path = "";
    if (isCalligraphy) path = this.getCalligraphyOutline();
    else if (presetOutline) path = this.getPresetBrushOutline();
    else if (variableWidth) path = this.getVariableWidthOutline();
    else path = this.getCenterPath();

    if (!path) return null;

    const brushStyle = this.brushStyle || {};

    return {
      id: this.id,
      type: "stroke",
      tool: this.tool,

      // The live preview already owns this array; cloning it on every
      // frame adds another full pass over long strokes. Finalized elements
      // still receive an independent point snapshot.
      points: this.active && this.deferSmoothing
        ? this.points
        : this.points.map(p => ({ ...p })),

      path,

      renderMode: (variableWidth || isCalligraphy) ? "fill" : "stroke",

      style: {
        color: this.color,
        size: this.baseSize,
        opacity: preset === "watercolor" ? this.opacity * 0.72 : preset === "soft" ? this.opacity * 0.82 : this.opacity,
        fill: (variableWidth || isCalligraphy) ? this.color : "none",
        lineCap: brushStyle.lineCap || "round",
        lineJoin: brushStyle.lineJoin || "round",
        dashArray: brushStyle.dashArray || "",
        customBrush: brushStyle.image || null,
        calligraphyClean: isCalligraphy,
        brushPreset: preset,
        brushAngle: this.calligraphyAngle,
        brushOpacity: preset === "watercolor" ? this.opacity * 0.72 : preset === "soft" ? this.opacity * 0.82 : this.opacity
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
      tool: "pencil",
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
    this.renderFrameId = null;
    this.renderFrameUsesTimeout = false;
    this.canvasPreviewPointCount = 0;
    this.canvasPreviewTransform = null;
    this.shapeRecognitionApplied = false;
    this.idleCorrectionApplied = false;
    this.workerRequestId = 0;
    this.smoothingWorker = null;
    if (typeof Worker !== "undefined") {
      try {
        this.smoothingWorker = new Worker(
          new URL("./smoothing-worker.js", import.meta.url),
          { type: "module" }
        );
        this.smoothingWorker.onmessage = event => {
          const result = event.data || {};
          if (result.id !== this.workerRequestId) return;
          if (!this.drawing || this.destroyed || this.builder.deferSmoothing) return;
          if (!Array.isArray(result.points)) {
            this.builder.workerFilteredPoints = null;
            this.renderCurrent();
            return;
          }
          this.builder.workerFilteredPoints = result.points;
          this.renderCurrent();
        };
        this.smoothingWorker.onerror = error => {
          console.warn("Rasem smoothing worker failed; using main-thread fallback.", error);
          this.smoothingWorker?.terminate?.();
          this.smoothingWorker = null;
          if (this.drawing && !this.builder.deferSmoothing) {
            this.builder.workerFilteredPoints = null;
            this.renderCurrent();
          }
        };
      } catch (error) {
        console.warn("Rasem smoothing worker unavailable; using main-thread fallback.", error);
        this.smoothingWorker = null;
      }
    }
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
    this.idleCorrectionApplied = false;
    this.drawing = true;
    this.activePointer = event.pointerId ?? null;

    this.points = [];
    this.canvasPreviewPointCount = 0;
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
      lineCorrection: this.settings.lineCorrection,
      brushStyle: { ...this.brushStyle }
    });

    // يبدأ كل قلم بضربة خام؛ لا تصحيح بصرياً أثناء الكتابة.
    this.builder.deferSmoothing = true;

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
    if (!this.drawing || this.destroyed) {
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

    // إذا استأنف المستخدم الرسم بعد توقف قصير والتصحيح التلقائي،
    // نسمح بمتابعة الضربة من آخر نقطة مصححة.
    if (this.shapeRecognitionApplied || this.idleCorrectionApplied) {
      this.shapeRecognitionApplied = false;
      this.idleCorrectionApplied = false;
      this.clearShapeRecognitionTimer();
      // استئناف الحركة يعيد المسار إلى العرض الخام ويعيد انتظار السكون.
      this.builder.deferSmoothing = true;
      this.builder.workerFilteredPoints = null;
      this.workerRequestId++;
    }

    const added = this.addPoint(point, input);

    if (added) {
      // Coalesced pointer samples are all retained immediately, while
      // expensive SVG outline construction is performed at most once/frame.
      this.scheduleRenderCurrent();
    }

    // أعد تشغيل مؤقت السكون عند كل حدث حركة، حتى لو كانت الحركة
    // أصغر من minDistance ولم تُضف عينة جديدة إلى المسار.
    // بذلك لا يبدأ التصحيح ما دام المستخدم يحرك القلم.
    this.scheduleShapeRecognition();

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

    // لا يجري أي تصحيح مؤجل أثناء تحرك الإصبع.
    // ننتظر ثباته عند نهاية الضربة مع بقائه مضغوطاً،
    // وهذا يشمل قلم الخط العربي وبقية أقلام الرسم.
    if (
      !this.drawing ||
      this.settings.tool === "eraser" ||
      this.settings.lineCorrection <= 0 ||
      this.builder.points.length < 2
    ) return;

    this.shapeRecognitionTimer = setTimeout(() => {
      this.shapeRecognitionTimer = null;
      if (!this.drawing || this.destroyed) return;

      // بعد ثبات الإصبع مع استمرار الضغط، نعرض المسار المنعّم.
      // هذا التنعيم محافظ ويخص الانحناءات؛ لا يشغّل التعرف الهندسي.
      this.idleCorrectionApplied = true;
      this.builder.deferSmoothing = false;
      if (!this.requestWorkerSmoothing()) this.renderCurrent();

      // لا نحوّل ضربات الخط العربي إلى أشكال هندسية؛
      // نكتفي بتنعيم مسارها بعد انتهاء الكتابة والتوقف عند نهايته.
      const brushPreset = String(this.builder.brushStyle?.preset || "");
      const isCalligraphy =
        this.builder.tool === "calligraphy" ||
        brushPreset === "calligraphy" ||
        brushPreset.startsWith("cal-");
      if (
        isCalligraphy ||
        this.shapeRecognitionApplied ||
        !["pen", "pencil", "marker"].includes(this.settings.tool) ||
        this.builder.points.length < 8
      ) return;

      const confirmed = recognizeShape(this.builder.points, {
        strength: this.settings.lineCorrection
      });
      // لا نعتمد أي تحويل هندسي إلا عندما تتجاوز الثقة الحد المحافظ.
      if (!confirmed?.points?.length || confirmed.confidence < 0.72) return;

      // إبطال نتيجة التنعيم السابقة لأن هندسة الضربة تغيرت بالتعرف.
      this.workerRequestId++;
      this.builder.workerFilteredPoints = null;
      this.builder.points = confirmed.points.map(point => ({ ...point }));
      this.points = this.builder.points;
      this.lastPoint = this.builder.points.at(-1) || null;
      this.shapeRecognitionApplied = true;
      this.currentElement.recognition = {
        type: confirmed.type,
        confidence: confirmed.confidence,
        corners: Array.isArray(confirmed.corners) ? confirmed.corners.length : 0,
        angles: confirmed.angles || [],
        angleTypes: confirmed.angleTypes || []
      };
      this.renderCurrent();
    }, 400);
  }

  requestWorkerSmoothing() {
    if (!this.smoothingWorker || !this.drawing || this.builder.points.length < 3) return false;
    const id = ++this.workerRequestId;
    const points = this.builder.points.map(point => ({ ...point }));
    try {
      this.smoothingWorker.postMessage({
        id,
        points,
        strength: this.settings.lineCorrection
      });
      return true;
    } catch (error) {
      console.warn("Rasem smoothing worker request failed; using main-thread fallback.", error);
      return false;
    }
  }

  buildPath(points) {
    return this.builder.smoothing.toPath(
      this.builder.smoothing.process(points)
    );
  }

  scheduleRenderCurrent() {
    if (!this.currentElement || this.renderFrameId !== null) return false;

    const render = () => {
      this.renderFrameId = null;
      this.renderFrameUsesTimeout = false;
      if (this.drawing && !this.destroyed) this.renderCurrent();
    };

    if (typeof requestAnimationFrame === "function") {
      this.renderFrameId = requestAnimationFrame(render);
    } else {
      this.renderFrameUsesTimeout = true;
      this.renderFrameId = setTimeout(render, 16);
    }
    return true;
  }

  cancelScheduledRender() {
    if (this.renderFrameId === null) return;
    if (this.renderFrameUsesTimeout) clearTimeout(this.renderFrameId);
    else if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.renderFrameId);
    this.renderFrameId = null;
    this.renderFrameUsesTimeout = false;
  }

  flushScheduledRender() {
    this.cancelScheduledRender();
    return this.renderCurrent();
  }

  renderCurrent() {
    if (!this.currentElement) return false;

    // Live preview for every drawing pen: avoid building a complete SVG
    // outline on each pointer event. Canvas receives only the new samples.
    if (this.drawing && this.builder.deferSmoothing) {
      const source = this.builder.points;
      this.renderer.resizeCanvasPreview?.();
      const canvas = this.renderer.canvasPreview;
      const rect = canvas?.getBoundingClientRect?.();
      const screenOrigin = this.coordinates.worldToScreen(0, 0);
      const screenUnit = this.coordinates.worldToScreen(1, 0);
      const screenScale = screenOrigin && screenUnit
        ? Math.hypot(screenUnit.x - screenOrigin.x, screenUnit.y - screenOrigin.y)
        : 1;
      const transform = screenOrigin ? {
        x: screenOrigin.x,
        y: screenOrigin.y,
        scale: screenScale
      } : null;
      const previousTransform = this.canvasPreviewTransform;
      const transformChanged = transform && previousTransform && (
        Math.abs(transform.x - previousTransform.x) > 0.25 ||
        Math.abs(transform.y - previousTransform.y) > 0.25 ||
        Math.abs(transform.scale - previousTransform.scale) > 0.001
      );
      if (transformChanged) {
        this.renderer.clearCanvasPreview?.();
        this.canvasPreviewPointCount = 0;
      }
      this.canvasPreviewTransform = transform;
      const canvasNeedsReset = this.renderer.canvasPreviewId !== this.currentElement.id;
      const from = canvasNeedsReset ? 0 : Math.max(0, this.canvasPreviewPointCount - 1);
      const screenPoints = rect ? source.slice(from).map(point => {
        const screen = this.coordinates.worldToScreen(point);
        return screen ? {
          x: screen.x - rect.left,
          y: screen.y - rect.top,
          pressure: point.pressure,
          time: point.time
        } : null;
      }).filter(Boolean) : [];

      const preset = String(this.builder.brushStyle?.preset || "");
      const isCalligraphy = this.builder.tool === "calligraphy" ||
        preset === "calligraphy" || preset.startsWith("cal-");
      const brushStyle = this.builder.brushStyle || {};
      this.currentElement.points = source;
      this.currentElement.renderMode = (isCalligraphy ||
        (this.builder.pressureEnabled && !["marker", "pencil"].includes(this.builder.tool)))
        ? "fill" : "stroke";
      this.currentElement.style = {
        ...(this.currentElement.style || {}),
        color: this.builder.color,
        size: this.builder.baseSize,
        opacity: preset === "watercolor" ? this.builder.opacity * 0.72 : preset === "soft" ? this.builder.opacity * 0.82 : this.builder.opacity,
        fill: isCalligraphy ? this.builder.color : "none",
        lineCap: brushStyle.lineCap || "round",
        lineJoin: brushStyle.lineJoin || "round",
        dashArray: brushStyle.dashArray || "",
        customBrush: brushStyle.image || null,
        calligraphyClean: isCalligraphy,
        brushPreset: brushStyle.preset || "round",
        brushAngle: this.builder.calligraphyAngle
      };

      if (screenPoints.length && this.renderer.appendCanvasPreview?.(
        this.currentElement.id,
        screenPoints,
        { ...this.currentElement.style, size: this.builder.baseSize * screenScale },
        {
          tool: this.builder.tool,
          calligraphy: isCalligraphy,
          calligraphyAngle: this.builder.calligraphyAngle,
          brushPreset: brushStyle.preset || "round",
          pressureEnabled: this.builder.pressureEnabled
        }
      )) {
        this.canvasPreviewPointCount = source.length;
        return true;
      }

      // Fallback: retain incremental SVG chunks for calligraphy. Other tools
      // use the regular SVG renderer only when Canvas is unavailable.
      const builtPreview = this.builder.build();
      if (!builtPreview) return false;
      this.currentElement = {
        ...this.currentElement,
        ...builtPreview,
        points: source
      };
      if (isCalligraphy && source.length > 1 && this.builder.calligraphyPreviewDelta) {
        const appended = this.renderer.appendPreviewChunk?.(
          this.currentElement,
          this.builder.calligraphyPreviewDelta
        );
        if (appended) return true;
      }
      return this.renderer.updateElement(this.currentElement);
    }

    const built = this.builder.build();
    if (!built) return false;

    this.currentElement = {
      ...this.currentElement,
      ...built,
      points: this.builder.points
    };

    this.renderer.clearCanvasPreview?.();
    this.canvasPreviewPointCount = 0;
    return this.renderer.updateElement(this.currentElement);
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

    // Flush the last queued frame before finalizing so pointerup geometry
    // and the committed SVG can never lag behind the collected samples.
    this.cancelScheduledRender();

    // رفع القلم هو الحدث الحاسم لنهاية الضربة:
    // نلتقط إحداثيات pointerup نفسها قبل بناء المسار النهائي،
    // لأن آخر pointermove قد لا يصل إلى آخر موضع فعلي للمس.
    this.clearShapeRecognitionTimer();

    let finalizedElement = null;
    if (this.settings.tool !== "eraser" && this.currentElement) {
      const finalPoint = this.getWorldPoint(event);
      const lastPoint = this.builder.points.at(-1);

      if (
        !this.idleCorrectionApplied &&
        !this.shapeRecognitionApplied &&
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

      // لا ننفذ أي تصحيح عند رفع الإصبع.
      // التصحيح لا يحدث إلا إذا اكتملت مهلة السكون الطويل أثناء بقاء
      // المؤشر مضغوطاً على الشاشة.

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
              // Arabic stroke recognition is intentionally disabled for the calligraphy tool.
              if (element.tool !== "calligraphy") {
                this.arabicWriting?.observe(element, layer, this.settings);
              }
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
    this.cancelScheduledRender();
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
    this.cancelScheduledRender();
    this.clearShapeRecognitionTimer();
    this.workerRequestId++;
    this.renderer?.clearCanvasPreview?.();
    this.canvasPreviewPointCount = 0;
    this.canvasPreviewTransform = null;
    this.shapeRecognitionApplied = false;
    this.idleCorrectionApplied = false;
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
    this.smoothingWorker?.terminate?.();
    this.smoothingWorker = null;

    this.document = null;
    this.renderer = null;
    this.history = null;
    this.coordinates = null;

    this.destroyed = true;
  }
}

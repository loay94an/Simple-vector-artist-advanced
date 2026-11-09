
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

// Preserve raw samples for ordinary tools. Arabic calligraphy uses a
// dedicated low-pass + Catmull-Rom pipeline so only that tool gets fluid curves.
function pointsToPath(points) {
  if (!Array.isArray(points) || !points.length) return "";
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y} l 0.01 0`;
  }
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
  ).join(" ");
}

function smoothCalligraphyPoints(source) {
  if (!Array.isArray(source) || source.length < 3) return source || [];

  // Three gentle passes remove hand tremor without flattening the stroke ends.
  let filtered = source.map(point => ({ ...point }));
  for (let pass = 0; pass < 3; pass++) {
    const next = filtered.map(point => ({ ...point }));
    for (let i = 1; i < filtered.length - 1; i++) {
      const before = filtered[i - 1], current = filtered[i], after = filtered[i + 1];
      next[i] = {
        ...current,
        x: before.x * 0.22 + current.x * 0.56 + after.x * 0.22,
        y: before.y * 0.22 + current.y * 0.56 + after.y * 0.22,
        pressure: before.pressure * 0.22 + current.pressure * 0.56 + after.pressure * 0.22
      };
    }
    filtered = next;
  }

  // Resample with a centripetal-style Catmull-Rom curve for a continuous nib path.
  const result = [filtered[0]];
  const subdivisions = 3;
  for (let i = 0; i < filtered.length - 1; i++) {
    const p0 = filtered[Math.max(0, i - 1)];
    const p1 = filtered[i];
    const p2 = filtered[i + 1];
    const p3 = filtered[Math.min(filtered.length - 1, i + 2)];
    for (let step = 1; step <= subdivisions; step++) {
      const t = step / subdivisions, t2 = t * t, t3 = t2 * t;
      const interpolate = key => 0.5 * (
        2 * p1[key] +
        (-p0[key] + p2[key]) * t +
        (2*p0[key] - 5*p1[key] + 4*p2[key] - p3[key]) * t2 +
        (-p0[key] + 3*p1[key] - 3*p2[key] + p3[key]) * t3
      );
      result.push({
        x: interpolate("x"),
        y: interpolate("y"),
        pressure: Math.max(0, Math.min(1, interpolate("pressure"))),
        time: p1.time + (p2.time - p1.time) * t
      });
    }
  }
  return result;
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
    // Only the Arabic calligraphy tool receives strong live curve smoothing.
    // Raw captured samples remain untouched in this.points for editing/history.
    return this.tool === "calligraphy"
      ? smoothCalligraphyPoints(this.points)
      : this.points;
  }

  getCenterPath() {
    return pointsToPath(
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
"feather-pointed":"point", "feather-flat":"flat", "feather-round":"round", "feather-fan":"soft", "feather-soft":"soft", "feather-dry":"dry", "feather-quill":"ink", "feather-script":"flat", round:"round"
    };
    const kind = profiles[preset];
    if (!kind || preset === "dash" || preset === "custom") return "";
    const feather = preset.startsWith("feather-");
    const featherAngle = feather ? EngineUtils.number(this.brushStyle?.featherAngle,0)*Math.PI/180 : angle;
    const featherPressure=feather?EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherPressure,.75),0,1):0;
    const featherSpeed=feather?EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherSpeed,.25),0,1):0;
    const pressureAt = p => {const raw=EngineUtils.clamp(.35+EngineUtils.number(p.pressure,.5)*.65,.25,1.15);return this.pressureEnabled?(feather?1-featherPressure+raw*featherPressure:raw):1;};
    const radiusAt = (p, i) => {
      let r = this.baseSize * 0.5 * pressureAt(p);
      if (kind === "point") r *= 0.22 + pressureAt(p) * 0.78;
      if (kind === "oval") r *= 0.72;
      if (kind === "soft" || kind === "watercolor") r *= 1.12;
      if (kind === "highlighter") r *= 0.92;
      const prev=points[Math.max(0,i-1)], next=points[Math.min(points.length-1,i+1)];
      const elapsed=Math.max(1,EngineUtils.number(next.time,p.time)-EngineUtils.number(prev.time,p.time));
      const speed=EngineUtils.distance(prev,next)/elapsed;
      const speedFactor=EngineUtils.clamp(1.12-speed*.22,.78,1.12);r*=feather?1-featherSpeed+speedFactor*featherSpeed:speedFactor;
      if (kind === "flat") {
        const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
        r *= 0.12 + Math.abs(Math.sin(Math.atan2(b.y-a.y,b.x-a.x)-(feather?featherAngle:angle)))*0.88;
      }
      return Math.max(0.35,r);
    };
    const poly = pts => pts.map((p,i)=>`${i?"L":"M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")+" Z";
    if (feather) {
      const density=EngineUtils.clamp(Math.round(EngineUtils.number(this.brushStyle?.featherDensity,10)),3,48),spread=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherSpread,.45),0,1),spacing=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherSpacing,1),.25,2.5),gap=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherGap,.35),0,1.5),taper=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherTaper,.7),0,1),balancedFade=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherFade,0),0,1),texture=EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherTexture,.35),0,1),headAngle=EngineUtils.number(this.brushStyle?.featherAngle,0)*Math.PI/180;
      const lanes=preset==="feather-fan"?density:preset==="feather-flat"?Math.max(4,density):preset==="feather-soft"?Math.max(6,density):preset==="feather-dry"?Math.max(4,density):preset==="feather-quill"?Math.max(3,Math.min(9,density)):Math.max(5,density);
      if(points.length===1){const p=points[0],r=radiusAt(p,0);return `M ${(p.x-r).toFixed(2)} ${p.y.toFixed(2)} a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r*2).toFixed(2)} 0 a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-r*2).toFixed(2)} 0`;}
      const paths=[];for(let lane=0;lane<lanes;lane++){const t=lane/(lanes-1)*2-1;let dist=t;if(preset==="feather-fan")dist=Math.sign(t)*Math.pow(Math.abs(t),.72);if(preset==="feather-pointed"||preset==="feather-quill")dist=Math.sign(t)*Math.pow(Math.abs(t),1.55);if(preset==="feather-round"||preset==="feather-soft")dist=Math.sin(t*Math.PI/2);const left=[],right=[];
        for(let i=0;i<points.length;i++){const pt=points[i],prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dy=next.y-prev.y,len=Math.hypot(dx,dy)||1;let nx=-dy/len,ny=dx/len;if(headAngle!==0){const ox=nx,oy=ny,c=Math.cos(headAngle),sn=Math.sin(headAngle);nx=ox*c-oy*sn;ny=ox*sn+oy*c;}const progress=i/(points.length-1),edge=Math.max(0,1-Math.min(1,Math.min(progress,1-progress)*5)),taperFactor=Math.max(.06,1-taper*edge),balancedFactor=1-balancedFade*.72*edge,r=radiusAt(pt,i)*taperFactor*balancedFactor;let weight=1;if(preset==="feather-pointed"||preset==="feather-quill")weight=.35+.65*Math.pow(Math.max(0,1-Math.abs(t)),.65);if(preset==="feather-round")weight=.55+.45*Math.sqrt(Math.max(0,1-t*t));if(preset==="feather-soft")weight=.72+.28*Math.sqrt(Math.max(0,1-t*t));if(preset==="feather-fan")weight=.8+.2*(1-Math.abs(t));if(preset==="feather-dry")weight=.55+.45*(lane%3===0?1:.72);const off=dist*spread*spacing*r*(1+gap*.65),variation=1-texture*.22+texture*.44*(.5+.5*Math.sin((lane+1)*12.9898+(i+1)*7.233)),lr=Math.max(.12,r*(preset==="feather-fan"?.075:preset==="feather-flat"?.22:preset==="feather-dry"?.075:preset==="feather-soft"?.24:.17)*weight*variation*(1-gap*.35)),cx=pt.x+nx*off,cy=pt.y+ny*off;left.push({x:cx+nx*lr,y:cy+ny*lr});right.push({x:cx-nx*lr,y:cy-ny*lr});}
        paths.push(poly([...left,...right.reverse()]));}return paths.join(" ");
    }

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
      "cal-thuluth": 1.30,
      "cal-naskh": 1.00,
      "cal-ruqah": 0.82,
      "cal-fine": 0.48,
      "cal-kufi": 1.38,
      "cal-italic": 1.12,
      "cal-stub": 0.96,
      "cal-oblique": 1.06,
      "cal-diwani": 1.18,
      "cal-jali": 1.42,
      "cal-maghribi": 1.16,
      "cal-taliq": 0.92,
      "cal-sini": 1.04,
      "cal-brush": 1.22,
      "cal-needle": 0.38,
      "cal-square": 1.28
    };

    const nibScale = nibWidths[this.brushStyle?.preset] || 1;
    const radius = Math.max(0.6, (this.baseSize / 2) * nibScale);

    const getRadius = (point, index) => {
      const pressureMultiplier = this.pressureEnabled
        ? (0.35 + (point.pressure || 1) * 0.65)
        : 1;
      const previous=points[Math.max(0,index-1)], next=points[Math.min(points.length-1,index+1)];
      const direction=Math.atan2(next.y-previous.y,next.x-previous.x);
      const preset=String(this.brushStyle?.preset||"");
      const nibAngle=direction-angleRad;
      const broadNib=["cal-kufi","cal-square","cal-jali","cal-sini","cal-italic","cal-oblique","cal-stub"].includes(preset);
      const contrast=broadNib ? (0.10+Math.abs(Math.sin(nibAngle))*0.90) : 1;
      let profile=1;
      if (preset==="cal-ruqah") profile=0.78+0.22*Math.abs(Math.sin(nibAngle));
      else if (preset==="cal-diwani") profile=0.88+0.12*Math.abs(Math.cos(nibAngle));
      else if (preset==="cal-taliq") profile=0.82+0.18*Math.abs(Math.cos(nibAngle));
      else if (preset==="cal-maghribi") profile=0.92+0.08*Math.abs(Math.sin(nibAngle));
      else if (preset==="cal-brush") profile=0.72+0.28*pressureMultiplier;
      else if (preset==="cal-fine" || preset==="cal-needle") profile=0.72+0.28*pressureMultiplier;
      const elapsed=Math.max(1,EngineUtils.number(next.time,point.time)-EngineUtils.number(previous.time,point.time));
      const speed=EngineUtils.distance(previous,next)/elapsed;
      const speedFactor=EngineUtils.clamp(1.12-speed*0.22,0.78,1.12);
      return radius * pressureMultiplier * contrast * profile * speedFactor;
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
    if (this.active && this.deferSmoothing && this.tool !== "calligraphy") {
      let delta = "";
      if (this.calligraphyPreviewPointCount > points.length) { this.calligraphyPreviewDelta = "";
        this.calligraphyPreviewPointCount = 0;
        this.calligraphyPreviewPath = "";
      }

      // لا ننشئ بصمة اصطناعية عند أول نقطة لمس؛ ننتظر أول مقطع
      // حركة حقيقي حتى يتحدد اتجاه الضربة وتظهر هيئة السن كما ينبغي.
      if (this.calligraphyPreviewPointCount === 0) {
        this.calligraphyPreviewPath = "";
        this.calligraphyPreviewDelta = "";
        this.calligraphyPreviewPointCount = 1;
      }

      for (
        let i = Math.max(1, this.calligraphyPreviewPointCount);
        i < points.length;
        i++
      ) {
        const segment = makeSegment(
          points[i - 1],
          points[i],
          getRadius(points[i - 1], i - 1),
          getRadius(points[i], i)
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

    // The first real segment supplies the nib-shaped stroke head.
    // Do not add a synthetic cap at the initial pointer-down coordinate.
    const preset = String(this.brushStyle?.preset || "");

    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      segments.push(
        makeSegment(start, end, getRadius(start, i - 1), getRadius(end, i))
      );
    }

    // شكل النهاية يُبنى على محور الضربة، لا على زاوية سن القلم؛
    // لذلك تبقى سماكته المختارة ثابتة مهما تغيّرت زاوية الخط.
    if (points.length > 1) {
      const lastIndex = points.length - 1;
      const lastPoint = points[lastIndex];
      const previousPoint = points[lastIndex - 1];
      const dx = lastPoint.x - previousPoint.x;
      const dy = lastPoint.y - previousPoint.y;
      const length = Math.hypot(dx, dy) || 1;
      const tx = dx / length, ty = dy / length;
      const nx = -ty, ny = tx;
      const endStyle = ["thin", "wide", "pointed", "crescent"].includes(this.brushStyle?.calligraphyEndStyle)
        ? this.brushStyle.calligraphyEndStyle
        : "none";

      if (endStyle !== "none") {
        // احذف المقطع الأخير ذي السماكة المرتبطة بزاوية السن واستبدله
        // بوصلة مستقلة ذات عرض نهائي ثابت مشتق من حجم القلم فقط.
        segments.pop();
        const baseRadius = Math.max(0.45, this.baseSize * nibScale * 0.5);
        const pressureFactor = this.pressureEnabled
          ? EngineUtils.clamp(0.35 + EngineUtils.number(lastPoint.pressure, 1) * 0.65, 0.25, 1.15)
          : 1;
        const endRadius = baseRadius * pressureFactor;
        const capLength = Math.max(1.2, Math.min(endRadius * 1.15, length * 0.8));
        const start = { x: lastPoint.x - tx * capLength, y: lastPoint.y - ty * capLength };
        const startRadius = getRadius(previousPoint, lastIndex - 1);
        const endWidth = endStyle === "wide" ? endRadius * 1.18
          : endStyle === "pointed" ? 0.035
          : endStyle === "thin" ? Math.max(0.12, endRadius * 0.10)
          : endRadius * 0.72;
        const poly = [
          { x: start.x + nx * startRadius, y: start.y + ny * startRadius },
          { x: lastPoint.x + nx * endWidth, y: lastPoint.y + ny * endWidth },
          { x: lastPoint.x - nx * endWidth, y: lastPoint.y - ny * endWidth },
          { x: start.x - nx * startRadius, y: start.y - ny * startRadius }
        ];
        segments.push(poly.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z");

        if (endStyle === "crescent") {
          const r = endRadius;
          const left = { x: lastPoint.x - tx * r * 0.18 + nx * r, y: lastPoint.y - ty * r * 0.18 + ny * r };
          const right = { x: lastPoint.x - tx * r * 0.18 - nx * r, y: lastPoint.y - ty * r * 0.18 - ny * r };
          const tip = { x: lastPoint.x + tx * r * 0.55, y: lastPoint.y + ty * r * 0.55 };
          const hollow = { x: lastPoint.x + tx * r * 0.05, y: lastPoint.y + ty * r * 0.05 };
          segments.push(`M ${left.x.toFixed(2)} ${left.y.toFixed(2)} Q ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} ${right.x.toFixed(2)} ${right.y.toFixed(2)} Q ${hollow.x.toFixed(2)} ${hollow.y.toFixed(2)} ${left.x.toFixed(2)} ${left.y.toFixed(2)} Z`);
        }
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

    const preset = String(this.brushStyle?.preset || "round");
    const presetOutline = !isCalligraphy && !["round", "dash", "custom"].includes(preset);
    const variableWidth = isCalligraphy || this.tool === "feather" || presetOutline || (pressureEnabled && this.tool !== "marker" && this.tool !== "pencil");
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
        calligraphyEndStyle: brushStyle.calligraphyEndStyle || "none",
        brushOpacity: preset === "watercolor" ? this.opacity * 0.72 : preset === "soft" ? this.opacity * 0.82 : this.opacity,
        featherDensity: this.brushStyle?.featherDensity ?? 10,
        featherGlow: this.brushStyle?.featherGlow ?? 0,
        featherSpacing: this.brushStyle?.featherSpacing ?? 1,
        featherSpread: this.brushStyle?.featherSpread ?? 0.45,
        featherSoftness: this.brushStyle?.featherSoftness ?? 0.35,
        featherTaper: this.brushStyle?.featherTaper ?? 0.7,
        featherFade: EngineUtils.clamp(EngineUtils.number(this.brushStyle?.featherFade, 0), 0, 1),
        featherGap:this.brushStyle?.featherGap??.35,featherPressure:this.brushStyle?.featherPressure??.75,featherSpeed:this.brushStyle?.featherSpeed??.25,featherAngle:this.brushStyle?.featherAngle??0,featherTexture:this.brushStyle?.featherTexture??.35
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
    if (!element || !EngineUtils.validPoint(point)) return Infinity;

    const geometry = element.geometry || {};
    const size = Math.max(0.5, EngineUtils.number(
      element.style?.size ?? element.style?.strokeWidth, 3
    ));
    const halfStroke = size / 2;
    const fill = String(element.style?.fill ?? "none").toLowerCase();
    const hasFill = fill !== "none" && fill !== "transparent" && fill !== "";

    // Freehand strokes: measure against every segment, not their bounding box.
    if (Array.isArray(element.points) && element.points.length) {
      return Math.max(0, this.distanceToPolyline(point, element.points) - halfStroke);
    }

    // Native SVG path geometry (curves and multi-segment arrows included).
    const pathData = typeof geometry.d === "string" ? geometry.d :
      (typeof element.path === "string" ? element.path : "");
    if (pathData) {
      try {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        const length = path.getTotalLength();
        if (Number.isFinite(length) && length > 0) {
          let minimum = Infinity;
          const steps = Math.max(24, Math.min(500, Math.ceil(length / 3)));
          for (let i = 0; i <= steps; i++) {
            const p = path.getPointAtLength(length * i / steps);
            minimum = Math.min(minimum, EngineUtils.distance(point, p));
          }
          return Math.max(0, minimum - halfStroke);
        }
      } catch {}
      const samples = this.samplePointsFromPath(pathData);
      if (samples.length) return Math.max(0, this.distanceToPolyline(point, samples) - halfStroke);
    }

    // Polygon vertices are stored as an SVG "x,y x,y ..." string.
    if (typeof geometry.points === "string") {
      const nums = geometry.points.match(/-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?/gi)?.map(Number) || [];
      const polygon = [];
      for (let i = 0; i + 1 < nums.length; i += 2) polygon.push({ x: nums[i], y: nums[i + 1] });
      if (polygon.length >= 2) {
        if (hasFill && this.pointInPolygon(point, polygon)) return 0;
        const closed = polygon.length > 2 ? [...polygon, polygon[0]] : polygon;
        return Math.max(0, this.distanceToPolyline(point, closed) - halfStroke);
      }
    }

    // Straight line / arrow legacy geometry.
    if ([geometry.x1, geometry.y1, geometry.x2, geometry.y2].every(v => Number.isFinite(Number(v)))) {
      const a = { x: Number(geometry.x1), y: Number(geometry.y1) };
      const b = { x: Number(geometry.x2), y: Number(geometry.y2) };
      return Math.max(0, this.distanceToSegment(point, a, b) - halfStroke);
    }

    // Ellipses and circles: support center/radius geometry explicitly.
    if (Number.isFinite(geometry.cx) && Number.isFinite(geometry.cy)) {
      const rx = Math.abs(EngineUtils.number(geometry.rx ?? geometry.r, 0));
      const ry = Math.abs(EngineUtils.number(geometry.ry ?? geometry.r, rx));
      if (rx > 0 && ry > 0) {
        const nx = (point.x - geometry.cx) / rx;
        const ny = (point.y - geometry.cy) / ry;
        const normalized = Math.hypot(nx, ny);
        if (hasFill && normalized <= 1) return 0;
        // Approximate the nearest ellipse edge in document units.
        const angle = Math.atan2(ny, nx);
        const edge = { x: geometry.cx + Math.cos(angle) * rx, y: geometry.cy + Math.sin(angle) * ry };
        return Math.max(0, EngineUtils.distance(point, edge) - halfStroke);
      }
    }

    // Text uses its rendered text box as the selectable region.
    if (element.type === "text" || element.svgTag === "text") {
      const tx = EngineUtils.number(geometry.x, 0);
      const ty = EngineUtils.number(geometry.y, 0);
      const fontSize = EngineUtils.number(element.style?.fontSize || element.style?.size, 24);
      const tw = (element.text || "").length * fontSize * 0.65 || fontSize * 2;
      const th = fontSize * 1.2;
      const inside = point.x >= tx && point.x <= tx + tw && point.y >= ty - th && point.y <= ty;
      if (inside) return 0;
      const closest = { x: EngineUtils.clamp(point.x, tx, tx + tw), y: EngineUtils.clamp(point.y, ty - th, ty) };
      return EngineUtils.distance(point, closest);
    }

    // Rectangles: filled interiors are selectable; unfilled ones hit their outline.
    const x = EngineUtils.number(geometry.x, NaN);
    const y = EngineUtils.number(geometry.y, NaN);
    const width = EngineUtils.number(geometry.width, NaN);
    const height = EngineUtils.number(geometry.height, NaN);
    if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
      const inside = point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
      if (inside && hasFill) return 0;
      const closestX = EngineUtils.clamp(point.x, x, x + width);
      const closestY = EngineUtils.clamp(point.y, y, y + height);
      if (inside) {
        return Math.max(0, Math.min(point.x - x, x + width - point.x, point.y - y, y + height - point.y) - halfStroke);
      }
      return Math.max(0, EngineUtils.distance(point, { x: closestX, y: closestY }) - halfStroke);
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
      eraserSize: 16,
      eraserMode: "partial",
      calligraphyAngle: 45
    };


    this.builder = new StrokeBuilder({
      minDistance: this.settings.minDistance
    });

    this.drawing = false;
    this.activePointer = null;

    this.currentElement = null;
    this.points = [];

    this.lastPoint = null;
    this.changed = false;

    this.erasedIds = new Set();
    this.previousEraserPoint = null;
    this.destroyed = false;
    this.shapeRecognitionTimer = null;
    this.renderFrameId = null;
    this.renderFrameUsesTimeout = false;
    this.canvasPreviewPointCount = 0;
    this.canvasPreviewTransform = null;
    this.shapeRecognitionApplied = false;
    this.idleCorrectionApplied = false;
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
          : null,
        calligraphyEndStyle: ["none", "thin", "wide", "pointed", "crescent"].includes(settings.brushStyle.calligraphyEndStyle)
          ? settings.brushStyle.calligraphyEndStyle
          : "none",
        featherDensity: EngineUtils.clamp(Math.round(EngineUtils.number(settings.brushStyle.featherDensity, 10)), 3, 48),
        featherGlow: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherGlow, 0), 0, 1),
        featherSpacing: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherSpacing, 1), 0.25, 2.5),
        featherSpread: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherSpread, 0.45), 0, 1),
        featherSoftness: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherSoftness, 0.35), 0, 1),
        featherTaper: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherTaper, 0.7), 0, 1),
        featherFade: EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherFade, 0), 0, 1),
        featherGap:EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherGap,.35),0,1.5),featherPressure:EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherPressure,.75),0,1),featherSpeed:EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherSpeed,.25),0,1),featherAngle:EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherAngle,0),0,180),featherTexture:EngineUtils.clamp(EngineUtils.number(settings.brushStyle.featherTexture,.35),0,1)
      };
    }

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
      this.previousEraserPoint = { x: point.x, y: point.y };
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
      return this.eraseAlongPath(point);
    }

    const input = pointerData || event;

    // Continue appending captured pointer samples without post-stroke correction.
    if (this.shapeRecognitionApplied || this.idleCorrectionApplied) {
      this.shapeRecognitionApplied = false;
      this.idleCorrectionApplied = false;
      this.clearShapeRecognitionTimer();
      // Resume directly from the captured samples.
      this.builder.deferSmoothing = true;
        }

    const added = this.addPoint(point, input);

    if (added) {
      // Coalesced pointer samples are all retained immediately, while
      // expensive SVG outline construction is performed at most once/frame.
      this.scheduleRenderCurrent();
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
    // Automatic correction and geometric recognition are intentionally off.
    this.clearShapeRecognitionTimer();
    return false;
  }

  buildPath(points) {
    return pointsToPath(points);
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
    if (this.drawing && this.builder.deferSmoothing && this.builder.tool !== "calligraphy") {
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
      // Feather geometry is a single continuous ribbon. Redraw the full
      // accumulated stroke instead of compositing tiny tapered segments.
      const featherFullPreview = this.builder.tool === "feather";
      const from = (canvasNeedsReset || featherFullPreview) ? 0 : Math.max(0, this.canvasPreviewPointCount - 1);
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
        (this.builder.tool === "feather" || (this.builder.pressureEnabled && !["marker", "pencil"].includes(this.builder.tool))))
        ? "fill" : "stroke";
      this.currentElement.style = {
        ...(this.currentElement.style || {}),
        color: this.builder.color,
        size: this.builder.baseSize,
        opacity: preset === "watercolor" ? this.builder.opacity * 0.72 : preset === "soft" ? this.builder.opacity * 0.82 : this.builder.opacity,
        fill: (isCalligraphy || this.builder.tool === "feather") ? this.builder.color : "none",
        lineCap: brushStyle.lineCap || "round",
        lineJoin: brushStyle.lineJoin || "round",
        dashArray: brushStyle.dashArray || "",
        customBrush: brushStyle.image || null,
        calligraphyClean: isCalligraphy,
        brushPreset: brushStyle.preset || "round",
        brushAngle: this.builder.calligraphyAngle,
        calligraphyEndStyle: brushStyle.calligraphyEndStyle || "none",
        featherDensity: brushStyle.featherDensity ?? 10,
        featherGlow: brushStyle.featherGlow ?? 0,
        featherSpacing: brushStyle.featherSpacing ?? 1,
        featherSpread: brushStyle.featherSpread ?? 0.45,
        featherSoftness: brushStyle.featherSoftness ?? 0.35,
        featherTaper: brushStyle.featherTaper ?? 0.7,
        featherFade: EngineUtils.clamp(EngineUtils.number(brushStyle.featherFade, 0), 0, 1),
        featherGap: brushStyle.featherGap ?? .35,
        featherPressure: brushStyle.featherPressure ?? .75,
        featherSpeed: brushStyle.featherSpeed ?? .25,
        featherAngle: brushStyle.featherAngle ?? 0,
        featherTexture: brushStyle.featherTexture ?? .35
      };

      if (screenPoints.length && this.renderer.appendCanvasPreview?.(
        this.currentElement.id,
        screenPoints,
        { ...this.currentElement.style, size: this.builder.baseSize * screenScale },
        {
          reset: featherFullPreview,
          tool: this.builder.tool,
          calligraphy: isCalligraphy,
          calligraphyAngle: this.builder.calligraphyAngle,
          calligraphyEndStyle: brushStyle.calligraphyEndStyle || "none",
          brushPreset: brushStyle.preset || "round",
          featherDensity: brushStyle.featherDensity,
          featherGlow: brushStyle.featherGlow,
          featherSpacing: brushStyle.featherSpacing,
          featherSpread: brushStyle.featherSpread,
          featherSoftness: brushStyle.featherSoftness,
          featherTaper: brushStyle.featherTaper,
          featherFade: brushStyle.featherFade,
          featherGap: brushStyle.featherGap,
          featherPressure: brushStyle.featherPressure,
          featherSpeed: brushStyle.featherSpeed,
          featherAngle: brushStyle.featherAngle,
          featherTexture: brushStyle.featherTexture,
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

      // Commit the captured points without post-stroke smoothing or correction.
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


  eraseAlongPath(point) {
    if (!EngineUtils.validPoint(point)) return false;
    const previous = this.previousEraserPoint;
    this.previousEraserPoint = { x: point.x, y: point.y };
    if (!previous || !EngineUtils.validPoint(previous)) return this.eraseAt(point);

    const distance = EngineUtils.distance(previous, point);
    const radius = Math.max(1, this.getEraserTolerance());
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.4)));
    let changed = false;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      changed = this.eraseAt({
        x: previous.x + (point.x - previous.x) * t,
        y: previous.y + (point.y - previous.y) * t
      }) || changed;
    }
    return changed;
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

      // Include the visible stroke width so touching its painted edge erases it.
      const strokeHalfWidth = Math.max(0, EngineUtils.number(element.style?.size, 0) / 2);
      const effectiveRadius = radius + strokeHalfWidth;
      const dist = HitTesting.getElementDistance(element, point);
      if (dist > effectiveRadius) continue;

      if (Array.isArray(element.points) && element.points.length > 0) {
        const points = element.points;
        const fragments = [];
        let current = [];

        const flushFragment = () => {
          if (current.length > 1) fragments.push(current);
          current = [];
        };

        if (points.length === 1) {
          if (distanceToEraser(points[0]) > effectiveRadius) {
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
              effectiveRadius * effectiveRadius;

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

              if (distanceToEraser(middle) > effectiveRadius) {
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

    this.document = null;
    this.renderer = null;
    this.history = null;
    this.coordinates = null;

    this.destroyed = true;
  }
}

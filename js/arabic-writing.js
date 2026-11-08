/*
 * Arabic calligraphy intelligence for Rasem.
 *
 * Keeps handwriting as editable vector strokes. It does not perform OCR,
 * replace letters with fonts, or invent missing glyph geometry.
 * It groups likely word strokes/diacritics, analyzes stroke structure,
 * applies low-risk centerline cleanup, and rebuilds the angled-nib outline.
 */

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function boundsOf(points) {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathFromPoints(points) {
  if (!Array.isArray(points) || !points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l 0.01 0`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i], next = points[i + 1];
    if (next) path += ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
    else path += ` L ${p.x} ${p.y}`;
  }
  return path;
}

function strokeStyleKey(element, layerId) {
  const style = element?.style || {};
  return [
    layerId, element?.tool || "", style.color || "",
    Math.round(Number(style.size) * 10) / 10,
    Math.round(Number(style.opacity) * 100) / 100
  ].join("|");
}

function analyzeStroke(points, wordBounds = null) {
  const bounds = boundsOf(points);
  if (!bounds || !Array.isArray(points) || points.length < 2) {
    return { bounds, kind: "dot", confidence: 0.25, length: 0, curvature: 0 };
  }

  let length = 0, turns = 0, pressureSum = 0, pressureSq = 0, pressureCount = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Number.isFinite(p.pressure)) {
      pressureSum += p.pressure;
      pressureSq += p.pressure * p.pressure;
      pressureCount++;
    }
    if (i) length += distance(points[i - 1], p);
    if (i > 1) {
      const a = points[i - 1], b = points[i - 2];
      const ux = a.x - b.x, uy = a.y - b.y;
      const vx = p.x - a.x, vy = p.y - a.y;
      const denom = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (denom > 0.001 && (ux * vx + uy * vy) / denom < 0.82) turns++;
    }
  }

  const major = Math.max(bounds.width, bounds.height, 0.01);
  const minor = Math.max(0.01, Math.min(bounds.width || major, bounds.height || major));
  const aspect = major / minor;
  const density = length / major;
  const pressureMean = pressureCount ? pressureSum / pressureCount : 1;
  const pressureVariance = pressureCount
    ? Math.max(0, pressureSq / pressureCount - pressureMean * pressureMean)
    : 0;

  const markScale = wordBounds ? Math.max(10, wordBounds.height) : major;
  const isCompact = major <= markScale * 0.38;
  const isDotLike = isCompact && density < 2.8;
  const kind = isDotLike ? "diacritic-candidate" :
    (aspect > 2.8 ? "elongated-stroke" : turns >= 2 ? "curved-or-looped-stroke" : "body-stroke");

  return {
    bounds, kind,
    confidence: Math.min(0.94, 0.48 + Math.min(0.25, turns * 0.06) + (isDotLike ? 0.18 : 0)),
    length, curvature: turns, aspect, pressureMean, pressureVariance
  };
}

function isMarkCandidate(strokeBounds, wordBounds) {
  if (!strokeBounds || !wordBounds) return false;
  const wordHeight = Math.max(12, wordBounds.height);
  const major = Math.max(strokeBounds.width, strokeBounds.height);
  const small = major <= wordHeight * 0.42;
  const centerX = (strokeBounds.minX + strokeBounds.maxX) / 2;
  const nearX = centerX >= wordBounds.minX - wordHeight * 0.3 &&
    centerX <= wordBounds.maxX + wordHeight * 0.3;
  const nearY = strokeBounds.minY >= wordBounds.minY - wordHeight * 0.9 &&
    strokeBounds.maxY <= wordBounds.maxY + wordHeight * 0.9;
  return small && nearX && nearY;
}

function canJoin(group, candidate, now) {
  if (!group || !candidate || now - group.lastAt > 1550) return false;
  if (group.styleKey !== candidate.styleKey) return false;

  const a = group.bounds, b = candidate.bounds;
  const height = Math.max(14, a.height, b.height);
  const horizontalGap = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const verticalOverlap = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const centerYGap = Math.abs((a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2);

  if (isMarkCandidate(b, a) || isMarkCandidate(a, b)) return true;
  return horizontalGap <= height * 1.55 &&
    (verticalOverlap >= height * 0.1 || centerYGap <= height * 0.58);
}

function smoothCalligraphyCenterline(element) {
  const source = element?.points;
  if (!Array.isArray(source) || source.length < 5) return false;

  const size = Math.max(0.5, Number(element.style?.size) || 1);
  const corrected = source.map(p => ({ ...p }));
  const threshold = Math.max(0.45, size * 0.075);
  let changed = false;

  for (let i = 1; i < source.length - 1; i++) {
    const prev = source[i - 1], cur = source[i], next = source[i + 1];
    const ax = cur.x - prev.x, ay = cur.y - prev.y;
    const bx = next.x - cur.x, by = next.y - cur.y;
    const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
    if (al < 0.001 || bl < 0.001) continue;

    const dot = (ax * bx + ay * by) / (al * bl);
    // Keep calligraphic corners, turns and intentional hooks intact.
    if (dot < 0.90) continue;

    const mx = (prev.x + next.x) / 2;
    const my = (prev.y + next.y) / 2;
    const deviation = Math.hypot(cur.x - mx, cur.y - my);
    if (deviation > threshold) continue;

    corrected[i].x += (mx - cur.x) * 0.12;
    corrected[i].y += (my - cur.y) * 0.12;
    if (Number.isFinite(prev.pressure) && Number.isFinite(next.pressure)) {
      const targetPressure = (prev.pressure + next.pressure) / 2;
      corrected[i].pressure += (targetPressure - corrected[i].pressure) * 0.08;
    }
    changed = true;
  }

  if (!changed) return false;

  element.arabicWriting = {
    ...(element.arabicWriting || {}),
    originalGeometry: {
      points: source.map(p => ({ ...p })),
      path: element.path
    },
    correctionApplied: "calligraphy-centerline-micro-smoothing"
  };
  element.points = corrected;
  return true;
}

function rebuildCalligraphyOutline(element) {
  const points = element?.points;
  if (!Array.isArray(points) || !points.length) return false;

  const meta = element.calligraphyMeta || {};
  const angle = Number.isFinite(meta.angle) ? meta.angle : 45;
  const angleRad = angle * Math.PI / 180;
  const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
  const nibWidths = { "cal-thuluth": 1.25, "cal-naskh": 1, "cal-ruqah": 0.85, "cal-fine": 0.6 };
  const scale = nibWidths[meta.preset] || 1;
  const radius = Math.max(0.6, (Math.max(0.5, Number(element.style?.size) || 1) / 2) * scale);
  const pressureEnabled = meta.pressureEnabled !== false;

  const pointRadius = p => radius * (pressureEnabled ? 0.35 + (Number(p.pressure) || 1) * 0.65 : 1);
  const segmentPath = (start, end, startRadius, endRadius) => {
    const polygon = [
      { x: start.x + cosA * startRadius, y: start.y + sinA * startRadius },
      { x: end.x + cosA * endRadius, y: end.y + sinA * endRadius },
      { x: end.x - cosA * endRadius, y: end.y - sinA * endRadius },
      { x: start.x - cosA * startRadius, y: start.y - sinA * startRadius }
    ];
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) polygon.reverse();
    return polygon.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z";
  };

  const segments = [];
  if (points.length === 1) {
    const p = points[0], r = pointRadius(p), half = Math.max(0.6, r * 0.5);
    const tx = -sinA, ty = cosA;
    segments.push(segmentPath(
      { x: p.x - tx * half, y: p.y - ty * half },
      { x: p.x + tx * half, y: p.y + ty * half }, r, r
    ));
  } else {
    for (let i = 1; i < points.length; i++) {
      segments.push(segmentPath(points[i - 1], points[i], pointRadius(points[i - 1]), pointRadius(points[i])));
    }
  }

  const nextPath = segments.join(" ");
  if (!nextPath || nextPath === element.path) return false;
  element.arabicWriting = {
    ...(element.arabicWriting || {}),
    originalOutline: element.arabicWriting?.originalOutline || element.path
  };
  element.path = nextPath;
  return true;
}

function conservativeSmooth(element) {
  if (!element || element.renderMode !== "stroke" || !Array.isArray(element.points) || element.points.length < 5) return false;
  if (element.style?.fill && element.style.fill !== "none") return false;

  const source = element.points;
  const corrected = source.map(p => ({ ...p }));
  const threshold = Math.max(0.65, Math.max(0.5, Number(element.style?.size) || 1) * 0.14);
  let changed = false;

  for (let i = 1; i < source.length - 1; i++) {
    const prev = source[i - 1], cur = source[i], next = source[i + 1];
    const chord = distance(prev, next);
    if (chord < 0.001) continue;
    const midpoint = { x: (prev.x + next.x) / 2, y: (prev.y + next.y) / 2 };
    const deviation = distance(cur, midpoint);
    const ax = cur.x - prev.x, ay = cur.y - prev.y;
    const bx = next.x - cur.x, by = next.y - cur.y;
    const denom = Math.hypot(ax, ay) * Math.hypot(bx, by);
    const direction = denom > 0.001 ? (ax * bx + ay * by) / denom : -1;
    if (deviation <= threshold && direction > 0.72) {
      corrected[i].x += (midpoint.x - cur.x) * 0.18;
      corrected[i].y += (midpoint.y - cur.y) * 0.18;
      changed = true;
    }
  }
  if (!changed) return false;

  element.arabicWriting = {
    ...(element.arabicWriting || {}),
    originalGeometry: { points: source.map(p => ({ ...p })), path: element.path },
    correctionApplied: "micro-jitter-only"
  };
  element.points = corrected;
  element.path = pathFromPoints(corrected);
  return true;
}

export class ArabicWritingAssistant {
  constructor(documentModel, renderer, options = {}) {
    this.document = documentModel;
    this.renderer = renderer;
    this.onCommit = typeof options.onCommit === "function" ? options.onCommit : null;
    this.delay = Math.max(500, Number(options.delay) || 1350);
    this.currentGroup = null;
    this.timer = null;
    this.destroyed = false;
  }

  observe(element, layer) {
    if (this.destroyed || !element || !layer) return false;
    if (!["pen", "pencil", "calligraphy"].includes(element.tool)) return false;
    if (!Array.isArray(element.points) || element.points.length < 2) return false;

    const bounds = boundsOf(element.points);
    if (!bounds || Math.hypot(bounds.width, bounds.height) < 2) return false;
    const now = Date.now();
    const candidate = {
      id: element.id, bounds, styleKey: strokeStyleKey(element, layer.id),
      at: now, tool: element.tool
    };

    if (!canJoin(this.currentGroup, candidate, now)) {
      this.finalize();
      this.currentGroup = {
        id: `arabic-word-${now}-${Math.random().toString(36).slice(2, 8)}`,
        layerId: layer.id, styleKey: candidate.styleKey,
        strokeIds: [element.id], bounds, startedAt: now, lastAt: now,
        tool: element.tool
      };
    } else {
      const group = this.currentGroup;
      group.strokeIds.push(element.id);
      group.bounds = {
        minX: Math.min(group.bounds.minX, bounds.minX),
        minY: Math.min(group.bounds.minY, bounds.minY),
        maxX: Math.max(group.bounds.maxX, bounds.maxX),
        maxY: Math.max(group.bounds.maxY, bounds.maxY),
        width: Math.max(group.bounds.maxX, bounds.maxX) - Math.min(group.bounds.minX, bounds.minX),
        height: Math.max(group.bounds.maxY, bounds.maxY) - Math.min(group.bounds.minY, bounds.minY)
      };
      group.lastAt = now;
    }

    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.finalize();
    }, this.delay);
    return true;
  }

  finalize() {
    const group = this.currentGroup;
    this.currentGroup = null;
    if (!group || this.destroyed) return false;

    const layer = this.document?.layers?.find(item => item.id === group.layerId);
    if (!layer || layer.locked) return false;

    let changed = false;
    group.strokeIds.forEach((id, index) => {
      const element = layer.elements.find(item => item.id === id);
      if (!element) return;

      const analysis = analyzeStroke(element.points, group.bounds);
      const markCandidate = isMarkCandidate(analysis.bounds, group.bounds);
      const prior = element.arabicWriting || {};
      element.arabicWriting = {
        ...prior,
        groupId: group.id,
        sequence: index,
        strokeCount: group.strokeIds.length,
        grouping: "spatial-temporal-word-candidate",
        strokeAnalysis: {
          kind: analysis.kind,
          confidence: analysis.confidence,
          curvature: analysis.curvature,
          aspect: analysis.aspect || 1,
          pressureVariance: analysis.pressureVariance || 0
        },
        markCandidate,
        recognition: {
          mode: "vector-structure-analysis",
          letterIdentity: null,
          confidence: 0
        }
      };

      if (element.tool === "calligraphy") {
        // Preserve the calligraphic nib angle and pressure while smoothing
        // only tiny deviations along nearly straight portions of the baseline.
        changed = smoothCalligraphyCenterline(element) || changed;
        changed = rebuildCalligraphyOutline(element) || changed;
      } else {
        changed = conservativeSmooth(element) || changed;
      }
      changed = true; // group/analysis metadata is also a document change
    });

    if (changed) {
      this.document.touch?.();
      this.renderer?.render?.(this.document);
      this.onCommit?.();
    }
    return changed;
  }

  clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.clearTimer();
    this.currentGroup = null;
    this.document = null;
    this.renderer = null;
    this.onCommit = null;
    this.destroyed = true;
  }
}

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
    // قلم الخط العربي مستثنى تماماً من تحليل الحروف وتجميع الضربات.
    if (!["pen", "pencil"].includes(element.tool)) return false;
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

      // لا نعدّل هندسة الضربة بعد رفع الإصبع؛ ذلك كان مسار تصحيح ثانياً
      // يعمل بمؤقت مستقل بعد انتهاء الكتابة ويتجاوز شرط الضغط المطوّل.
      // يبقى هنا تحليل بنية الحروف وتجميع الضربات كبيانات وصفية فقط.
      changed = true;
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

/*
 * Arabic handwriting grouping and conservative vector cleanup.
 *
 * This module intentionally does not convert handwriting to text or guess
 * Arabic letters. It groups nearby pen strokes (including likely marks)
 * into a visual word candidate and only removes tiny, low-amplitude jitter
 * from ordinary unfilled strokes. Original geometry is retained for undo
 * and future recognition models.
 */

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function boundsOf(points) {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathFromPoints(points) {
  if (!Array.isArray(points) || !points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l 0.01 0`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (next) {
      path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
    } else {
      path += ` L ${current.x} ${current.y}`;
    }
  }
  return path;
}

function strokeStyleKey(element, layerId) {
  const style = element?.style || {};
  return [
    layerId,
    element?.tool || "",
    style.color || "",
    Math.round(Number(style.size) * 10) / 10,
    Math.round(Number(style.opacity) * 100) / 100
  ].join("|");
}

function isMarkCandidate(strokeBounds, wordBounds) {
  if (!strokeBounds || !wordBounds) return false;
  const wordHeight = Math.max(12, wordBounds.height);
  const small = Math.max(strokeBounds.width, strokeBounds.height) <= wordHeight * 0.42;
  const centerX = (strokeBounds.minX + strokeBounds.maxX) / 2;
  const wordCenterX = (wordBounds.minX + wordBounds.maxX) / 2;
  const horizontalNear =
    centerX >= wordBounds.minX - wordHeight * 0.3 &&
    centerX <= wordBounds.maxX + wordHeight * 0.3;
  const verticalNear =
    strokeBounds.minY >= wordBounds.minY - wordHeight * 0.9 &&
    strokeBounds.maxY <= wordBounds.maxY + wordHeight * 0.9;
  return small && horizontalNear && verticalNear &&
    Math.abs(centerX - wordCenterX) <= wordBounds.width + wordHeight;
}

function canJoin(group, candidate, now) {
  if (!group || !candidate) return false;
  if (now - group.lastAt > 1350) return false;
  if (group.styleKey !== candidate.styleKey) return false;

  const a = group.bounds;
  const b = candidate.bounds;
  const height = Math.max(14, a.height, b.height);
  const horizontalGap = Math.max(
    0,
    Math.max(a.minX - b.maxX, b.minX - a.maxX)
  );
  const verticalOverlap = Math.max(
    0,
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  );
  const centerYGap = Math.abs(
    (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2
  );

  if (isMarkCandidate(b, a)) return true;
  if (isMarkCandidate(a, b)) return true;

  return horizontalGap <= height * 1.65 &&
    (verticalOverlap >= height * 0.12 || centerYGap <= height * 0.62);
}

function conservativeSmooth(element) {
  if (
    !element ||
    element.renderMode !== "stroke" ||
    element.tool === "calligraphy" ||
    !Array.isArray(element.points) ||
    element.points.length < 5 ||
    element.style?.fill && element.style.fill !== "none"
  ) return false;

  const source = element.points;
  const corrected = source.map(point => ({ ...point }));
  const size = Math.max(0.5, Number(element.style?.size) || 1);
  const threshold = Math.max(0.65, size * 0.14);
  let changed = false;

  for (let i = 1; i < source.length - 1; i++) {
    const previous = source[i - 1];
    const current = source[i];
    const next = source[i + 1];
    const chord = distance(previous, next);
    if (chord < 0.001) continue;

    const midpoint = {
      x: (previous.x + next.x) / 2,
      y: (previous.y + next.y) / 2
    };
    const deviation = distance(current, midpoint);
    const ax = current.x - previous.x;
    const ay = current.y - previous.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    const direction = lengths > 0.001 ? (ax * bx + ay * by) / lengths : -1;

    // لا نلمس الانعطافات الواضحة أو النقاط التي تشكل تفاصيل مقصودة.
    if (deviation <= threshold && direction > 0.72) {
      corrected[i].x += (midpoint.x - current.x) * 0.18;
      corrected[i].y += (midpoint.y - current.y) * 0.18;
      changed = true;
    }
  }

  if (!changed) return false;

  element.arabicWriting = {
    ...(element.arabicWriting || {}),
    originalGeometry: {
      points: source.map(point => ({ ...point })),
      path: element.path
    },
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
    this.delay = Math.max(500, Number(options.delay) || 1350);
    this.currentGroup = null;
    this.timer = null;
    this.destroyed = false;
  }

  observe(element, layer, settings = {}) {
    if (this.destroyed || !element || !layer) return false;
    if (!["pen", "pencil", "calligraphy"].includes(element.tool)) return false;
    if (!Array.isArray(element.points) || element.points.length < 2) return false;

    const bounds = boundsOf(element.points);
    if (!bounds || Math.hypot(bounds.width, bounds.height) < 3) return false;

    const now = Date.now();
    const candidate = {
      id: element.id,
      bounds,
      styleKey: strokeStyleKey(element, layer.id),
      at: now
    };

    if (!canJoin(this.currentGroup, candidate, now)) {
      this.finalize();
      this.currentGroup = {
        id: `arabic-word-${now}-${Math.random().toString(36).slice(2, 8)}`,
        layerId: layer.id,
        styleKey: candidate.styleKey,
        strokeIds: [element.id],
        bounds,
        startedAt: now,
        lastAt: now
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
    if (!group || group.strokeIds.length < 2 || this.destroyed) return false;

    const layer = this.document?.layers?.find(item => item.id === group.layerId);
    if (!layer || layer.locked) return false;

    let corrected = false;
    group.strokeIds.forEach((id, index) => {
      const element = layer.elements.find(item => item.id === id);
      if (!element) return;

      const existing = element.arabicWriting || {};
      element.arabicWriting = {
        ...existing,
        groupId: group.id,
        sequence: index,
        strokeCount: group.strokeIds.length,
        grouping: "spatial-temporal-candidate",
        markCandidate: isMarkCandidate(
          boundsOf(element.points),
          group.bounds
        )
      };

      // تصحيح اهتزازات دقيقة فقط في المسارات العادية؛ لا يغير الخط العربي المشطوف
      // أو المسارات المملوءة ذات الضغط، ولا يغير الانحناءات والزوايا الواضحة.
      corrected = conservativeSmooth(element) || corrected;
    });

    this.document.touch?.();
    this.renderer?.render?.(this.document);
    return corrected || true;
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
    this.destroyed = true;
  }
}

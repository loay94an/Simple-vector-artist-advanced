/* =========================================================
   RASEM 3.0 - GEOMETRIC SHAPES & STYLING UI MODULE
   js/shapes-ui.js
   Full options for Geometric Shapes:
   - 9 Shape types (Rectangle, Square, Circle, Ellipse, Triangle, Diamond, Line, Curve, Arrow)
   - Fill cavity with color & quick swatches
   - Stroke thickness (1-50px)
   - Stroke style (Solid, Dashed, Dotted)
   - Corner radius for Rect / Square
   - Live interactive SVG preview
   - Responsive centered dialog on mobile & desktop
========================================================= */

(() => {
  "use strict";

  const modal = document.getElementById("geometryMenu");
  const backdrop = document.getElementById("geometryModalBackdrop");
  const toggleBtn = document.getElementById("shapesMenuToggleBtn");
  const closeBtn = document.getElementById("closeGeometryMenuBtn");
  const applyBtn = document.getElementById("applyShapeBtn");

  const strokeWidthInput = document.getElementById("shapeStrokeWidth");
  const strokeWidthVal = document.getElementById("shapeStrokeWidthVal");

  const fillToggle = document.getElementById("shapeFillToggle");
  const fillControls = document.getElementById("shapeFillControls");
  const fillColorInput = document.getElementById("shapeFillColor");

  const cornerRadiusInput = document.getElementById("shapeCornerRadius");
  const cornerRadiusVal = document.getElementById("shapeCornerRadiusVal");
  const radiusRow = document.getElementById("shapeRadiusRow");

  const previewSvg = document.getElementById("shapePreviewSvg");
  const badge = document.getElementById("shapeIndicatorBadge");

  const shapeSymbols = {
    rect: "▭",
    square: "□",
    circle: "○",
    ellipse: "⬭",
    triangle: "△",
    diamond: "◇",
    line: "／",
    curve: "⌒",
    arrow: "➜"
  };

  let currentShape = "rect";
  let strokeWidth = 3;
  let strokeStyle = "solid";
  let fillEnabled = false;
  let fillColor = "#2563eb";
  let cornerRadius = 0;

  function getShapesTool() {
    const tm = window.rasem?.tools;
    if (!tm) return null;
    if (typeof tm.get === "function") return tm.get("shapes");
    if (typeof tm.getTool === "function") return tm.getTool("shapes");
    if (tm.tools instanceof Map) return tm.tools.get("shapes");
    return null;
  }

  function getActiveColor() {
    return window.rasem?.engine?.settings?.color || "#2563EB";
  }

  function syncFromTool() {
    const tool = getShapesTool();
    if (!tool) return;

    currentShape = tool.shape || "rect";
    strokeWidth = tool.strokeWidth || 3;
    strokeStyle = tool.strokeStyle || "solid";
    fillEnabled = Boolean(tool.fillEnabled);
    fillColor = getActiveColor();
    cornerRadius = tool.cornerRadius || 0;

    // Update UI controls
    if (strokeWidthInput) strokeWidthInput.value = strokeWidth;
    if (strokeWidthVal) strokeWidthVal.textContent = strokeWidth + " px";

    if (fillToggle) fillToggle.checked = fillEnabled;

    if (cornerRadiusInput) cornerRadiusInput.value = cornerRadius;
    if (cornerRadiusVal) cornerRadiusVal.textContent = cornerRadius + " px";

    if (radiusRow) {
      radiusRow.style.display = (currentShape === "rect" || currentShape === "square") ? "block" : "none";
    }

    // Active shape button
    if (modal) {
      modal.querySelectorAll("[data-shape]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.shape === currentShape);
      });

      // Active stroke style button
      modal.querySelectorAll("[data-style]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.style === strokeStyle);
      });
    }

    if (badge) {
      badge.textContent = shapeSymbols[currentShape] || "▭";
    }

    updatePreview();
  }

  function syncToTool() {
    const tool = getShapesTool();
    if (!tool) return;

    fillColor = getActiveColor();

    tool.setOptions({
      shape: currentShape,
      strokeWidth,
      strokeStyle,
      fillEnabled,
      fillColor,
      cornerRadius
    });

    if (badge) {
      badge.textContent = shapeSymbols[currentShape] || "▭";
    }

    updatePreview();
  }

  function updatePreview() {
    if (!previewSvg) return;

    previewSvg.innerHTML = "";

    const strokeColor = getActiveColor();
    let dash = "";
    if (strokeStyle === "dashed") dash = "8 5";
    else if (strokeStyle === "dotted") dash = "3 3";

    const isClosed = !["line", "curve", "arrow"].includes(currentShape);
    const fill = (isClosed && fillEnabled) ? strokeColor : "none";

    let el = null;

    if (currentShape === "rect") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("x", "40");
      el.setAttribute("y", "15");
      el.setAttribute("width", "120");
      el.setAttribute("height", "50");
      if (cornerRadius > 0) {
        el.setAttribute("rx", String(Math.min(cornerRadius, 25)));
        el.setAttribute("ry", String(Math.min(cornerRadius, 25)));
      }
    } else if (currentShape === "square") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("x", "75");
      el.setAttribute("y", "15");
      el.setAttribute("width", "50");
      el.setAttribute("height", "50");
      if (cornerRadius > 0) {
        el.setAttribute("rx", String(Math.min(cornerRadius, 25)));
        el.setAttribute("ry", String(Math.min(cornerRadius, 25)));
      }
    } else if (currentShape === "circle") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("cx", "100");
      el.setAttribute("cy", "40");
      el.setAttribute("r", "25");
    } else if (currentShape === "ellipse") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", "100");
      el.setAttribute("cy", "40");
      el.setAttribute("rx", "55");
      el.setAttribute("ry", "25");
    } else if (currentShape === "triangle") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      el.setAttribute("points", "100,15 155,65 45,65");
    } else if (currentShape === "diamond") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      el.setAttribute("points", "100,12 155,40 100,68 45,40");
    } else if (currentShape === "line") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "line");
      el.setAttribute("x1", "30");
      el.setAttribute("y1", "60");
      el.setAttribute("x2", "170");
      el.setAttribute("y2", "20");
    } else if (currentShape === "curve") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", "M 30 60 Q 100 5 170 60");
    } else if (currentShape === "arrow") {
      el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", "M 30 40 L 165 40 M 145 25 L 165 40 L 145 55");
    }

    if (el) {
      el.setAttribute("stroke", strokeColor);
      el.setAttribute("stroke-width", String(Math.min(strokeWidth, 14)));
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-linejoin", "round");
      if (dash) el.setAttribute("stroke-dasharray", dash);
      el.setAttribute("fill", fill);
      previewSvg.appendChild(el);
    }
  }

  function open() {
    if (!modal) return;
    syncFromTool();
    modal.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (!modal) return;
    if (modal.hidden) {
      open();
    } else {
      close();
    }
  }

  // Event Listeners with LONG-PRESS support
  if (toggleBtn) {
    let pressTimer = null;
    let isLongPress = false;

    toggleBtn.addEventListener("pointerdown", () => {
      isLongPress = false;
      toggleBtn.classList.add("tool-pressing");
      pressTimer = setTimeout(() => {
        isLongPress = true;
        toggleBtn.classList.remove("tool-pressing");
        if (window.rasem && window.rasem.tools) {
          window.rasem.tools.activate("shapes");
        }
        open();
      }, 350); // 350ms long press opens shapes settings dialog
    });

    toggleBtn.addEventListener("pointerup", () => {
      clearTimeout(pressTimer);
      toggleBtn.classList.remove("tool-pressing");
      if (!isLongPress) {
        // Single tap activates shape tool directly without opening dialog
        if (window.rasem && window.rasem.tools) {
          window.rasem.tools.activate("shapes");
        }
        syncToTool();
      }
    });

    toggleBtn.addEventListener("pointercancel", () => {
      clearTimeout(pressTimer);
      toggleBtn.classList.remove("tool-pressing");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", close);
  }

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      syncToTool();
      close();
      if (window.rasem && window.rasem.tools) {
        window.rasem.tools.activate("shapes");
      }
    });
  }

  // Shape button selection
  if (modal) {
    modal.addEventListener("click", (e) => {
      const shapeBtn = e.target.closest("[data-shape]");
      if (shapeBtn) {
        currentShape = shapeBtn.dataset.shape;
        modal.querySelectorAll("[data-shape]").forEach(b => b.classList.remove("active"));
        shapeBtn.classList.add("active");

        if (radiusRow) {
          radiusRow.style.display = (currentShape === "rect" || currentShape === "square") ? "block" : "none";
        }

        syncToTool();
        return;
      }

      const styleBtn = e.target.closest("[data-style]");
      if (styleBtn) {
        strokeStyle = styleBtn.dataset.style;
        modal.querySelectorAll("[data-style]").forEach(b => b.classList.remove("active"));
        styleBtn.classList.add("active");
        syncToTool();
        return;
      }

      const swatch = e.target.closest(".shape-swatch");
      if (swatch) {
        fillColor = swatch.dataset.color;
        if (fillColorInput) fillColorInput.value = fillColor;
        syncToTool();
        return;
      }
    });
  }

  // Stroke width input
  if (strokeWidthInput) {
    strokeWidthInput.addEventListener("input", (e) => {
      strokeWidth = Number(e.target.value);
      if (strokeWidthVal) strokeWidthVal.textContent = strokeWidth + " px";
      syncToTool();
    });
  }

  // Fill toggle
  if (fillToggle) {
    fillToggle.addEventListener("change", (e) => {
      fillEnabled = e.target.checked;
      if (fillControls) fillControls.style.display = fillEnabled ? "block" : "none";
      syncToTool();
    });
  }

  // Fill color input
  if (fillColorInput) {
    fillColorInput.addEventListener("input", (e) => {
      fillColor = e.target.value;
      syncToTool();
    });
  }

  // Corner radius input
  if (cornerRadiusInput) {
    cornerRadiusInput.addEventListener("input", (e) => {
      cornerRadius = Number(e.target.value);
      if (cornerRadiusVal) cornerRadiusVal.textContent = cornerRadius + " px";
      syncToTool();
    });
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) {
      close();
    }
  });

  // Export to window for global access
  window.rasemShapesUI = {
    open,
    close,
    toggle,
    syncFromTool,
    syncToTool
  };

  // Initial sync after load
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(syncFromTool, 100);
  });
})();

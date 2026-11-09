/* =========================================================
   RASEM 3.0 - CONCEPTS-STYLE DYNAMIC RADIAL COLOR WHEEL
   js/color-ui.js
   Corner-docked expanding radial color wheel inspired by Concepts app.
========================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const input = $("colorPicker");
  const openBtn = $("colorMenuBtn");
  const popup = $("colorPickerPopup");
  const closeBtn = $("closeColorPopup");

  const HISTORY_KEY = "rasem-color-history-v2";
  let currentColor = input?.value || "#2563EB";
  let isWheelExpanded = false;
  let activeHue = 217;
  let activeSat = 0.85;
  let activeVal = 0.92;

  // Helpers: Color conversions
  function hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let rgb;

    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    return "#" + rgb.map(n =>
      Math.round((n + m) * 255)
        .toString(16).padStart(2, "0")
    ).join("").toUpperCase();
  }

  function hexToHsv(hex) {
    if (!hex || !hex.startsWith("#")) return { h: 217, s: 0.85, v: 0.92 };
    let c = hex.slice(1);
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const n = parseInt(c, 16);
    if (Number.isNaN(n)) return { h: 217, s: 0.85, v: 0.92 };

    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d > 0.0001) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }

    return {
      h: (h + 360) % 360,
      s: max === 0 ? 0 : d / max,
      v: max
    };
  }

  // Generate Concepts color harmonies
  function getHarmonies(baseHue, s = 0.85, v = 0.9) {
    return [
      { name: "الأساسي", hex: hsvToHex(baseHue, s, v) },
      { name: "المكمل", hex: hsvToHex((baseHue + 180) % 360, s, v) },
      { name: "متجاور 1", hex: hsvToHex((baseHue + 30) % 360, s, v) },
      { name: "متجاور 2", hex: hsvToHex((baseHue + 330) % 360, s, v) },
      { name: "ثلاثي", hex: hsvToHex((baseHue + 120) % 360, s, v) },
      { name: "فاتح", hex: hsvToHex(baseHue, Math.max(0.1, s * 0.4), Math.min(1, v * 1.1)) },
      { name: "داكن", hex: hsvToHex(baseHue, Math.min(1, s * 1.1), Math.max(0.2, v * 0.6)) }
    ];
  }

  // Create or modernize the concepts radial wheel structure
  function initConceptsWheelUI() {
    let container = document.getElementById("conceptsWheelContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "conceptsWheelContainer";
      container.className = "concepts-wheel-container";
      container.setAttribute("dir", "rtl");
      container.innerHTML = `
        <div class="concepts-backdrop" id="conceptsBackdrop"></div>
        <div class="concepts-wheel-card" id="conceptsWheelCard">
          <div class="concepts-wheel-header">
            <div class="concepts-title-row">
              <span class="concepts-dot" id="conceptsTitleDot"></span>
              <strong>عجلة ألوان Concepts</strong>
            </div>
            <button id="conceptsCloseBtn" type="button" class="concepts-close-btn" title="إغلاق">✕</button>
          </div>

          <div class="concepts-canvas-wrap">
            <canvas id="conceptsCanvas" width="280" height="280"></canvas>
            <div class="concepts-center-hub" id="conceptsCenterHub">
              <div class="concepts-center-color" id="conceptsCenterColor"></div>
              <span class="concepts-hex-label" id="conceptsHexLabel">#2563EB</span>
            </div>
          </div>

          <div class="concepts-harmonies-row">
            <span class="concepts-subhead">التناغم اللوني:</span>
            <div class="concepts-harmonies-list" id="conceptsHarmoniesList"></div>
          </div>

          <div class="concepts-controls-row">
            <div class="concepts-slider-group">
              <label>السطوع</label>
              <input type="range" id="conceptsBrightness" min="0.05" max="1" step="0.01" value="0.9">
            </div>
            <div class="concepts-slider-group">
              <label>التشبع</label>
              <input type="range" id="conceptsSaturation" min="0.05" max="1" step="0.01" value="0.85">
            </div>
            <button type="button" id="conceptsEyedropper" class="concepts-eyedropper-btn" title="أداة قطارة اللون">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 11-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l2.5 2.5a2.12 2.12 0 0 0 3 0L19 11Z"/><path d="m5 13 4 4"/><path d="m2 22 3-3"/></svg>
            </button>
          </div>

          <div class="concepts-recent-row">
            <span class="concepts-subhead">الألوان الأخيرة:</span>
            <div class="concepts-recent-list" id="conceptsRecentList"></div>
          </div>
        </div>
      `;
      document.body.appendChild(container);
    }

    const canvas = $("conceptsCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Hue ring with a central HSV square (hue around, saturation/value inside).
    const geometry = () => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const outer = canvas.width / 2 - 5;
      const inner = outer - 28;
      const square = 112;
      return { cx, cy, outer, inner, square, left: cx - square / 2, top: cy - square / 2 };
    };

    function drawWheel() {
      const w = canvas.width;
      const h = canvas.height;
      const { cx, cy, outer, inner, square, left, top } = geometry();
      ctx.clearRect(0, 0, w, h);

      // Smooth continuous hue ring.
      const segments = 360;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1.4) / segments) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outer, a0, a1);
        ctx.arc(cx, cy, inner, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = hsvToHex(i, 1, 1);
        ctx.fill();
      }

      // Central saturation/value square: pure hue -> white, then black vertically.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, top, square, square, 3);
      ctx.clip();
      ctx.fillStyle = hsvToHex(activeHue, 1, 1);
      ctx.fillRect(left, top, square, square);

      const white = ctx.createLinearGradient(left, top, left + square, top);
      white.addColorStop(0, "#ffffff");
      white.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = white;
      ctx.fillRect(left, top, square, square);

      const black = ctx.createLinearGradient(left, top, left, top + square);
      black.addColorStop(0, "rgba(0,0,0,0)");
      black.addColorStop(1, "#000000");
      ctx.fillStyle = black;
      ctx.fillRect(left, top, square, square);
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, square, square);

      // Selection marker inside the square.
      const markerX = left + activeSat * square;
      const markerY = top + (1 - activeVal) * square;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,23,42,.28)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(markerX, markerY, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Hue selector on the ring.
      const angle = (activeHue * Math.PI) / 180 - Math.PI / 2;
      const mid = (outer + inner) / 2;
      const hx = cx + Math.cos(angle) * mid;
      const hy = cy + Math.sin(angle) * mid;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fillStyle = hsvToHex(activeHue, 1, 1);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }

    function pickFromCoords(x, y) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (x - rect.left) * scaleX;
      const py = (y - rect.top) * scaleY;
      const { cx, cy, outer, inner, square, left, top } = geometry();

      // Square controls saturation (horizontal) and value (vertical).
      if (px >= left && px <= left + square && py >= top && py <= top + square) {
        activeSat = Math.max(0, Math.min(1, (px - left) / square));
        activeVal = Math.max(0, Math.min(1, 1 - (py - top) / square));
      } else {
        // Hue ring controls hue only.
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < inner - 3 || dist > outer + 3) return;
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        activeHue = (angle * 180 / Math.PI + 360) % 360;
      }

      const hex = hsvToHex(activeHue, activeSat, activeVal);
      applyColor(hex, false);
      drawWheel();
      updateHarmonies();
    }

    let isDragging = false;

    canvas.addEventListener("pointerdown", e => {
      isDragging = true;
      canvas.setPointerCapture(e.pointerId);
      pickFromCoords(e.clientX, e.clientY);
    });

    canvas.addEventListener("pointermove", e => {
      if (!isDragging) return;
      pickFromCoords(e.clientX, e.clientY);
    });

    canvas.addEventListener("pointerup", e => {
      if (isDragging) {
        isDragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        saveToHistory(currentColor);
      }
    });

    // Sliders
    const bSlider = $("conceptsBrightness");
    if (bSlider) {
      bSlider.addEventListener("input", e => {
        activeVal = parseFloat(e.target.value);
        const hex = hsvToHex(activeHue, activeSat, activeVal);
        applyColor(hex, false);
        drawWheel();
        updateHarmonies();
      });
    }

    const sSlider = $("conceptsSaturation");
    if (sSlider) {
      sSlider.addEventListener("input", e => {
        activeSat = parseFloat(e.target.value);
        const hex = hsvToHex(activeHue, activeSat, activeVal);
        applyColor(hex, false);
        drawWheel();
        updateHarmonies();
      });
    }

    // Eyedropper
    const eyeBtn = $("conceptsEyedropper");
    if (eyeBtn) {
      eyeBtn.addEventListener("click", () => {
        triggerEyedropperDirectly();
      });
    }

    // Close actions
    $("conceptsCloseBtn")?.addEventListener("click", hideConceptsWheel);
    $("conceptsBackdrop")?.addEventListener("click", hideConceptsWheel);

    drawWheel();
    updateHarmonies();
    renderRecentColors();
  }

  function updateHarmonies() {
    const list = $("conceptsHarmoniesList");
    if (!list) return;
    list.replaceChildren();

    const harmonies = getHarmonies(activeHue, activeSat, activeVal);
    harmonies.forEach(h => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "concepts-swatch";
      btn.style.backgroundColor = h.hex;
      btn.title = `${h.name}: ${h.hex}`;
      btn.addEventListener("click", () => {
        const hsv = hexToHsv(h.hex);
        activeHue = hsv.h;
        activeSat = hsv.s;
        activeVal = hsv.v;
        applyColor(h.hex, true);
        const canvas = $("conceptsCanvas");
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            initConceptsWheelUI();
          }
        }
      });
      list.appendChild(btn);
    });
  }

  function renderRecentColors() {
    const list = $("conceptsRecentList");
    if (!list) return;
    list.replaceChildren();

    let recents = [];
    try {
      recents = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      recents = [];
    }

    if (!recents.length) {
      recents = ["#2563EB", "#10B981", "#EF4444", "#F59E0B", "#8B5CF6", "#06B6D4", "#111827", "#FFFFFF"];
    }

    recents.slice(0, 10).forEach(col => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "concepts-recent-swatch";
      btn.style.backgroundColor = col;
      btn.title = col;
      btn.addEventListener("click", () => {
        const hsv = hexToHsv(col);
        activeHue = hsv.h;
        activeSat = hsv.s;
        activeVal = hsv.v;
        applyColor(col, true);
      });
      list.appendChild(btn);
    });
  }

  function saveToHistory(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    let recents = [];
    try {
      recents = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch { recents = []; }

    recents = [color, ...recents.filter(c => c.toUpperCase() !== color.toUpperCase())].slice(0, 16);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(recents));
    } catch {}
    renderRecentColors();
  }

  function applyColor(color, saveHistory = false) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    currentColor = color.toUpperCase();

    if (input) {
      input.value = currentColor;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    window.rasem?.setSettings?.({ color: currentColor });

    if (openBtn) {
      openBtn.style.setProperty("--selected-color", currentColor);
      const dot = openBtn.querySelector(".color-dot");
      if (dot) dot.style.backgroundColor = currentColor;
    }

    const centerColor = $("conceptsCenterColor");
    const hexLabel = $("conceptsHexLabel");
    const titleDot = $("conceptsTitleDot");
    if (centerColor) centerColor.style.backgroundColor = currentColor;
    if (hexLabel) hexLabel.textContent = currentColor;
    if (titleDot) titleDot.style.backgroundColor = currentColor;

    if (saveHistory) {
      saveToHistory(currentColor);
    }
  }

  async function triggerEyedropperDirectly() {
    // Dismiss any other open modals
    if (typeof window.rasemCloseAllModals === "function") {
      window.rasemCloseAllModals();
    }
    hideConceptsWheel();

    const toast = document.getElementById("toast");
    const showToast = (msg) => {
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2800);
    };

    if (window.EyeDropper) {
      try {
        showToast("أداة القطارة نشطة: انقر لاختيار لون من أي مكان");
        const eye = new window.EyeDropper();
        const res = await eye.open();
        if (res?.sRGBHex) {
          const hsv = hexToHsv(res.sRGBHex);
          activeHue = hsv.h;
          activeSat = hsv.s;
          activeVal = hsv.v;
          applyColor(res.sRGBHex, true);
          showToast(`تم اختيار اللون: ${res.sRGBHex}`);
        }
      } catch {
        // User canceled or pressed ESC
      }
      return;
    }

    // Fallback Canvas Eyedropper
    const svgCanvas = document.getElementById("drawingCanvas");
    if (!svgCanvas) return;

    showToast("أداة القطارة: انقر فوق أي عنصر في اللوحة لاقتطاف لونه");

    const onPick = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      window.removeEventListener("pointerdown", onPick, true);

      try {
        const xml = new XMLSerializer().serializeToString(svgCanvas);
        const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = svgCanvas.clientWidth || 1600;
          off.height = svgCanvas.clientHeight || 1000;
          const oCtx = off.getContext("2d");
          oCtx.drawImage(img, 0, 0, off.width, off.height);
          URL.revokeObjectURL(url);

          const rect = svgCanvas.getBoundingClientRect();
          const px = Math.floor(evt.clientX - rect.left);
          const py = Math.floor(evt.clientY - rect.top);
          const pixel = oCtx.getImageData(px, py, 1, 1).data;
          const hex = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase();

          const hsv = hexToHsv(hex);
          activeHue = hsv.h;
          activeSat = hsv.s;
          activeVal = hsv.v;
          applyColor(hex, true);
          showToast(`تم التقاط اللون: ${hex}`);
        };
        img.src = url;
      } catch (e) {
        console.warn("Eyedropper fallback failed", e);
      }
    };

    window.addEventListener("pointerdown", onPick, { capture: true, once: true });
  }

  function showConceptsWheel() {
    if (typeof window.rasemCloseAllModals === "function") {
      window.rasemCloseAllModals();
    }
    initConceptsWheelUI();
    const container = $("conceptsWheelContainer");
    if (!container) return;

    const hsv = hexToHsv(currentColor);
    activeHue = hsv.h;
    activeSat = hsv.s;
    activeVal = hsv.v;

    container.classList.add("open");
    isWheelExpanded = true;
    updateHarmonies();
    renderRecentColors();
  }

  function hideConceptsWheel() {
    const container = $("conceptsWheelContainer");
    if (!container) return;
    container.classList.remove("open");
    isWheelExpanded = false;
  }

  function toggleConceptsWheel() {
    if (isWheelExpanded) {
      hideConceptsWheel();
    } else {
      showConceptsWheel();
    }
  }

  // Bind Open button with reliable single-click and LONG-PRESS Eyedropper
  if (openBtn) {
    let pressTimer = null;
    let isLongPress = false;

    openBtn.addEventListener("pointerdown", () => {
      clearTimeout(pressTimer);
      isLongPress = false;

      pressTimer = setTimeout(() => {
        isLongPress = true;
        try {
          if (navigator.vibrate) navigator.vibrate(40);
        } catch {}
        triggerEyedropperDirectly();
      }, 380);
    });

    openBtn.addEventListener("pointerup", () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    });

    openBtn.addEventListener("pointercancel", () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      isLongPress = false;
    });

    openBtn.addEventListener("click", (e) => {
      if (isLongPress) {
        e.preventDefault();
        e.stopPropagation();
        isLongPress = false;
        return;
      }

      toggleConceptsWheel();
    });
  }

  // Support long-press directly on canvas workspace to summon Concepts radial wheel
  window.addEventListener("DOMContentLoaded", () => {
    initConceptsWheelUI();
    if (currentColor) applyColor(currentColor, false);
  });

  // Global API
  window.rasemColorWheel = {
    open: showConceptsWheel,
    close: hideConceptsWheel,
    toggle: toggleConceptsWheel,
    triggerEyedropper: triggerEyedropperDirectly,
    setColor: (hex) => applyColor(hex, true)
  };

})();

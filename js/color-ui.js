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
              <strong>اختيار اللون</strong>
              <span class="concepts-hex-label" id="conceptsHexLabel">#2563EB</span>
            </div>
            <button id="conceptsCloseBtn" type="button" class="concepts-close-btn" title="إغلاق">✕</button>
          </div>

          <div class="concepts-canvas-wrap">
            <canvas id="conceptsCanvas" width="280" height="280" aria-label="حلقة لاختيار درجة اللون ودائرة داخلية لاختيار التشبع والسطوع"></canvas>
          </div>

          <div class="concepts-tools-row">
            <span class="concepts-subhead">الحلقة: درجة اللون · الدائرة: التشبع والسطوع</span>
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

    // Outer ring selects hue; the inner circular field selects saturation (X) and value (Y).
    const geometry = () => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const outer = canvas.width / 2 - 7;
      const inner = outer - 38;
      const fieldRadius = inner - 9;
      return { cx, cy, outer, inner, fieldRadius };
    };

    const clamp01 = value => Math.max(0, Math.min(1, value));

    function drawWheel() {
      const { cx, cy, outer, inner, fieldRadius } = geometry();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Smooth, continuous hue ring.
      ctx.save();
      ctx.shadowColor = "rgba(15,23,42,.18)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      let spectrum;
      if (typeof ctx.createConicGradient === "function") {
        spectrum = ctx.createConicGradient(-Math.PI / 2, cx, cy);
        [
          [0, "#FF3030"], [1 / 6, "#FFE13B"], [2 / 6, "#42D66B"],
          [3 / 6, "#25D9D2"], [4 / 6, "#3978FF"], [5 / 6, "#B94BEB"],
          [1, "#FF3030"]
        ].forEach(([stop, color]) => spectrum.addColorStop(stop, color));
        ctx.beginPath();
        ctx.arc(cx, cy, outer, 0, Math.PI * 2);
        ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
        ctx.fillStyle = spectrum;
        ctx.fill("evenodd");
      } else {
        const segments = 720;
        for (let i = 0; i < segments; i++) {
          const a0 = (i / segments) * Math.PI * 2 - Math.PI / 2;
          const a1 = ((i + 1.02) / segments) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, outer, a0, a1);
          ctx.arc(cx, cy, inner, a1, a0, true);
          ctx.closePath();
          ctx.fillStyle = hsvToHex(i * 360 / segments, 1, 1);
          ctx.fill();
        }
      }
      ctx.restore();

      // The inner disk is a simple 2D saturation/value picker.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, fieldRadius, 0, Math.PI * 2);
      ctx.clip();

      const hueColor = hsvToHex(activeHue, 1, 1);
      const saturationGradient = ctx.createLinearGradient(cx - fieldRadius, cy, cx + fieldRadius, cy);
      saturationGradient.addColorStop(0, "#FFFFFF");
      saturationGradient.addColorStop(1, hueColor);
      ctx.fillStyle = saturationGradient;
      ctx.fillRect(cx - fieldRadius, cy - fieldRadius, fieldRadius * 2, fieldRadius * 2);

      const valueGradient = ctx.createLinearGradient(cx, cy - fieldRadius, cx, cy + fieldRadius);
      valueGradient.addColorStop(0, "rgba(0,0,0,0)");
      valueGradient.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = valueGradient;
      ctx.fillRect(cx - fieldRadius, cy - fieldRadius, fieldRadius * 2, fieldRadius * 2);
      ctx.restore();

      // Minimal outlines.
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(15,23,42,.18)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, fieldRadius, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.stroke();

      // Hue selector on the ring.
      const hueAngle = activeHue * Math.PI / 180 - Math.PI / 2;
      const ringRadius = (outer + inner) / 2;
      const hx = cx + Math.cos(hueAngle) * ringRadius;
      const hy = cy + Math.sin(hueAngle) * ringRadius;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(15,23,42,.72)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = hueColor;
      ctx.fill();

      // Crosshair shows the current saturation/value point.
      const sx = cx + (activeSat * 2 - 1) * fieldRadius;
      const sy = cy + (1 - activeVal * 2) * fieldRadius;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fillStyle = currentColor;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.restore();
    }

    function pickFromCoords(x, y) {
      const rect = canvas.getBoundingClientRect();
      const px = (x - rect.left) * canvas.width / rect.width;
      const py = (y - rect.top) * canvas.height / rect.height;
      const { cx, cy, outer, inner, fieldRadius } = geometry();
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy);

      if (dist >= inner - 5 && dist <= outer + 5) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        activeHue = (angle * 180 / Math.PI + 360) % 360;
      } else if (dist <= fieldRadius + 3) {
        activeSat = clamp01((dx / (fieldRadius * 2)) + 0.5);
        activeVal = clamp01(0.5 - (dy / (fieldRadius * 2)));
      } else {
        return;
      }

      const hex = hsvToHex(activeHue, activeSat, activeVal);
      applyColor(hex, false);
      drawWheel();
      updateHarmonies();
    }

    if (canvas.dataset.wheelBound !== "true") {
      canvas.dataset.wheelBound = "true";
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

      const finishWheelDrag = e => {
        if (!isDragging) return;
        isDragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        saveToHistory(currentColor);
      };
      canvas.addEventListener("pointerup", finishWheelDrag);
      canvas.addEventListener("pointercancel", finishWheelDrag);
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

    const hexLabel = $("conceptsHexLabel");
    const titleDot = $("conceptsTitleDot");
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
    const hsv = hexToHsv(currentColor);
    activeHue = hsv.h;
    activeSat = hsv.s;
    activeVal = hsv.v;

    // Repaint from the current color before showing; initialization is idempotent.
    initConceptsWheelUI();
    const container = $("conceptsWheelContainer");
    if (!container) return;

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

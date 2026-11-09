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
    const families = [
      { name: "مكمل", hue: baseHue + 180 },
      { name: "متجاور", hue: baseHue + 30 },
      { name: "متجاور", hue: baseHue + 330 },
      { name: "ثلاثي", hue: baseHue + 120 },
      { name: "مكمل منقسم", hue: baseHue + 150 },
      { name: "مكمل منقسم", hue: baseHue + 210 }
    ];
    const shades = [
      { s: Math.max(0.16, s * 0.38), v: Math.min(1, v * 1.18) },
      { s: Math.max(0.22, s * 0.62), v: Math.min(1, v * 1.04) },
      { s: Math.min(1, s * 0.88), v: Math.max(0.12, v * 0.82) },
      { s: Math.min(1, s), v: Math.max(0.08, v * 0.58) }
    ];
    return families.map(f => ({
      name: f.name,
      colors: shades.map(sh => hsvToHex((f.hue + 360) % 360, sh.s, sh.v))
    }));
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
            <span class="concepts-selected-color" id="conceptsSelectedColor" title="اللون المختار" aria-label="اللون المختار"></span>
          </div>

          <div class="concepts-tools-row">
            <span class="concepts-subhead">الحلقة: درجة اللون · الدائرة: التشبع والسطوع</span>
            <button type="button" id="conceptsEyedropper" class="concepts-eyedropper-btn" title="أداة قطارة اللون">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 11-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l2.5 2.5a2.12 2.12 0 0 0 3 0L19 11Z"/><path d="m5 13 4 4"/><path d="m2 22 3-3"/></svg>
            </button>
          </div>

          <div class="concepts-special-row">
            <span class="concepts-subhead">الألوان المحايدة والمعدنية اللامعة:</span>
            <div class="concepts-special-list" id="conceptsSpecialList"></div>
          </div>

          <div class="concepts-harmonies-row">
            <span class="concepts-subhead">الألوان المتكاملة وتدرجاتها:</span>
            <div class="concepts-harmonies-list" id="conceptsHarmoniesList"></div>
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
      // Keep a generous, non-interactive moat between the hue ring and the SV disk.
      const svTouchRadius = fieldRadius - 9;
      const hueTouchInner = inner + 5;
      const hueTouchOuter = outer + 5;
      return { cx, cy, outer, inner, fieldRadius, svTouchRadius, hueTouchInner, hueTouchOuter };
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

    function getCanvasPoint(x, y) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (x - rect.left) * canvas.width / rect.width,
        y: (y - rect.top) * canvas.height / rect.height
      };
    }

    function getPickerMode(x, y) {
      const p = getCanvasPoint(x, y);
      const { cx, cy, svTouchRadius, hueTouchInner, hueTouchOuter } = geometry();
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (dist <= svTouchRadius) return "sv";
      if (dist >= hueTouchInner && dist <= hueTouchOuter) return "hue";
      return null; // The gap is intentional: it prevents accidental cross-selection.
    }

    function pickFromCoords(x, y, mode) {
      const p = getCanvasPoint(x, y);
      const { cx, cy, fieldRadius, svTouchRadius, hueTouchInner, hueTouchOuter } = geometry();
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy);

      if (mode === "hue") {
        // Hue can only be changed while the gesture began on the outer ring.
        if (dist < hueTouchInner || dist > hueTouchOuter) return;
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        activeHue = (angle * 180 / Math.PI + 360) % 360;
      } else if (mode === "sv") {
        // Lock the gesture to the inner disk; clamp at its safe circular edge.
        const safeDist = Math.min(dist, svTouchRadius);
        const scale = dist > 0 ? safeDist / dist : 0;
        const safeX = dx * scale;
        const safeY = dy * scale;
        activeSat = clamp01(0.5 + safeX / (2 * svTouchRadius));
        activeVal = clamp01(0.5 - safeY / (2 * svTouchRadius));
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
      let activeGesture = null;

      canvas.addEventListener("pointerdown", e => {
        const mode = getPickerMode(e.clientX, e.clientY);
        if (!mode) return;
        e.preventDefault();
        activeGesture = mode;
        canvas.setPointerCapture(e.pointerId);
        pickFromCoords(e.clientX, e.clientY, activeGesture);
      });

      canvas.addEventListener("pointermove", e => {
        if (!activeGesture) return;
        e.preventDefault();
        pickFromCoords(e.clientX, e.clientY, activeGesture);
      });

      const finishWheelDrag = e => {
        if (!activeGesture) return;
        activeGesture = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        saveToHistory(currentColor);
      };
      canvas.addEventListener("pointerup", finishWheelDrag);
      canvas.addEventListener("pointercancel", finishWheelDrag);
      canvas.addEventListener("lostpointercapture", () => { activeGesture = null; });
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

    const specialColors = [
      { group: "محايدة", name: "أبيض نقي", color: "#FFFFFF", finish: "linear-gradient(145deg,#FFFFFF 0%,#F5F5F5 48%,#D9DDE2 100%)" },
      { group: "محايدة", name: "عاجي", color: "#F2E8D5", finish: "linear-gradient(145deg,#FFFDF5 0%,#F2E8D5 52%,#D8CBB4 100%)" },
      { group: "محايدة", name: "بيج", color: "#C8B89A", finish: "linear-gradient(145deg,#E8DCC5 0%,#C8B89A 52%,#9E8D70 100%)" },
      { group: "محايدة", name: "رمادي دافئ", color: "#9B948B", finish: "linear-gradient(145deg,#D1CBC3 0%,#9B948B 52%,#68615A 100%)" },
      { group: "محايدة", name: "رمادي بارد", color: "#9299A3", finish: "linear-gradient(145deg,#E1E5EA 0%,#9299A3 52%,#59616D 100%)" },
      { group: "محايدة", name: "فحمي", color: "#343A40", finish: "linear-gradient(145deg,#737B83 0%,#343A40 52%,#111418 100%)" },
      { group: "محايدة", name: "أسود", color: "#111111", finish: "linear-gradient(145deg,#666666 0%,#222222 48%,#050505 100%)" },
      { group: "محايدة", name: "تاوب", color: "#8A7868", finish: "linear-gradient(145deg,#C5B4A4 0%,#8A7868 52%,#55483E 100%)" },
      { group: "معدنية", name: "ذهبي لامع", color: "#D4AF37", finish: "linear-gradient(115deg,#6F4B08 0%,#C99416 18%,#FFF1A8 36%,#D4AF37 52%,#8B650B 72%,#F9D96A 88%,#9A7418 100%)" },
      { group: "معدنية", name: "ذهبي فاتح", color: "#E6C86E", finish: "linear-gradient(115deg,#98752B 0%,#E6C86E 22%,#FFF7CE 42%,#DDBB58 62%,#A98228 82%,#F8E6A0 100%)" },
      { group: "معدنية", name: "شامبانيا", color: "#C9B27C", finish: "linear-gradient(115deg,#79633D 0%,#C9B27C 22%,#FFF0C4 42%,#BCA16A 65%,#806A45 84%,#E9D7A5 100%)" },
      { group: "معدنية", name: "فضي", color: "#C0C0C0", finish: "linear-gradient(115deg,#656B70 0%,#D8DDE0 22%,#FFFFFF 40%,#AEB5BA 58%,#737A80 78%,#E8ECEF 100%)" },
      { group: "معدنية", name: "بلاتيني", color: "#D5D8DC", finish: "linear-gradient(115deg,#858B91 0%,#E9ECEF 24%,#FFFFFF 43%,#BFC5CA 62%,#777E85 82%,#F7F8F9 100%)" },
      { group: "معدنية", name: "كروم", color: "#AEB7C0", finish: "linear-gradient(115deg,#454D55 0%,#DDE4EA 18%,#FFFFFF 34%,#8D99A4 52%,#F6FAFD 68%,#59636D 86%,#DCE2E8 100%)" },
      { group: "معدنية", name: "روز غولد", color: "#B76E79", finish: "linear-gradient(115deg,#70404A 0%,#C9878D 22%,#FFE0D7 40%,#B76E79 58%,#75414B 80%,#E8B0A8 100%)" },
      { group: "معدنية", name: "نحاسي", color: "#B87333", finish: "linear-gradient(115deg,#633514 0%,#C87935 22%,#FFD09A 40%,#A95D25 60%,#6F3C1A 82%,#E7A15B 100%)" },
      { group: "معدنية", name: "برونزي", color: "#8C6239", finish: "linear-gradient(115deg,#49301C 0%,#A87845 22%,#E8C08A 40%,#875A32 60%,#49301D 82%,#C99A62 100%)" },
      { group: "معدنية", name: "نحاس أحمر", color: "#A34F36", finish: "linear-gradient(115deg,#54271E 0%,#B85F43 22%,#F0B18C 40%,#9D4933 60%,#54271D 82%,#D88A67 100%)" },
      { group: "معدنية", name: "نحاس أصفر", color: "#B5A642", finish: "linear-gradient(115deg,#625719 0%,#C8B94D 22%,#FFF3A0 40%,#A99A32 60%,#625719 82%,#E7D86C 100%)" },
      { group: "معدنية", name: "تيتانيوم", color: "#777F87", finish: "linear-gradient(115deg,#333B43 0%,#AEB7BF 22%,#E9EEF2 40%,#737D86 60%,#343C44 82%,#C6CDD3 100%)" }
    ];

    const specialList = $("conceptsSpecialList");
    if (specialList && specialList.dataset.bound !== "true") {
      specialList.dataset.bound = "true";
      let lastGroup = "";
      specialColors.forEach(item => {
        if (item.group !== lastGroup) {
          const label = document.createElement("span");
          label.className = "concepts-special-group-label";
          label.textContent = item.group;
          specialList.appendChild(label);
          lastGroup = item.group;
        }
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "concepts-special-swatch";
        btn.style.background = item.finish;
        btn.dataset.color = item.color;
        btn.title = item.name + " · " + item.color;
        btn.setAttribute("aria-label", "اختيار " + item.name + " " + item.color);
        btn.addEventListener("click", () => {
          const hsv = hexToHsv(item.color);
          activeHue = hsv.h;
          activeSat = hsv.s;
          activeVal = hsv.v;
          applyColor(item.color, true);
          drawWheel();
        });
        specialList.appendChild(btn);
      });
    }

    drawWheel();
    updateHarmonies();
    renderRecentColors();
  }

  function updateHarmonies() {
    const list = $("conceptsHarmoniesList");
    if (!list) return;
    list.replaceChildren();

    const harmonies = getHarmonies(activeHue, activeSat, activeVal);
    harmonies.forEach((family) => {
      const group = document.createElement("div");
      group.className = "concepts-harmony-family";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", family.name);
      family.colors.forEach((hex, shadeIndex) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "concepts-swatch";
        btn.style.backgroundColor = hex;
        btn.title = family.name + " · درجة " + (shadeIndex + 1) + ": " + hex;
        btn.setAttribute("aria-label", btn.title);
        btn.addEventListener("click", () => {
          const hsv = hexToHsv(hex);
          activeHue = hsv.h;
          activeSat = hsv.s;
          activeVal = hsv.v;
          applyColor(hex, true);
          drawWheel();
          updateHarmonies();
        });
        group.appendChild(btn);
      });
      list.appendChild(group);
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

  // Independent compact menu: only the complementary hue and its shades.
  function updateComplementaryColorsMenu() {
    const menu = $("complementaryColorsMenu");
    if (!menu) return;
    const hsv = hexToHsv(currentColor);
    const family = getHarmonies(hsv.h, hsv.s, hsv.v).find(item => item.name === "مكمل");
    const swatches = menu.querySelector(".complementary-menu-swatches");
    const base = menu.querySelector(".complementary-menu-base");
    if (!family || !swatches || !base) return;
    base.replaceChildren();
    // Reuse the exact circular swatch group and button class used by the wheel.
    const familyGroup = document.createElement("div");
    familyGroup.className = "concepts-harmony-family";
    familyGroup.setAttribute("role", "group");
    familyGroup.setAttribute("aria-label", family.name);
    swatches.replaceChildren();
    family.colors.forEach((hex, index) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "concepts-swatch";
      swatch.style.backgroundColor = hex;
      swatch.title = family.name + " · درجة " + (index + 1) + ": " + hex;
      swatch.setAttribute("aria-label", swatch.title);
      swatch.addEventListener("click", () => {
        const next = hexToHsv(hex);
        activeHue = next.h; activeSat = next.s; activeVal = next.v;
        applyColor(hex, true);
        closeComplementaryColorsMenu();
      });
      familyGroup.appendChild(swatch);
    });
    swatches.appendChild(familyGroup);
  }

  function closeComplementaryColorsMenu() {
    $("complementaryColorsMenu")?.classList.remove("open");
    $("complementaryColorsBtn")?.setAttribute("aria-expanded", "false");
  }

  function initComplementaryColorsMenu() {
    const btn = $("complementaryColorsBtn");
    if (!btn || $("complementaryColorsMenu")) return;
    const menu = document.createElement("div");
    menu.id = "complementaryColorsMenu";
    menu.setAttribute("dir", "rtl");
    menu.innerHTML = '<div class="complementary-menu-title">الألوان المتكاملة</div><div class="complementary-menu-base"></div><div class="complementary-menu-swatches"></div>';
    document.body.appendChild(menu);
    btn.addEventListener("click", event => {
      event.stopPropagation();
      if (menu.classList.contains("open")) { closeComplementaryColorsMenu(); return; }
      updateComplementaryColorsMenu();
      const rect = btn.getBoundingClientRect();
      menu.style.top = Math.round(rect.bottom + 7) + "px";
      menu.style.right = Math.max(8, Math.round(window.innerWidth - rect.right)) + "px";
      menu.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    });
    menu.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("pointerdown", event => {
      if (!menu.contains(event.target) && !btn.contains(event.target)) closeComplementaryColorsMenu();
    });
    window.addEventListener("resize", closeComplementaryColorsMenu);
    window.addEventListener("scroll", closeComplementaryColorsMenu, true);
    updateComplementaryColorsMenu();
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
    const selectedDot = $("conceptsSelectedColor");
    if (hexLabel) hexLabel.textContent = currentColor;
    if (titleDot) titleDot.style.backgroundColor = currentColor;
    if (selectedDot) {
      selectedDot.style.backgroundColor = currentColor;
      selectedDot.title = "اللون المختار: " + currentColor;
      selectedDot.setAttribute("aria-label", "اللون المختار " + currentColor);
    }
    updateHarmonies();
    updateComplementaryColorsMenu();

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
    initComplementaryColorsMenu();
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

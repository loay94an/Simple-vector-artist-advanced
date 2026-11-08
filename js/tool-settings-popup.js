/* =========================================================
   RASEM 3.0 - TOOL SETTINGS POPUP MODULE
   js/tool-settings-popup.js
   Supports Calligraphy, Pencil, Feather, Eraser, and Custom PNG Brushes.
========================================================= */

(() => {
  "use strict";

  const popup = document.getElementById("toolSettingsPopup");
  const title = document.getElementById("toolSettingsTitle");
  const close = document.getElementById("closeToolSettings");
  const toolbar = document.getElementById("toolbar");
  const backdrop = document.getElementById("toolSettingsBackdrop");

  if (!popup || !toolbar || !close) return;

  const names = {
    calligraphy: "إعدادات قلم الخط العربي",
    pencil: "إعدادات قلم الرصاص",
    feather: "إعدادات الريشة",
    eraser: "إعدادات الممحاة الذكية"
  };

  const ids = {
    size: "brushSize",
    opacity: "brushOpacity",
    pressureEnabled: "pressureEnabled",
    featherDensity: "featherDensity",
    featherGlow: "featherGlow",
    featherSpread: "featherSpread",
    featherSoftness: "featherSoftness",
    featherTaper: "featherTaper",
    featherSpacing: "featherSpacing",
    calligraphyEndStyle: "calligraphyEndStyle"
  };

  const presets = {
    round: { lineCap: "round", dashArray: "" },
    calligraphy: { lineCap: "round", dashArray: "", preset: "calligraphy" },
  "cal-thuluth": { lineCap: "round", dashArray: "", preset: "cal-thuluth" },
  "cal-naskh": { lineCap: "round", dashArray: "", preset: "cal-naskh" },
  "cal-ruqah": { lineCap: "round", dashArray: "", preset: "cal-ruqah" },
  "cal-fine": { lineCap: "round", dashArray: "", preset: "cal-fine" },
  "cal-diwani": { lineCap: "round", dashArray: "", preset: "cal-diwani" },
  "cal-jali": { lineCap: "square", dashArray: "", preset: "cal-jali" },
  "cal-maghribi": { lineCap: "round", dashArray: "", preset: "cal-maghribi" },
  "cal-taliq": { lineCap: "round", dashArray: "", preset: "cal-taliq" },
  "cal-sini": { lineCap: "square", dashArray: "", preset: "cal-sini" },
  "cal-brush": { lineCap: "round", dashArray: "", preset: "cal-brush" },
  "cal-needle": { lineCap: "butt", dashArray: "", preset: "cal-needle" },
  "cal-square": { lineCap: "square", dashArray: "", preset: "cal-square" },
    chisel: { lineCap: "square", dashArray: "" },
    square: { lineCap: "square", dashArray: "" },
    dash: { lineCap: "round", dashArray: "8 5" },
    soft: { lineCap: "round", dashArray: "" },
    spray: { lineCap: "round", dashArray: "1 4", preset: "spray" },
    watercolor: { lineCap: "round", dashArray: "", preset: "watercolor" },
    chalk: { lineCap: "square", dashArray: "4 3", preset: "chalk" },
    ink: { lineCap: "round", dashArray: "", preset: "ink" },
    highlighter: { lineCap: "square", dashArray: "", preset: "highlighter" },
    square: { lineCap: "square", dashArray: "" },
    dash: { lineCap: "round", dashArray: "8 5" },
    soft: { lineCap: "round", dashArray: "" },
    flat: { lineCap: "square", dashArray: "" },
    point: { lineCap: "butt", dashArray: "" },
    oval: { lineCap: "round", dashArray: "" },
    dry: { lineCap: "square", dashArray: "5 2 1 3" },
    "cal-kufi": { lineCap: "square", dashArray: "", preset: "cal-kufi" },
    "cal-italic": { lineCap: "square", dashArray: "", preset: "cal-italic" },
    "cal-stub": { lineCap: "round", dashArray: "", preset: "cal-stub" },
    "cal-oblique": { lineCap: "square", dashArray: "", preset: "cal-oblique" },
    "feather-pointed": { lineCap: "round", dashArray: "", preset: "feather-pointed" },
    "feather-flat": { lineCap: "square", dashArray: "", preset: "feather-flat" },
    "feather-round": { lineCap: "round", dashArray: "", preset: "feather-round" },
    "feather-fan": { lineCap: "round", dashArray: "", preset: "feather-fan" },
    "feather-soft": { lineCap: "round", dashArray: "", preset: "feather-soft" },
    "feather-dry": { lineCap: "butt", dashArray: "", preset: "feather-dry" },
    "feather-quill": { lineCap: "round", dashArray: "", preset: "feather-quill" },
    "feather-script": { lineCap: "square", dashArray: "", preset: "feather-script" },
    custom: { lineCap: "round", dashArray: "" }
  };

  const labels = {
    round: "دائرية ناعمة",
    calligraphy: "خط عربي مشطوف",
    chisel: "عريضة هندسية",
    square: "مربعة",
    dash: "متقطعة",
    soft: "فرشاة ناعمة",
    spray: "رش / بخاخ",
    watercolor: "ألوان مائية",
    chalk: "طباشيري / جاف",
    ink: "حبر هندي G-Pen",
    highlighter: "قلم تظليل",
    flat: "رأس مسطح عريض",
    point: "رأس مدبب دقيق",
    oval: "رأس بيضاوي مائل",
    dry: "فرشاة جافة",
    "cal-kufi": "رأس كوفي",
    "cal-italic": "إيطالي مشطوف",
    "cal-stub": "رأس Stub",
    "cal-oblique": "رأس مائل",
    "cal-diwani": "رأس ديواني مرن",
    "cal-jali": "رأس جلي عريض",
    "cal-maghribi": "رأس مغربي",
    "cal-taliq": "رأس تعليق",
    "cal-sini": "رأس صيني مستقيم",
    "cal-brush": "فرشاة خطية",
    "cal-needle": "سن إبرة دقيق",
    "cal-square": "سن كوفي مربع",
    "feather-pointed": "ريشة مدببة",
    "feather-flat": "ريشة مسطحة",
    "feather-round": "ريشة مستديرة",
    "feather-fan": "ريشة مروحية",
    "feather-soft": "ريشة ناعمة",
    "feather-dry": "ريشة جافة",
    "feather-quill": "ريشة قصبة",
    "feather-script": "ريشة كتابة",
    custom: "فرشاة PNG مخصصة"
  };

  const STORAGE = "rasem-per-tool-settings-v2";

  let settings = {};
  let activeTool = "pencil";
  let opened = false;

  try {
    Object.assign(
      settings,
      JSON.parse(localStorage.getItem(STORAGE) || "{}")
    );
  } catch {}

  function read() {
    const result = {};

    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (!el) continue;

      result[key] = el.type === "checkbox"
        ? el.checked
        : el.tagName === "SELECT" ? el.value : Number(el.value);
    }

    result.brush = settings[activeTool]?.brush || (activeTool === "calligraphy" ? "calligraphy" : "round");
    result.customBrush = settings[activeTool]?.customBrush || null;
    result.headSettings = settings[activeTool]?.headSettings || {};
    result.eraserMode = settings[activeTool]?.eraserMode || "partial";
    result.calligraphyAngle = Number(document.getElementById("calligraphyAngle")?.value ?? 45);
    result.calligraphyEndStyle = document.getElementById("calligraphyEndStyle")?.value || "none";
    result.featherDensity = Number(document.getElementById("featherDensity")?.value ?? 10);
    result.featherGlow = Number(document.getElementById("featherGlow")?.value ?? 0);
    result.featherSpacing = Number(document.getElementById("featherSpacing")?.value ?? 1);
    result.featherSpread = Number(document.getElementById("featherSpread")?.value ?? 0.45);
    result.featherSoftness = Number(document.getElementById("featherSoftness")?.value ?? 0.35);
    result.featherTaper = Number(document.getElementById("featherTaper")?.value ?? 0.7);

    return result;
  }

  function save() {
    settings[activeTool] = read();

    try {
      localStorage.setItem(STORAGE, JSON.stringify(settings));
    } catch {}

    apply();
  }

  function apply() {
    const current = settings[activeTool] || {};
    const brush = current.brush || (activeTool === "calligraphy" ? "calligraphy" : "round");
    const style = presets[brush] || presets.round;

    const engine = window.rasem?.engine;
    if (engine) {
      if (activeTool === "eraser") {
        engine.setSettings({
          eraserSize: current.size || 16,
          eraserMode: current.eraserMode || "partial"
        });
      } else {
        engine.setSettings({
          size: current.size,
          opacity: current.opacity,
          pressureEnabled: current.pressureEnabled,
          calligraphyAngle: Number.isFinite(current.calligraphyAngle) ? current.calligraphyAngle : 45,
          calligraphyEndStyle: current.calligraphyEndStyle || "none",
          brushStyle: {
            preset: brush,
            calligraphyEndStyle: current.calligraphyEndStyle || "none",
            lineCap: style.lineCap || "round",
            dashArray: style.dashArray || "",
            image: current.customBrush || null,
            featherDensity: current.featherDensity ?? 10,
            featherGlow: current.featherGlow ?? 0,
            featherSpacing: current.featherSpacing ?? 1,
            featherSpread: current.featherSpread ?? 0.45,
            featherSoftness: current.featherSoftness ?? 0.35,
            featherTaper: current.featherTaper ?? 0.7
          }
        });
      }
    }

    window.dispatchEvent(new CustomEvent("rasem:brush-style", {
      detail: {
        name: brush,
        style,
        image: current.customBrush || null,
        tool: activeTool
      }
    }));

    popup.querySelectorAll("[data-brush]").forEach(button => {
      const selected = button.dataset.brush === brush;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    const preview = document.getElementById("toolBrushPreview");
    if (preview) {
      preview.textContent = "الفرشاة الحالية: " + (labels[brush] || brush);
    }
  }

  function updateOutputs() {
    for (const [id, outputId, suffix, percent] of [
      ["brushSize", "brushSizeValue", "", false],
      ["brushOpacity", "brushOpacityValue", "%", true],
      ["calligraphyAngle", "calligraphyAngleValue", "°", false],
      ["featherDensity", "featherDensityValue", "", false],
      ["featherGlow", "featherGlowValue", "%", true],
      ["featherSpacing", "featherSpacingValue", "%", true],
      ["featherSpread", "featherSpreadValue", "%", true],
      ["featherSoftness", "featherSoftnessValue", "%", true],
      ["featherTaper", "featherTaperValue", "%", true]
    ]) {
      const input = document.getElementById(id);
      const output = document.getElementById(outputId);

      if (!input || !output) continue;

      const value = Number(input.value);

      output.textContent = percent
        ? Math.round(value * 100) + suffix
        : value + (suffix || "");
    }
  }


  // لكل رأس فرشاة ملف إعدادات مستقل؛ الضغطة الطويلة على الرأس تفتح ملفه.
  const headProfiles = {
    feather: {
      "feather-pointed": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing","featherGlow"],
      "feather-flat": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing"],
      "feather-round": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing"],
      "feather-fan": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing","featherGlow"],
      "feather-soft": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing","featherGlow"],
      "feather-dry": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing"],
      "feather-quill": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing"],
      "feather-script": ["featherDensity","featherSpread","featherSoftness","featherTaper","featherSpacing"]
    },
    calligraphy: {
      "*": ["brushSize","brushOpacity","calligraphyAngle","calligraphyEndStyle","pressureEnabled"]
    },
    pencil: {
      "*": ["brushSize","brushOpacity","pressureEnabled"]
    }
  };
  const headLabels = {
    brushSize:"حجم الرأس", brushOpacity:"شفافية الرأس", pressureEnabled:"استجابة الضغط",
    calligraphyAngle:"زاوية السن", calligraphyEndStyle:"نهاية الضربة",
    featherDensity:"عدد الشعيرات", featherSpread:"انتشار الشعيرات",
    featherSoftness:"نعومة الأثر", featherTaper:"تلاشي البداية والنهاية",
    featherSpacing:"تباعد الشعيرات", featherGlow:"التوهج"
  };
  const headRanges = {
    brushSize:{min:0.5,max:120,step:0.5}, brushOpacity:{min:0.05,max:1,step:0.01},
    calligraphyAngle:{min:0,max:180,step:1}, featherDensity:{min:3,max:32,step:1},
    featherSpread:{min:0,max:1,step:0.05}, featherSoftness:{min:0,max:1,step:0.05},
    featherTaper:{min:0,max:1,step:0.05}, featherSpacing:{min:0.25,max:2.5,step:0.05},
    featherGlow:{min:0,max:1,step:0.05}
  };
  let headOptionsPanel = null;
  let headPressTimer = null;
  let headPressMoved = false;
  let headPressButton = null;
  let headPressStartX = 0;
  let headPressStartY = 0;
  let headLongPressFired = false;

  function headKeysFor(brush) {
    const group = activeTool === "feather" ? "feather" : activeTool === "calligraphy" ? "calligraphy" : "pencil";
    return headProfiles[group]?.[brush] || headProfiles[group]?.["*"] || ["brushSize","brushOpacity","pressureEnabled"];
  }

  function ensureHeadOptionsPanel() {
    if (headOptionsPanel) return headOptionsPanel;
    const section = document.getElementById("brushPresetsSection");
    if (!section) return null;
    headOptionsPanel = document.createElement("div");
    headOptionsPanel.id = "brushHeadOptions";
    headOptionsPanel.className = "brush-head-options";
    headOptionsPanel.hidden = true;
    section.appendChild(headOptionsPanel);
    return headOptionsPanel;
  }

  function showHeadOptions(brush) {
    const panel = ensureHeadOptionsPanel();
    if (!panel) return;
    if (!settings[activeTool]) settings[activeTool] = {};
    const toolSettings = settings[activeTool];
    toolSettings.headSettings ||= {};
    const profile = toolSettings.headSettings[brush] || {};
    const keys = headKeysFor(brush);
    const button = popup.querySelector('[data-brush="' + brush + '"]');
    const label = button?.querySelector("span")?.textContent || labels[brush] || brush;
    panel.innerHTML = '<div class="brush-head-options-head"><strong>إعدادات رأس: ' +
      label.replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch])) +
      '</strong><span>تُحفظ لهذا الرأس وحده</span></div><div class="brush-head-options-grid"></div>';
    const grid = panel.querySelector(".brush-head-options-grid");
    keys.forEach(key => {
      const wrap = document.createElement("label");
      wrap.className = "brush-head-option";
      const caption = document.createElement("span");
      caption.textContent = headLabels[key] || key;
      wrap.appendChild(caption);
      if (key === "pressureEnabled") {
        const select = document.createElement("select");
        select.dataset.headKey = key;
        select.innerHTML = '<option value="true">مفعّل</option><option value="false">متوقف</option>';
        select.value = String(profile[key] ?? document.getElementById(key)?.checked ?? true);
        wrap.appendChild(select);
      } else if (key === "calligraphyEndStyle") {
        const select = document.createElement("select");
        select.dataset.headKey = key;
        select.innerHTML = '<option value="none">طبيعية</option><option value="thin">رفيعة</option><option value="wide">عريضة</option><option value="pointed">مدببة</option><option value="crescent">هلال</option>';
        select.value = profile[key] ?? document.getElementById(key)?.value ?? "none";
        wrap.appendChild(select);
      } else {
        const range = headRanges[key] || {min:0,max:1,step:0.01};
        const input = document.createElement("input");
        input.type = "range"; input.min = range.min; input.max = range.max; input.step = range.step;
        input.dataset.headKey = key;
        const sourceId = key === "brushSize" ? "brushSize" : key === "brushOpacity" ? "brushOpacity" : key;
        input.value = String(profile[key] ?? document.getElementById(sourceId)?.value ?? (key === "featherDensity" ? 10 : 0));
        wrap.appendChild(input);
        const value = document.createElement("output");
        value.textContent = key === "brushOpacity" || key === "featherGlow" || key === "featherSpread" || key === "featherSoftness" || key === "featherTaper" ? Math.round(Number(input.value)*100)+"%" : input.value + (key === "calligraphyAngle" ? "°" : "");
        wrap.appendChild(value);
        input.addEventListener("input", () => { value.textContent = key === "brushOpacity" || key.startsWith("feather") && key !== "featherDensity" ? Math.round(Number(input.value)*100)+"%" : input.value + (key === "calligraphyAngle" ? "°" : ""); });
      }
      grid.appendChild(wrap);
    });
    const note = document.createElement("p");
    note.className = "brush-head-options-note";
    note.textContent = "اضغط مطولاً على رأس آخر لفتح إعداداته. التغيير هنا لا يبدّل إعدادات الرؤوس الأخرى.";
    panel.appendChild(note);
    panel.hidden = false;
    panel.querySelectorAll("[data-head-key]").forEach(control => {
      control.addEventListener("input", () => saveHeadProfile(brush, control));
      control.addEventListener("change", () => saveHeadProfile(brush, control));
    });
  }

  function saveHeadProfile(brush, control) {
    if (!settings[activeTool]) settings[activeTool] = {};
    const toolSettings = settings[activeTool];
    toolSettings.headSettings ||= {};
    toolSettings.headSettings[brush] ||= {};
    const key = control.dataset.headKey;
    const value = key === "pressureEnabled" ? control.value === "true" :
      key === "calligraphyEndStyle" ? control.value : Number(control.value);
    toolSettings.headSettings[brush][key] = value;
    const targetId = key === "brushSize" ? "brushSize" : key === "brushOpacity" ? "brushOpacity" : key;
    const target = document.getElementById(targetId);
    if (target) {
      if (key === "pressureEnabled") target.checked = value;
      else target.value = String(value);
    }
    save();
    updateOutputs();
  }

  function restoreHeadProfile(brush) {
    const profile = settings[activeTool]?.headSettings?.[brush];
    if (!profile) return;
    Object.entries(profile).forEach(([key,value]) => {
      const id = key === "brushSize" ? "brushSize" : key === "brushOpacity" ? "brushOpacity" : key;
      const input = document.getElementById(id);
      if (!input) return;
      if (key === "pressureEnabled") input.checked = Boolean(value);
      else input.value = String(value);
    });
  }

  function restore(tool) {
    activeTool = tool;

    if (!settings[tool]) {
      const base = read();

      if (tool === "pencil") {
        base.pressureEnabled = false;
        base.brush = "round";
      } else if (tool === "feather") {
        base.pressureEnabled = true;
        base.opacity = 0.9;
        base.size = 16;
        base.brush = "feather-pointed";
        base.featherDensity = 10;
        base.featherGlow = 0;
        base.featherSpacing = 1;
        base.featherSpread = 0.45;
        base.featherSoftness = 0.35;
        base.featherTaper = 0.7;
      } else if (tool === "marker") {
        base.pressureEnabled = false;
        base.opacity = 0.45;
        base.size = Math.max(12, base.size || 16);
        base.brush = "chisel";
      } else if (tool === "calligraphy") {
        base.pressureEnabled = true;
        base.size = 14;
        base.brush = "calligraphy";
        base.calligraphyAngle = 45;
        base.calligraphyEndStyle = "none";
      } else if (tool === "eraser") {
        base.size = 20;
        base.eraserMode = "partial";
      } else {
        base.brush = "round";
      }

      settings[tool] = base;
    }

    const current = settings[tool];
    const brushSettings = [
      ["brushSize", "brushSizeValue"],
      ["brushOpacity", "brushOpacityValue"],
      ["pressureEnabled", null]
    ];
    for (const [id, outputId] of brushSettings) {
      const input = document.getElementById(id);
      const row = input?.previousElementSibling;
      if (input) input.style.display = "";
      if (row?.classList.contains("tool-setting-row")) row.style.display = "";
      if (outputId) {
        const output = document.getElementById(outputId);
        if (output) output.style.display = "";
      }
    }
    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (!el || !(key in current)) continue;

      if (el.type === "checkbox") {
        el.checked = Boolean(current[key]);
      } else {
        el.value = String(current[key]);
      }
    }

    // Calligraphy specific input & presets
    const angleInput = document.getElementById("calligraphyAngle");
    if (angleInput && current.calligraphyAngle !== undefined) {
      angleInput.value = String(current.calligraphyAngle);
    }
    syncCalligraphyWheel(
      Number.isFinite(current.calligraphyAngle) ? current.calligraphyAngle : 45
    );

    // Calligraphy row and presets visibility
    const isCal = (
      tool === "calligraphy" ||
      current.brush === "calligraphy" ||
      String(current.brush || "").startsWith("cal-")
    );
    const calRow = document.getElementById("calligraphyAngleRow");
    const calScale = document.getElementById("calligraphyAngleScale");
    const calEndRow = document.getElementById("calligraphyEndStyleRow");
    const calEndSelect = document.getElementById("calligraphyEndStyle");
    if (calRow) calRow.style.display = isCal ? "flex" : "none";
    if (calScale) calScale.style.display = isCal ? "block" : "none";
    if (calEndRow) calEndRow.style.display = isCal ? "flex" : "none";
    if (calEndSelect) { calEndSelect.style.display = isCal ? "block" : "none"; calEndSelect.value = current.calligraphyEndStyle || "none"; }

    // Eraser mode row visibility
    const eraserRow = document.getElementById("eraserModeRow");
    if (eraserRow) {
      eraserRow.style.display = tool === "eraser" ? "flex" : "none";
      const partialBtn = document.getElementById("eraserModePartialBtn");
      const strokeBtn = document.getElementById("eraserModeStrokeBtn");
      if (partialBtn && strokeBtn) {
        partialBtn.classList.toggle("active", (current.eraserMode || "partial") === "partial");
        strokeBtn.classList.toggle("active", current.eraserMode === "stroke");
      }
    }

    // Brush presets section visibility
    const presetsSection = document.getElementById("brushPresetsSection");
    if (presetsSection) {
      presetsSection.style.display = tool === "eraser" ? "none" : "block";
    }

    const generalBrushes = popup.querySelector(".brush-presets-general");
    const calligraphyBrushes = popup.querySelector(".brush-presets-calligraphy");
    if (generalBrushes) {
      generalBrushes.style.display = tool === "calligraphy" ? "none" : "grid";
    }
    if (calligraphyBrushes) {
      calligraphyBrushes.style.display = tool === "calligraphy" ? "grid" : "none";
    }
    const featherBrushes = popup.querySelector(".brush-presets-feather");
    if (featherBrushes) featherBrushes.style.display = tool === "feather" ? "grid" : "none";
    if (generalBrushes && tool === "feather") generalBrushes.style.display = "none";
    const featherSettings = popup.querySelector(".feather-settings");
    if (featherSettings) featherSettings.style.display = tool === "feather" ? "block" : "none";

    // Custom PNG preview & remove button
    const pngPreview = document.getElementById("customBrushPreview");
    const removeBrushBtn = document.getElementById("removeCustomBrushBtn");
    if (pngPreview) {
      if (current.customBrush) {
        pngPreview.src = current.customBrush;
        pngPreview.hidden = false;
        if (removeBrushBtn) removeBrushBtn.style.display = "inline-flex";
      } else {
        pngPreview.hidden = true;
        if (removeBrushBtn) removeBrushBtn.style.display = "none";
      }
    }

    restoreHeadProfile(current.brush || (tool === "calligraphy" ? "calligraphy" : "round"));
    updateOutputs();
    apply();
  }

  function open(buttonOrToolName) {
    const tool = typeof buttonOrToolName === "string"
      ? buttonOrToolName
      : buttonOrToolName?.dataset?.tool;

    if (!tool || !names[tool]) return;

    activeTool = tool;
    restore(tool);

    title.textContent = names[tool];
    popup.hidden = false;
    if (backdrop) backdrop.hidden = false;
    opened = true;
  }

  function hide() {
    save();
    popup.hidden = true;
    if (backdrop) backdrop.hidden = true;
    opened = false;
  }

  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) hide();
    });
  }
  popup.addEventListener("click", (e) => e.stopPropagation());

  // Custom PNG brush upload & remove
  const pngInput = document.getElementById("customBrushPNG");
  const pngPreview = document.getElementById("customBrushPreview");
  const removeBrushBtn = document.getElementById("removeCustomBrushBtn");

  if (pngInput) {
    pngInput.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const imageData = reader.result;
        if (!settings[activeTool]) settings[activeTool] = {};

        settings[activeTool].customBrush = imageData;
        settings[activeTool].brush = "custom";

        try {
          localStorage.setItem(STORAGE, JSON.stringify(settings));
        } catch {}

        if (pngPreview) {
          pngPreview.src = imageData;
          pngPreview.hidden = false;
        }
        if (removeBrushBtn) removeBrushBtn.style.display = "inline-flex";

        apply();
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeBrushBtn) {
    removeBrushBtn.addEventListener("click", () => {
      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].customBrush = null;
      settings[activeTool].brush = "round";

      try {
        localStorage.setItem(STORAGE, JSON.stringify(settings));
      } catch {}

      if (pngPreview) pngPreview.hidden = true;
      removeBrushBtn.style.display = "none";
      if (pngInput) pngInput.value = "";

      apply();
      restore(activeTool);
    });
  }


  // Calligraphy angle wheel: fixed nib orientation.
  function syncCalligraphyWheel(value) {
    const wheel = document.getElementById("calligraphyAngleWheel");
    const input = document.getElementById("calligraphyAngle");
    const angle = Number(value);
    const safeAngle = Number.isFinite(angle)
      ? Math.max(0, Math.min(180, angle))
      : 45;

    if (input) input.value = String(safeAngle);

    if (wheel) {
      wheel.style.setProperty("--calligraphy-angle", safeAngle + "deg");

      const output = wheel.querySelector("[data-wheel-value]");
      if (output) output.textContent = Math.round(safeAngle) + "°";

      const face = wheel.querySelector(".calligraphy-angle-face");
      if (face) face.setAttribute("aria-valuenow", String(Math.round(safeAngle)));
    }

    const presets = document.getElementById("calligraphyAnglePresets");
    if (presets) {
      presets.querySelectorAll("[data-angle]").forEach(button => {
        button.classList.toggle(
          "active",
          Number(button.dataset.angle) === safeAngle
        );
      });
    }
  }

  // تحديث زاوية سن القلم مباشرة من الشريط.
  const calligraphyAngleInput = document.getElementById("calligraphyAngle");

  if (calligraphyAngleInput) {
    calligraphyAngleInput.addEventListener("input", () => {
      const angle = Math.max(
        0,
        Math.min(180, Number(calligraphyAngleInput.value) || 0)
      );

      calligraphyAngleInput.value = String(angle);

      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].calligraphyAngle = angle;

      updateOutputs();
      save();
    });
  }

  const calligraphyEndStyleInput = document.getElementById("calligraphyEndStyle");
  if (calligraphyEndStyleInput) {
    calligraphyEndStyleInput.addEventListener("change", () => {
      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].calligraphyEndStyle = calligraphyEndStyleInput.value;
      save();
    });
  }

  close.addEventListener("click", hide);

  popup.addEventListener("click", event => {
    const button = event.target.closest("[data-brush]");
    if (button) {
      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].brush = button.dataset.brush;
      restoreHeadProfile(button.dataset.brush);

      const isCalligraphyBrush = button.dataset.brush === "calligraphy" || button.dataset.brush.startsWith("cal-");

      const calRow = document.getElementById("calligraphyAngleRow");
      if (calRow) {
        calRow.style.display = isCalligraphyBrush ? "flex" : "none";
      }

      const calScale = document.getElementById("calligraphyAngleScale");
      if (calScale) {
        calScale.style.display = isCalligraphyBrush ? "block" : "none";
      }

      save();
      updateOutputs();
      if (headLongPressFired) showHeadOptions(button.dataset.brush);
      else if (headOptionsPanel) headOptionsPanel.hidden = true;
      headLongPressFired = false;
      return;
    }

    // Eraser mode selection buttons
    const eraserBtn = event.target.closest("[data-eraser-mode]");
    if (eraserBtn) {
      const mode = eraserBtn.dataset.eraserMode;
      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].eraserMode = mode;

      const partialBtn = document.getElementById("eraserModePartialBtn");
      const strokeBtn = document.getElementById("eraserModeStrokeBtn");
      if (partialBtn && strokeBtn) {
        partialBtn.classList.toggle("active", mode === "partial");
        strokeBtn.classList.toggle("active", mode === "stroke");
      }

      const eraserTool = window.rasem?.tools?.get?.("eraser");
      if (eraserTool && typeof eraserTool.setMode === "function") {
        eraserTool.setMode(mode);
      }

      save();
      return;
    }
  });


  // Long press on an individual brush/nib opens only that head's settings.
  popup.addEventListener("pointerdown", event => {
    const button = event.target.closest("#brushPresetsSection [data-brush]");
    if (!button) return;
    headPressButton = button;
    headPressStartX = event.clientX;
    headPressStartY = event.clientY;
    headPressMoved = false;
    headLongPressFired = false;
    clearTimeout(headPressTimer);
    button.classList.add("tool-pressing");
    headPressTimer = setTimeout(() => {
      if (!headPressButton || headPressMoved) return;
      headLongPressFired = true;
      headPressTimer = null;
      button.classList.remove("tool-pressing");
      if (navigator.vibrate) { try { navigator.vibrate(35); } catch {} }
      if (!settings[activeTool]) settings[activeTool] = {};
      settings[activeTool].brush = button.dataset.brush;
      restoreHeadProfile(button.dataset.brush);
      const isCalligraphyBrush = button.dataset.brush === "calligraphy" || button.dataset.brush.startsWith("cal-");
      const calRow = document.getElementById("calligraphyAngleRow");
      const calScale = document.getElementById("calligraphyAngleScale");
      if (calRow) calRow.style.display = isCalligraphyBrush ? "flex" : "none";
      if (calScale) calScale.style.display = isCalligraphyBrush ? "block" : "none";
      save();
      updateOutputs();
      showHeadOptions(button.dataset.brush);
    }, 450);
  });
  popup.addEventListener("pointermove", event => {
    if (!headPressTimer) return;
    if (headPressButton && Math.hypot(event.clientX - headPressStartX, event.clientY - headPressStartY) > 14) {
      headPressMoved = true; clearTimeout(headPressTimer); headPressTimer = null;
      headPressButton.classList.remove("tool-pressing");
    }
  });
  const cancelHeadPress = () => {
    clearTimeout(headPressTimer); headPressTimer = null;
    headPressButton?.classList.remove("tool-pressing");
    headPressButton = null;
  };
  popup.addEventListener("pointerup", cancelHeadPress);
  popup.addEventListener("pointercancel", cancelHeadPress);
  popup.addEventListener("contextmenu", event => {
    if (event.target.closest("#brushPresetsSection [data-brush]")) event.preventDefault();
  });

  popup.addEventListener("input", event => {
    if (event.target.matches("[data-brush]")) return;
    save();
    updateOutputs();
  });

  popup.addEventListener("change", save);

  // Long-press (ضغطة طويلة) on tool buttons to display options / settings
  let longPressTimer = null;
  let longPressTriggered = false;
  let pressStartX = 0;
  let pressStartY = 0;
  let pressedButton = null;

  toolbar.addEventListener("pointerdown", event => {
    const button = event.target.closest("#toolbar [data-tool]");
    if (!button) return;
    // Apply the remembered settings immediately when a drawing tool is selected.
    if (names[button.dataset.tool]) restore(button.dataset.tool);

    pressedButton = button;
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    longPressTriggered = false;

    clearTimeout(longPressTimer);
    button.classList.add("tool-pressing");

    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      button.classList.remove("tool-pressing");
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch {}
      }

      const tool = button.dataset.tool;
      if (tool === "shapes") {
        window.rasemShapesUI?.open?.();
      } else if (tool === "hand") {
        const app = window.rasemApp || window.rasem;
        const currentTool = window.rasem?.tools?.activeToolName || "hand";

        if (currentTool === "hand") {
          // العودة إلى أداة الرسم مع إبقاء وتأكيد وضع التحريك بإصبعين مفعلاً
          app?.setTwoFingerPan?.(true, false);
          const lastTool = window.rasem?.lastDrawingTool || "pen";
          window.rasem?.tools?.activate?.(lastTool);
          window.rasem?.showToast?.("تم تفعيل وضع الرسم مع التحريك بإصبعين ✌ (ارسم بإصبع وحرّك بإصبعين)");
          document.querySelectorAll("#toolbar [data-tool]").forEach(b => {
            b.classList.toggle("active", b.dataset.tool === lastTool);
          });
        } else {
          // التبديل إلى وضع اليد أو تفعيل التحريك بإصبعين
          if (app?.twoFingerPanEnabled) {
            window.rasem?.tools?.activate?.("hand");
            window.rasem?.showToast?.("تم تفعيل وضع اليد (التحريك بإصبع واحد)");
            document.querySelectorAll("#toolbar [data-tool]").forEach(b => {
              b.classList.toggle("active", b.dataset.tool === "hand");
            });
          } else {
            app?.setTwoFingerPan?.(true, true);
          }
        }
        app?.updateTwoFingerPanUI?.();
      } else if (names[tool]) {
        open(tool);
      }
    }, 400); // 400ms standard long-press duration
  });

  toolbar.addEventListener("pointermove", event => {
    if (!longPressTimer) return;
    const dist = Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY);
    if (dist > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      pressedButton?.classList.remove("tool-pressing");
    }
  });

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    pressedButton?.classList.remove("tool-pressing");
  }

  toolbar.addEventListener("pointerup", cancelLongPress);
  toolbar.addEventListener("pointercancel", cancelLongPress);
  toolbar.addEventListener("pointerleave", cancelLongPress);

  // Prevent native browser context menu on long-press
  toolbar.addEventListener("contextmenu", event => {
    if (event.target.closest("#toolbar [data-tool]")) {
      event.preventDefault();
    }
  });

  // Suppress click event if long-press was already triggered; or open settings if already active tool clicked
  toolbar.addEventListener("click", event => {
    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      longPressTriggered = false;
      return;
    }

    const button = event.target.closest("#toolbar [data-tool]");
    if (!button) return;
    const tool = button.dataset.tool;

    // If shapes button clicked, open shapes options modal
    if (tool === "shapes") {
      window.rasemShapesUI?.open?.();
      return;
    }

    // If already active drawing tool clicked again, open its settings
    if (button.classList.contains("active") && names[tool] && tool !== "eraser") {
      open(tool);
    }
  }, false);

  // Global API
  window.rasemToolSettings = {
    open,
    hide,
    restore
  };

})();

/* =========================================================
   RASEM 3.0 - BRUSH LIBRARY MODULE
   js/brush-library.js
   Expanded presets: Calligraphy, Chisel, Ink Pen, Pencil, Soft Watercolor, Textured Chalk, and Custom PNG Stamp.
========================================================= */

(() => {
  "use strict";

  const presets = {
    round: { lineCap: "round", dashArray: "" },
    calligraphy: { lineCap: "round", dashArray: "", preset: "calligraphy" },
    chisel: { lineCap: "square", dashArray: "" },
    square: { lineCap: "square", dashArray: "" },
    dash: { lineCap: "round", dashArray: "8 5" },
    soft: { lineCap: "round", dashArray: "" },
    chalk: { lineCap: "round", dashArray: "2 3" },
    custom: { lineCap: "round", dashArray: "" }
  };

  function connect() {
    const engine = window.rasem?.engine;

    if (!engine || typeof engine.setSettings !== "function") {
      return false;
    }

    if (window.__rasemUnifiedBrushConnected) return true;
    window.__rasemUnifiedBrushConnected = true;

    window.addEventListener("rasem:brush-style", event => {
      const detail = event.detail || {};
      const style = detail.style || presets[detail.name] || {};

      engine.setSettings({
        brushStyle: {
          preset: detail.name || null,
          lineCap: style.lineCap || "round",
          dashArray: style.dashArray || "",
          image: detail.image || style.image || null
        }
      });
    });

    return true;
  }

  window.addEventListener("rasem:ready", connect);
  connect();

  window.rasemBrushPresets = presets;

})();

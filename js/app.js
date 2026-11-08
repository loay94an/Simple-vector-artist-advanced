
/* =========================================================
   RASEM 2.0
   js/app.js

   Main Application Bootstrap

   Responsibilities:
   - Initialize application modules
   - Connect drawing engine and tools
   - Initialize storage and autosave
   - Initialize user interface
   - Manage pointer and multitouch events
   - Handle keyboard shortcuts
   - Expose public API
   - Cleanup application resources
========================================================= */

import { registerPlugin } from "@capacitor/core";

import {
  DrawingDocument,
  Camera,
  Scene,
  Coordinates,
  EventManager
} from "./core.js";

import {
  DrawingEngine
} from "./engine.js?v=20261108-10";

import {
  ToolManager
} from "./tools.js";

import {
  HistoryManager
} from "./layers-history.js";

import {
  StorageManager,
  Autosave,
  SVGExport,
  PNGExport,
  PDFExport
} from "./storage-export.js";

import {
  UIManager
} from "./ui.js";

/* Android native Save As bridge */
const Downloads = registerPlugin("Downloads");

if (typeof window !== "undefined") {
  window.rasemNativeSaveAs = async function (blob, filename) {
    if (!(blob instanceof Blob)) {
      throw new TypeError("بيانات الملف غير صالحة.");
    }

    const safeName = String(filename || "rasem-drawing.svg")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();

    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(i, i + chunkSize)
      );
    }

    return await Downloads.save({
      filename: safeName,
      mimeType: blob.type || "image/svg+xml",
      data: btoa(binary)
    });
  };
}


// =========================================================
// CONFIGURATION
// =========================================================

const CONFIG = Object.freeze({
  name: "Rasem",
  version: "2.0",

  historyLimit: 100,

  autosaveDelay: 1000,

  themeKey: "rasem-theme",

  defaultTheme: "dark",

  canvasId: "drawingCanvas",
  viewportId: "viewport",
  drawingLayerId: "drawingLayer"
});

// =========================================================
// UTILITIES
// =========================================================

function getElement(id) {
  return document.getElementById(id);
}

function isInputElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element?.isContentEditable
  );
}

function distance(a, b) {
  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

// =========================================================
// APPLICATION CLASS
// =========================================================

export class RasemApplication {

  constructor(options = {}) {
    if (RasemApplication.instance) {
      throw new Error(
        "Rasem application is already initialized"
      );
    }

    this.options = options;

    this.modules = {};

    this.initialized = false;
    this.destroyed = false;

    this.pointerGesture = null;

    this.cleanupCallbacks = [];

    this.toastTimer = null;

    this.elements = null;

    let savedPan = true;
    try {
      savedPan = localStorage.getItem("rasem_two_finger_pan") !== "false";
    } catch {}
    this.twoFingerPanEnabled = savedPan;
    this.inMultitouchSession = false;

    RasemApplication.instance = this;
  }

  // =======================================================
  // INITIALIZE
  // =======================================================

  init() {
    if (this.initialized) {
      return this;
    }

    if (this.destroyed) {
      throw new Error(
        "Cannot initialize a destroyed application"
      );
    }

    try {
      this.validateDOM();

      this.initializeDocument();
      this.initializeCamera();
      this.initializeRenderer();
      this.initializeCoordinates();

      this.initializeHistory();
      this.initializeEngine();
      this.initializeTools();

      this.initializeStorage();
      this.restoreDocument();

      this.initializeAutosave();
      this.initializeUI();

      this.initializeEvents();
      this.initializeControls();

      this.restoreTheme();

      this.initializeKeyboard();

      this.initialized = true;

      this.emit("rasem:ready", {
        version: CONFIG.version
      });

      console.info(
        `Rasem ${CONFIG.version} initialized`
      );

      return this;

    } catch (error) {
      console.error(
        "Rasem initialization failed:",
        error
      );

      this.destroy();

      throw error;
    }
  }

  // =======================================================
  // DOM VALIDATION
  // =======================================================

  validateDOM() {
    const svg = getElement(CONFIG.canvasId);
    const viewport = getElement(CONFIG.viewportId);
    const drawingLayer = getElement(CONFIG.drawingLayerId);

    if (!svg || !viewport || !drawingLayer) {
      throw new Error(
        "Missing required canvas elements: " +
        "drawingCanvas, viewport or drawingLayer"
      );
    }

    if (!svg.contains(viewport)) {
      throw new Error(
        "Viewport must be inside drawingCanvas"
      );
    }

    if (!viewport.contains(drawingLayer)) {
      throw new Error(
        "drawingLayer must be inside viewport"
      );
    }

    this.elements = {
      svg,
      viewport,
      drawingLayer,

      zoomLabel: getElement("zoomLabel"),
      undoButton: getElement("undoBtn"),
      redoButton: getElement("redoBtn"),

      zoomInButton: getElement("zoomInBtn"),
      zoomOutButton: getElement("zoomOutBtn"),

      clearButton: getElement("clearBtn"),
      saveButton: getElement("saveBtn"),

      themeButton: getElement("themeBtn"),
      toast: getElement("toast")
    };
  }

  // =======================================================
  // DOCUMENT
  // =======================================================

  initializeDocument() {
    this.modules.document = new DrawingDocument();
  }

  // =======================================================
  // CAMERA
  // =======================================================

  initializeCamera() {
    this.modules.camera = new Camera(
      this.elements.svg,
      this.elements.viewport,
      {
        document: this.modules.document
      }
    );

    const cameraState =
      this.modules.document.camera;

    if (cameraState) {
      this.modules.camera.restore(cameraState);
    }
  }

  // =======================================================
  // RENDERER
  // =======================================================

  initializeRenderer() {
    this.modules.renderer = new Scene(
      this.elements.svg,
      this.elements.viewport,
      this.elements.drawingLayer
    );
  }

  // =======================================================
  // COORDINATES
  // =======================================================

  initializeCoordinates() {
    this.modules.coordinates = new Coordinates(
      this.elements.svg,
      this.modules.camera
    );
  }

  // =======================================================
  // HISTORY
  // =======================================================

  initializeHistory() {
    this.modules.history = new HistoryManager(
      this.modules.document,
      this.modules.renderer,
      {
        limit: CONFIG.historyLimit,

        onChange: state => {
          this.updateHistoryControls(state);
        }
      }
    );
  }

  updateHistoryControls(state = {}) {
    if (this.elements.undoButton) {
      this.elements.undoButton.disabled =
        !state.canUndo;
    }

    if (this.elements.redoButton) {
      this.elements.redoButton.disabled =
        !state.canRedo;
    }
  }

  // =======================================================
  // DRAWING ENGINE
  // =======================================================

  initializeEngine() {
    this.modules.engine = new DrawingEngine(
      this.modules.document,
      this.modules.renderer,
      this.modules.history,
      this.modules.coordinates
    );
  }

  // =======================================================
  // TOOLS
  // =======================================================

  initializeTools() {
    this.modules.tools = new ToolManager(
      this.modules.engine,
      this.modules.camera
    );
  }

  // =======================================================
  // STORAGE
  // =======================================================

  initializeStorage() {
    this.modules.storage = new StorageManager(
      this.modules.document
    );
  }

  restoreDocument() {
    const restored = this.modules.storage.restore();

    if (restored) {
      this.modules.renderer.render(
        this.modules.document
      );

      if (this.modules.document.camera) {
        this.modules.camera.restore(
          this.modules.document.camera
        );
      }
    } else {
      this.modules.renderer.render(
        this.modules.document
      );
    }

    this.modules.history.reset();

    return restored;
  }

  // =======================================================
  // AUTOSAVE
  // =======================================================

  initializeAutosave() {
    this.modules.autosave = new Autosave(
      this.modules.storage,
      {
        delay: CONFIG.autosaveDelay,

        onSave: () => {
          this.emit("rasem:autosaved");
        },

        onError: error => {
          console.error(
            "Autosave failed:",
            error
          );

          this.emit("rasem:autosaveerror", {
            error
          });
        }
      }
    );
  }

  scheduleAutosave() {
    this.modules.autosave?.schedule?.();
  }

  flushAutosave() {
    this.modules.autosave?.flush?.();
  }

  // =======================================================
  // USER INTERFACE
  // =======================================================

  initializeUI() {
    this.modules.ui = new UIManager({
      engine: this.modules.engine,
      tools: this.modules.tools,
      document: this.modules.document,
      history: this.modules.history,
      renderer: this.modules.renderer,
      storage: this.modules.storage
    });
  }

  // =======================================================
  // POINTER EVENTS
  // =======================================================

  initializeEvents() {
    this.modules.events = new EventManager(
      this.elements.svg,
      {
        down: event => {
          this.handlePointerDown(event);
        },

        move: event => {
          this.handlePointerMove(event);
        },

        up: event => {
          this.handlePointerUp(event);
        },

        cancel: event => {
          this.handlePointerCancel(event);
        },

        multitouchStart: pointers => {
          this.handleMultitouchStart(pointers);
        },

        multitouch: pointers => {
          this.handleMultitouch(pointers);
        },

        multitouchEnd: () => {
          this.handleMultitouchEnd();
        },

        pointerCount: count => {
          if (count === 0) {
            this.inMultitouchSession = false;
            this.pointerGesture = null;
          }
          this.emit("rasem:pointercount", {
            count
          });
        }
      }
    );
  }

  handlePointerDown(event) {
    if (this.destroyed) return;

    if (this.pointerGesture || this.inMultitouchSession) return;

    this.modules.tools.handleDown(event);
  }

  handlePointerMove(event) {
    if (this.destroyed) return;

    if (this.pointerGesture || this.inMultitouchSession) return;

    this.modules.tools.handleMove(event);
  }

  handlePointerUp(event) {
    if (this.destroyed) return;

    if (this.pointerGesture || this.inMultitouchSession) return;

    this.modules.tools.handleUp(event);

    this.scheduleAutosave();
  }

  handlePointerCancel(event) {
    if (this.destroyed) return;

    this.modules.tools.handleCancel(event);
  }

  // =======================================================
  // MULTITOUCH / PINCH ZOOM & TWO-FINGER PAN
  // =======================================================

  handleMultitouchStart(pointers) {
    if (this.destroyed) return;

    this.inMultitouchSession = true;

    if (this.modules.engine?.drawing) {
      this.modules.engine.cancel();
    }

    this.modules.tools?.handleCancel?.();

    if (!Array.isArray(pointers) || pointers.length < 2) {
      this.pointerGesture = null;
      return;
    }

    const selector = window.rasem?.tools?.get?.("selector");

    if (
      selector?.selectedIds?.size &&
      selector.beginMultiTouch(pointers)
    ) {
      this.pointerGesture = {
        mode: "selection"
      };
      return;
    }

    this.pointerGesture = {
      mode: "camera",
      distance: distance(pointers[0], pointers[1]),
      center: midpoint(pointers[0], pointers[1])
    };
  }

  handleMultitouch(pointers) {
    if (
      this.destroyed ||
      !Array.isArray(pointers) ||
      pointers.length < 2
    ) {
      return;
    }

    if (this.pointerGesture?.mode === "selection") {
      const selector = window.rasem?.tools?.get?.("selector");
      selector?.updateMultiTouch(pointers);
      return;
    }

    const first = pointers[0];
    const second = pointers[1];

    const nextDistance = distance(first, second);
    const nextCenter = midpoint(first, second);

    if (
      !this.pointerGesture ||
      this.pointerGesture.mode !== "camera" ||
      this.pointerGesture.distance <= 0
    ) {
      this.pointerGesture = {
        mode: "camera",
        distance: nextDistance,
        center: nextCenter
      };
      return;
    }

    if (
      this.twoFingerPanEnabled ||
      this.modules.tools?.activeToolName === "hand"
    ) {
      const dx = nextCenter.x - this.pointerGesture.center.x;
      const dy = nextCenter.y - this.pointerGesture.center.y;

      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        this.modules.camera.panScreen(dx, dy);
      }
    }

    const factor = nextDistance / this.pointerGesture.distance;

    if (
      Number.isFinite(factor) &&
      factor > 0 &&
      Math.abs(factor - 1) > 0.001
    ) {
      this.modules.camera.zoomAt(
        factor,
        nextCenter.x,
        nextCenter.y
      );
    }

    this.pointerGesture = {
      mode: "camera",
      distance: nextDistance,
      center: nextCenter
    };
  }

  handleMultitouchEnd() {
    const wasSelectionGesture =
      this.pointerGesture?.mode === "selection";

    this.pointerGesture = null;

    if (wasSelectionGesture) {
      const selector = window.rasem?.tools?.get?.("selector");
      selector?.endMultiTouch();
    } else {
      if (this.modules.engine?.drawing) {
        this.modules.engine.cancel();
      }
      this.modules.tools?.handleCancel?.();
    }

    this.scheduleAutosave();
  }

  // =======================================================
  // UI CONTROLS
  // =======================================================


  // RASEM_UNDO_REDO_BUTTONS
  bindHistoryButtons() {
    const undo = this.elements.undoButton;
    const redo = this.elements.redoButton;

    if (!undo || !redo) {
      throw new Error("Undo/Redo buttons not found");
    }

    const runHistory = (action) => {
      if (this.destroyed) return;

      const history = this.modules.history;
      if (!history) return;

      const changed = action === "undo"
        ? history.undo()
        : history.redo();

      if (changed) {
        this.modules.renderer.render(this.modules.document);
        this.scheduleAutosave();
      }
    };

    const onUndo = () => runHistory("undo");
    const onRedo = () => runHistory("redo");

    undo.addEventListener("click", onUndo);
    redo.addEventListener("click", onRedo);

    this.cleanupCallbacks.push(() => {
      undo.removeEventListener("click", onUndo);
      redo.removeEventListener("click", onRedo);
    });
  }

  initializeControls() {
    // SELECTION_ACTION_BAR_BINDINGS
    const selBar = document.getElementById("selectionActionBar");

    const selChangeHandler = event => {
      const count = event.detail?.count || 0;
      selBar?.classList.toggle("visible", count > 0);
    };

    window.addEventListener("rasem:selection-change", selChangeHandler);
    this.cleanupCallbacks.push(() => {
      window.removeEventListener("rasem:selection-change", selChangeHandler);
    });

    const selector = () => window.rasem?.tools?.get?.("selector");

    const selectionButtons = [
      ["selDeleteBtn", () => selector()?.deleteSelected?.()],
      ["selConfirmBtn", () => selector()?.clearSelection?.()],
      ["selClearBtn", () => selector()?.clearSelection?.()]
    ];

    for (const [id, action] of selectionButtons) {
      const button = document.getElementById(id);
      if (!button) continue;

      const handler = event => {
        event.preventDefault();
        action();
      };

      button.addEventListener("click", handler);
      this.cleanupCallbacks.push(() => {
        button.removeEventListener("click", handler);
      });
    }
    // END SELECTION_ACTION_BAR_BINDINGS


    this.bindHistoryButtons();

    this.bindClick(
      this.elements.zoomInButton,
      () => this.modules.camera.zoomIn()
    );

    this.bindClick(
      this.elements.zoomOutButton,
      () => this.modules.camera.zoomOut()
    );

    this.bindClick(
      this.elements.clearButton,
      () => this.clearCanvas()
    );

    this.bindClick(
      this.elements.saveButton,
      () => this.saveDocument()
    );

    this.bindClick(
      this.elements.themeButton,
      () => this.toggleTheme()
    );

    // RASEM_NEW_CANVAS_IMPLEMENTATION
    const newCanvasDialog = getElement("newCanvasDialog");

    this.bindClick(
      getElement("newCanvasBtn"),
      () => {
        if (newCanvasDialog && !newCanvasDialog.open) {
          newCanvasDialog.showModal();
        }
      }
    );

    this.bindClick(
      getElement("newCanvasSaveBtn"),
      () => {
        newCanvasDialog?.close();
        this.createNewCanvas(true);
      }
    );

    this.bindClick(
      getElement("newCanvasDiscardBtn"),
      () => {
        newCanvasDialog?.close();
        this.createNewCanvas(false);
      }
    );

    this.bindClick(
      getElement("newCanvasCancelBtn"),
      () => newCanvasDialog?.close()
    );



    const importButton = getElement("importBtn");
    const importInput = getElement("importFileInput");

    this.bindClick(importButton, () => {
      importInput?.click();
    });

    if (importInput) {
      const importHandler = async () => {
        const file = importInput.files?.[0];
        if (!file) return;

        await this.importDocumentFile(file);
        importInput.value = "";
      };

      importInput.addEventListener("change", importHandler);

      this.cleanupCallbacks.push(() => {
        importInput.removeEventListener("change", importHandler);
      });
    }

    const exportDialog = getElement("exportDialog");
    const exportBackdrop = getElement("exportModalBackdrop");

    const showExportModal = () => {
      if (exportBackdrop) exportBackdrop.hidden = false;
      if (exportDialog) exportDialog.hidden = false;
    };

    const hideExportModal = () => {
      if (exportBackdrop) exportBackdrop.hidden = true;
      if (exportDialog) exportDialog.hidden = true;
    };

    this.bindClick(getElement("exportBtn"), showExportModal);
    this.bindClick(getElement("closeExportBtn"), hideExportModal);

    if (exportBackdrop) {
      exportBackdrop.addEventListener("click", event => {
        if (event.target === exportBackdrop) {
          hideExportModal();
        }
      });
    }

    if (exportDialog) {
      exportDialog.addEventListener("click", event => {
        event.stopPropagation();
      });
    }

    if (exportDialog) {
      const exportHandler = async event => {
        const button = event.target.closest("[data-export]");

        if (!button || !exportDialog.contains(button)) return;

        const format = button.dataset.export;

        try {
          button.disabled = true;

          let result = false;

          if (format === "svg") {
            result = await this.exportSVG();
          } else if (format === "png") {
            result = await this.exportPNG();
          } else if (format === "pdf") {
            result = await this.exportPDF();
          }

          if (result === false) {
            this.showToast("تعذر تصدير الرسم");
          } else {
            exportDialog.close();
            this.showToast("تم تجهيز التصدير");
          }

        } catch (error) {
          console.error("Export failed:", error);
          this.showToast("حدث خطأ أثناء التصدير");

        } finally {
          button.disabled = false;
        }
      };

      exportDialog.addEventListener("click", exportHandler);

      this.cleanupCallbacks.push(() => {
        exportDialog.removeEventListener("click", exportHandler);
      });
    }

    // Canvas grid visibility preference
    const canvasGridCheckbox = getElement("canvasGridCheckbox");
    const gridLayer = getElement("gridLayer");
    if (canvasGridCheckbox && gridLayer) {
      // Grid is enabled by default. Persisted user choice takes precedence.
      let gridEnabled = true;
      try {
        const savedGrid = localStorage.getItem("rasem_canvas_grid");
        if (savedGrid !== null) gridEnabled = savedGrid === "true";
      } catch {}
      canvasGridCheckbox.checked = gridEnabled;
      const applyGridVisibility = (visible) => {
        // SVG presentation attributes are more reliable across mobile browsers
        // than clearing an inline display:none declaration.
        gridLayer.setAttribute("visibility", visible ? "visible" : "hidden");
        gridLayer.style.setProperty("display", visible ? "inline" : "none", "important");
      };
      applyGridVisibility(gridEnabled);
      const gridToggleHandler = () => {
        const visible = canvasGridCheckbox.checked;
        applyGridVisibility(visible);
        try { localStorage.setItem("rasem_canvas_grid", String(visible)); } catch {}
      };
      canvasGridCheckbox.addEventListener("change", gridToggleHandler);
      this.cleanupCallbacks.push(() => canvasGridCheckbox.removeEventListener("change", gridToggleHandler));
    }

    // Two-Finger Pan Settings Checkbox listener
    const twoFingerPanCheckbox = getElement("twoFingerPanCheckbox");
    if (twoFingerPanCheckbox) {
      twoFingerPanCheckbox.checked = this.twoFingerPanEnabled;
      const panToggleHandler = (e) => {
        this.setTwoFingerPan(e.target.checked, true);
      };
      twoFingerPanCheckbox.addEventListener("change", panToggleHandler);
      this.cleanupCallbacks.push(() => {
        twoFingerPanCheckbox.removeEventListener("change", panToggleHandler);
      });
    }

    this.updateTwoFingerPanUI();
  }

  setTwoFingerPan(enabled, announce = true) {
    this.twoFingerPanEnabled = Boolean(enabled);
    try {
      localStorage.setItem("rasem_two_finger_pan", String(this.twoFingerPanEnabled));
    } catch {}
    this.updateTwoFingerPanUI();
    if (announce) {
      if (this.twoFingerPanEnabled) {
        this.showToast("تم تفعيل التحريك بإصبعين: يمكنك الآن الرسم بحرية والتحريك بإصبعين ✌");
      } else {
        this.showToast("تم تفعيل تحريك الشاشة بإصبع واحد (وضع اليد التقليدي)");
      }
    }
    window.dispatchEvent(new CustomEvent("rasem:two-finger-pan-changed", {
      detail: { enabled: this.twoFingerPanEnabled }
    }));
    return this.twoFingerPanEnabled;
  }

  toggleTwoFingerPan(announce = true) {
    return this.setTwoFingerPan(!this.twoFingerPanEnabled, announce);
  }

  updateTwoFingerPanUI() {
    const checkbox = document.getElementById("twoFingerPanCheckbox");
    if (checkbox) {
      checkbox.checked = this.twoFingerPanEnabled;
    }

    const handButton = document.querySelector('[data-tool="hand"]');
    if (handButton) {
      handButton.classList.toggle("two-finger-pan-enabled", this.twoFingerPanEnabled);
      const badge = handButton.querySelector(".hand-mode-badge");
      if (badge) {
        badge.remove();
      }
      handButton.title = this.twoFingerPanEnabled
        ? "تحريك اللوحة (التحريك بإصبعين مفعّل أثناء الرسم)"
        : "تحريك اللوحة (نقرة: تحريك باليد / ضغطة طويلة: تفعيل التحريك بإصبعين مع الرسم)";
    }
  }

  bindClick(element, callback) {
    if (!element) return;

    const handler = event => {
      event.preventDefault();
      callback();
    };

    element.addEventListener(
      "click",
      handler
    );

    this.cleanupCallbacks.push(() => {
      element.removeEventListener(
        "click",
        handler
      );
    });
  }


  // RASEM_NEW_CANVAS_IMPLEMENTATION
  createNewCanvas(saveCurrent = false) {
    if (this.destroyed) return false;

    const documentModel = this.modules.document;

    if (!documentModel) return false;

    // حفظ المستند القديم قبل إنشاء الجديد عند اختيار الحفظ.
    if (saveCurrent && !this.saveDocument()) {
      this.showToast("تعذر حفظ اللوحة الحالية");
      return false;
    }

    // إلغاء أي حفظ تلقائي مؤجل للوحة القديمة.
    const autosave = this.modules.autosave;

    if (autosave) {
      autosave.setEnabled(false);
      autosave.setEnabled(true);
    }

    try {
      // إنشاء بيانات مستند افتراضي فارغ.
      const freshDocument = new documentModel.constructor();
      const freshData = freshDocument.toJSON();

      // الحفاظ على هوية كائن المستند المرتبط بالمحرك والتخزين.
      Object.assign(documentModel, freshData);

      // إعادة الكاميرا إلى الوضع الافتراضي.
      this.modules.camera.restore(
        documentModel.camera,
        false
      );

      documentModel.camera = this.modules.camera.state;

      // رسم اللوحة البيضاء والطبقة الفارغة.
      this.modules.renderer.render(documentModel);

      // تصفير التراجع والإعادة.
      this.modules.history.reset();

      // تحديث واجهة الطبقات وبقية المكونات.
      this.modules.ui?.refresh?.();

      const layerCount = getElement("layerCount");

      if (layerCount) {
        layerCount.textContent = "الطبقات: 1";
      }

      // إظهار مساحة الرسم.
      const canvasButton = getElement("openCanvasBtn");

      if (canvasButton) {
        canvasButton.click();
      }

      this.showToast("تم إنشاء لوحة جديدة بنجاح");

      return true;

    } catch (error) {
      console.error("New canvas creation failed:", error);
      this.showToast("تعذر إنشاء اللوحة الجديدة");
      return false;
    }
  }

  // =======================================================
  // CLEAR CANVAS
  // =======================================================

  clearCanvas() {
    if (this.destroyed) return false;

    const layer = this.modules.document.activeLayer;

    if (!layer || layer.locked) {
      this.showToast("الطبقة مقفلة");
      return false;
    }

    if (!layer.elements.length) {
      return false;
    }

    if (!window.confirm("هل تريد مسح الطبقة الحالية؟")) {
      return false;
    }

    const result = this.modules.engine.clear();

    if (result) {
      this.scheduleAutosave();

      this.showToast("تم مسح الطبقة");
    }

    return result;
  }


  // =======================================================
  // IMPORT DOCUMENT
  // =======================================================

  async importDocumentFile(file) {
    if (this.destroyed || !file) return false;

    const name = file.name.toLowerCase();
    const isProject = name.endsWith(".rasem") || name.endsWith(".json") || file.type === "application/json";

    if (isProject) {
      let data;
      try {
        data = await this.modules.storage.importFile(file);

        const documentModel = this.modules.document;
        const previous = documentModel.toJSON();

        try {
          documentModel.id = data.id;
          documentModel.version = "2.0";
          documentModel.name = data.name;
          documentModel.camera = documentModel.validateCamera(data.camera);
          documentModel.layers = data.layers;
          documentModel.activeLayerId = data.activeLayerId;
          documentModel.createdAt = data.createdAt;
          documentModel.updatedAt = data.updatedAt;

          this.modules.camera.restore(documentModel.camera, false);
          this.modules.renderer.render(documentModel);
          this.modules.history.reset();

          if (!this.modules.storage.save()) {
            throw new Error("تعذر حفظ المستند المستورد");
          }

          this.showToast("تم استيراد المستند بنجاح");
          return true;

        } catch (error) {
          documentModel.id = previous.id;
          documentModel.version = previous.version;
          documentModel.name = previous.name;
          documentModel.camera = previous.camera;
          documentModel.layers = previous.layers;
          documentModel.activeLayerId = previous.activeLayerId;
          documentModel.createdAt = previous.createdAt;
          documentModel.updatedAt = previous.updatedAt;

          this.modules.camera.restore(previous.camera, false);
          this.modules.renderer.render(documentModel);
          this.modules.history.reset();

          this.modules.storage.save();
          throw error;
        }

      } catch (error) {
        console.error("Document import failed:", error);
        this.showToast(error.message || "تعذر استيراد المستند");
        return false;
      }
    }

    // Handle Image, SVG, and PDF Imports as editable image elements on current layer
    try {
      const reader = new FileReader();
      const isSvg = name.endsWith(".svg") || file.type === "image/svg+xml";
      const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";

      if (isSvg) {
        const text = await file.text();
        const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const w = Math.min(600, img.naturalWidth || 400);
          const h = Math.min(600, img.naturalHeight || 300);
          const element = {
            id: `svg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: "image",
            svgTag: "image",
            geometry: {
              x: 200,
              y: 200,
              width: w,
              height: h,
              href: dataUrl,
              preserveAspectRatio: "xMidYMid meet"
            },
            style: { opacity: 1 }
          };
          this.modules.document.addElement(element);
          this.modules.renderer.render(this.modules.document);
          this.scheduleAutosave();

          try {
            this.setTool("selector");
            const selector = this.modules.tools?.get("selector");
            if (selector) {
              selector.selectedIds = new Set([element.id]);
              selector.renderOverlay();
            }
          } catch {}

          this.showToast("تم إدراج ملف SVG بنجاح - يمكنك تحريكه وتكبيره وتصغيره");
        };
        img.src = dataUrl;
        return true;
      }

      reader.onload = () => {
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || 400;
          let h = img.naturalHeight || 300;
          if (w > 800) {
            h = Math.round((800 / w) * h);
            w = 800;
          }

          const element = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: "image",
            svgTag: "image",
            geometry: {
              x: 150,
              y: 150,
              width: w,
              height: h,
              href: dataUrl,
              preserveAspectRatio: "xMidYMid meet"
            },
            style: { opacity: 1 }
          };

          this.modules.document.addElement(element);
          this.modules.renderer.render(this.modules.document);
          this.scheduleAutosave();

          try {
            this.setTool("selector");
            const selector = this.modules.tools?.get("selector");
            if (selector) {
              selector.selectedIds = new Set([element.id]);
              selector.renderOverlay();
            }
          } catch {}

          this.showToast(isPdf ? "تم إدراج مستند PDF بنجاح" : "تم إدراج الصورة بنجاح - يمكنك تحريكها وتكبيرها وتصغيرها");
        };
        img.src = dataUrl;
      };

      reader.readAsDataURL(file);
      return true;

    } catch (err) {
      console.error("Media import failed:", err);
      this.showToast("تعذر استيراد الملف المرفق");
      return false;
    }
  }

  // =======================================================
  // SAVE DOCUMENT
  // =======================================================

  saveDocument() {
    if (this.destroyed) return false;

    this.flushAutosave();

    const result = this.modules.storage.save();

    this.showToast(
      result
        ? "تم حفظ المستند"
        : "تعذر حفظ المستند"
    );

    return result;
  }

  // =======================================================
  // EXPORT
  // =======================================================

  async exportSVG(options = {}) {
    return SVGExport.download(
      this.modules.document.toJSON(),
      options
    );
  }

  async exportPNG(options = {}) {
    return PNGExport.download(
      this.modules.document.toJSON(),
      options
    );
  }

  async exportPDF(options = {}) {
    return PDFExport.download(
      this.modules.document.toJSON(),
      options
    );
  }

  // =======================================================
  // THEME
  // =======================================================

  restoreTheme() {
    let theme = CONFIG.defaultTheme;

    try {
      theme =
        localStorage.getItem(CONFIG.themeKey) ||
        CONFIG.defaultTheme;
    } catch (error) {
      console.warn("Theme restoration failed", error);
    }

    this.applyTheme(theme);
  }

  applyTheme(theme) {
    const light = theme === "light";

    document.body.classList.toggle("light", light);
    document.body.classList.toggle("dark", !light);

    if (this.elements.themeButton) {
      this.elements.themeButton.textContent = light ? "☾" : "☼";
    }

    const bg = document.getElementById("canvasBackground");
    if (bg) {
      bg.setAttribute("fill", light ? "#ffffff" : "#121212");
    }
    const board = document.getElementById("canvasBoard");
    if (board) {
      board.style.backgroundColor = light ? "#ffffff" : "#121212";
    }
  }

  toggleTheme() {
    const light =
      !document.body.classList.contains("light");

    const theme = light ? "light" : "dark";

    this.applyTheme(theme);

    try {
      localStorage.setItem(
        CONFIG.themeKey,
        theme
      );
    } catch (error) {
      console.warn("Theme saving failed", error);
    }
  }

  // =======================================================
  // TOAST
  // =======================================================

  showToast(message, duration = 2000) {
    const element = this.elements?.toast;

    if (!element) return;

    element.textContent = String(message);

    element.classList.add("show");

    clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, duration);
  }

  // =======================================================
  // KEYBOARD SHORTCUTS
  // =======================================================

  initializeKeyboard() {
    this.onKeyDown = event => {
      this.handleKeyboard(event);
    };

    document.addEventListener(
      "keydown",
      this.onKeyDown
    );

    this.cleanupCallbacks.push(() => {
      document.removeEventListener(
        "keydown",
        this.onKeyDown
      );
    });
  }

  handleKeyboard(event) {
    if (
      this.destroyed ||
      isInputElement(event.target)
    ) {
      return;
    }

    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();

      if (event.shiftKey) {
        this.modules.history.redo();
      } else {
        this.modules.history.undo();
      }

      this.modules.renderer.render(
        this.modules.document
      );

      this.scheduleAutosave();

      return;
    }

    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();

      this.modules.history.redo();

      this.modules.renderer.render(
        this.modules.document
      );

      this.scheduleAutosave();

      return;
    }

    if (event.key === "Escape") {
      this.modules.tools.handleCancel();
      return;
    }

    if (event.key === "Delete") {
      this.modules.tools.deleteSelection?.();

      this.scheduleAutosave();
      return;
    }

    if (
      event.code === "Space" &&
      !event.repeat
    ) {
      event.preventDefault();

      this.modules.tools.activate("hand");
    }
  }

  // =======================================================
  // EVENTS
  // =======================================================

  emit(name, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  // =======================================================
  // PUBLIC API
  // =======================================================

  get api() {
    return {
      document: this.modules.document,
      camera: this.modules.camera,
      renderer: this.modules.renderer,
      coordinates: this.modules.coordinates,

      engine: this.modules.engine,
      history: this.modules.history,

      tools: this.modules.tools,

      storage: this.modules.storage,
      autosave: this.modules.autosave,

      ui: this.modules.ui,

      export: {
        svg: options => this.exportSVG(options),

        png: options => this.exportPNG(options),

        pdf: options => this.exportPDF(options)
      },

      save: () => this.saveDocument(),

      clear: () => this.clearCanvas(),

      undo: () => {
        const result = this.modules.history.undo();

        this.modules.renderer.render(
          this.modules.document
        );

        this.scheduleAutosave();

        return result;
      },

      redo: () => {
        const result = this.modules.history.redo();

        this.modules.renderer.render(
          this.modules.document
        );

        this.scheduleAutosave();

        return result;
      },

      setTool: tool => {
        return this.modules.tools.activate(tool);
      },

      showToast: (msg, dur) => this.showToast(msg, dur),

      setSettings: settings => {
        this.modules.engine.setSettings(settings);
      },

      setTwoFingerPan: (enabled, announce) => this.setTwoFingerPan(enabled, announce),
      toggleTwoFingerPan: (announce) => this.toggleTwoFingerPan(announce),
      get twoFingerPanEnabled() { return this.twoFingerPanEnabled; },
      updateTwoFingerPanUI: () => this.updateTwoFingerPanUI(),
      tools: this.modules.tools,

      destroy: () => this.destroy()
    };
  }

  // =======================================================
  // DESTROY
  // =======================================================

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    clearTimeout(this.toastTimer);

    // Commit or cancel any active drawing safely.
    try {
      this.modules.tools?.handleCancel?.();
    } catch (error) {
      console.error("Tool cleanup failed", error);
    }

    // Stop autosave.
    try {
      this.flushAutosave();
      this.modules.autosave?.destroy?.();
    } catch (error) {
      console.error("Autosave cleanup failed", error);
    }

    // Remove event listeners.
    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      try {
        cleanup();
      } catch (error) {
        console.error("Cleanup failed", error);
      }
    }

    // Destroy modules in dependency order.
    const modules = [
      "events",
      "ui",
      "tools",
      "engine",
      "renderer",
      "camera",
      "storage"
    ];

    for (const name of modules) {
      try {
        this.modules[name]?.destroy?.();
      } catch (error) {
        console.error(
          `Failed to destroy ${name}`,
          error
        );
      }
    }

    this.modules = {};

    if (RasemApplication.instance === this) {
      RasemApplication.instance = null;
    }

    this.emit("rasem:destroyed");
  }
}

// =========================================================
// APPLICATION STARTUP
// =========================================================

export function createRasem(options = {}) {
  const app = new RasemApplication(options);

  app.init();

  return app;
}

// =========================================================
// BROWSER ENTRY POINT
// =========================================================

let rasemApp = null;

function startRasem() {
  if (rasemApp) return rasemApp;

  rasemApp = createRasem();

  window.rasem = rasemApp.api;
  window.rasemApp = rasemApp;

  return rasemApp;
}

function stopRasem() {
  if (!rasemApp) return;

  rasemApp.destroy();

  rasemApp = null;

  delete window.rasem;
  delete window.rasemApp;
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startRasem,
      { once: true }
    );
  } else {
    startRasem();
  }
}

export {
  rasemApp
};

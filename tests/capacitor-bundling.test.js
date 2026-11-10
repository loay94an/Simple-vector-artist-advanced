import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

test("save dialogs use the Vite-bundled storage API", () => {
  assert.doesNotMatch(html, /import\(["']\.\/js\/storage-export\.js["']\)/);
  assert.equal((html.match(/window\.rasemStorageExports/g) || []).length, 2);
  assert.match(app, /window\.rasemStorageExports\s*=\s*Object\.freeze/);
});

test("the bundled storage API exposes every save format", () => {
  for (const name of ["downloadBlob", "SVGExport", "PNGExport", "PDFExport"]) {
    assert.match(app, new RegExp("\\b" + name + "\\b"));
  }
});

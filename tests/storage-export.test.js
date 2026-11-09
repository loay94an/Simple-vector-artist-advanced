import test from "node:test";
import assert from "node:assert/strict";
import { DocumentFormat, StorageManager } from "../js/storage-export.js";

function sampleDocument() {
  return {
    id: "doc-1",
    name: "اختبار",
    layers: [{ id: "layer-1", name: "طبقة", visible: true, locked: false, opacity: 1, elements: [] }],
    activeLayerId: "layer-1"
  };
}

class FakeStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.removed = [];
    this.failKey = null;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error("QuotaExceededError");
    this.values.set(key, String(value));
  }
  removeItem(key) { this.removed.push(key); this.values.delete(key); }
}

test("document export remains available independently of persistent storage", () => {
  const doc = sampleDocument();
  const manager = new StorageManager(doc, { storage: null });
  const blob = manager.exportFile();
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "application/json;charset=utf-8");
  assert.equal(DocumentFormat.parse(manager.exportFile() ? JSON.stringify(doc) : "{}").name, "اختبار");
});

test("failed storage write never deletes the existing backup", () => {
  const previous = JSON.stringify(sampleDocument());
  const storage = new FakeStorage({
    "rasem-2-document": previous,
    "rasem-2-document-backup": "last-known-good-backup"
  });
  storage.failKey = "rasem-2-document";
  const manager = new StorageManager(sampleDocument(), { storage });
  assert.equal(manager.save(), false);
  assert.equal(storage.getItem("rasem-2-document-backup"), previous);
  assert.deepEqual(storage.removed, []);
});

test("storage manager reports failure when persistence is unavailable", () => {
  const manager = new StorageManager(sampleDocument(), { storage: null });
  assert.equal(manager.save(), false);
  assert.ok(manager.exportFile() instanceof Blob);
});

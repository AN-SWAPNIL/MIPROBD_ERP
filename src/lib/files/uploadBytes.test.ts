import assert from "node:assert/strict";
import test from "node:test";
import { attachmentMimes } from "./attachments.js";
import { documentUploadBlob } from "./uploadBytes.js";

const file = (bytes = Buffer.from([0, 127, 128, 255]), mimeType = "application/pdf") => ({
  fileDataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType, sizeBytes: bytes.length
});

test("converts every supported attachment type without changing its binary bytes", async () => {
  for (const mime of attachmentMimes) {
    const upload = file(undefined, mime), blob = documentUploadBlob(upload);
    assert.equal(blob.type, mime);
    assert.equal(blob.size, upload.sizeBytes);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from([0, 127, 128, 255]));
  }
});

test("decodes locally without fetch or any network request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Network access is forbidden"); };
  try { assert.equal(await documentUploadBlob(file(Buffer.from("selected document"))).text(), "selected document"); }
  finally { globalThis.fetch = original; }
});

test("rejects malformed, mismatched, empty and oversized file data with a safe error", () => {
  const valid = file();
  for (const upload of [
    { ...valid, fileDataUrl: "https://example.invalid/file" },
    { ...valid, fileDataUrl: valid.fileDataUrl.replace("application/pdf", "text/plain") },
    { ...valid, fileDataUrl: "data:application/pdf;base64,!!!!!!!!" },
    { ...valid, fileDataUrl: "data:application/pdf;base64,AAAAAAA=" },
    { ...valid, sizeBytes: 0 }, { ...valid, sizeBytes: -1 }, { ...valid, sizeBytes: 1.5 },
    { ...valid, sizeBytes: Number.NaN }, { ...valid, sizeBytes: 10 * 1024 * 1024 + 1 }
  ]) assert.throws(() => documentUploadBlob(upload), { message: "The selected file could not be read. Select the file again and retry." });
});

test("handles base64 padding and a large permitted document", async () => {
  for (const length of [1, 2, 3, 10 * 1024 * 1024]) {
    const bytes = Buffer.alloc(length, 213), blob = documentUploadBlob(file(bytes));
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes);
  }
});

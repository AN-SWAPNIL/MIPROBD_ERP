import type { DocumentUpload } from "../../domains/erp.types";

export function documentUploadBlob(upload: Pick<DocumentUpload, "fileDataUrl" | "mimeType" | "sizeBytes">): Blob {
  const invalid = () => new Error("The selected file could not be read. Select the file again and retry.");
  const prefix = `data:${upload.mimeType};base64,`;
  if (!Number.isInteger(upload.sizeBytes) || upload.sizeBytes < 1 || upload.sizeBytes > 10 * 1024 * 1024 || !upload.fileDataUrl.startsWith(prefix)) throw invalid();
  const encoded = upload.fileDataUrl.slice(prefix.length);
  if (encoded.length !== 4 * Math.ceil(upload.sizeBytes / 3)) throw invalid();
  let binary: string;
  try { binary = atob(encoded); } catch { throw invalid(); }
  if (binary.length !== upload.sizeBytes) throw invalid();
  // Decode locally: fetching a data URL is blocked by the deployed connect-src policy.
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: upload.mimeType });
}

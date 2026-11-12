import sharp from "sharp";
import { createHash } from "node:crypto";
import { HttpError } from "./errors.js";

export async function inspectMasterImage(bytes: Buffer, mime: string) {
  if (bytes.length < 1 || bytes.length >= 1_000_000) throw new HttpError(422, "Image must be smaller than 1 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 16_777_216, failOn: "warning" });
    const metadata = await image.metadata();
    const expected: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 4096 || (metadata.pages ?? 1) !== 1 || expected[metadata.format ?? ""] !== mime) throw new Error("Unsupported image");
    await image.raw().toBuffer();
    return { width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new HttpError(422, "Choose a valid, non-animated JPG, PNG or WebP image, at most 4096 pixels per side."); }
}

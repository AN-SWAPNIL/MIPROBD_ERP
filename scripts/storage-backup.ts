import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createContext } from "../server/foundation/context.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  if (!process.argv.includes("--download")) { console.log("Dry run: no object bytes copied. Private-file copy approval is required before using --download. Bounds: 3 configured buckets, 1,000 objects, 250 MB total."); return; }
  const ctx = createContext();
  const projectRef = new URL(ctx.config.SUPABASE_URL).hostname.split(".")[0];
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Unexpected backup project identity");
  const root = new URL(`../artifacts/backups/${projectRef}/storage-${Date.now()}/`, import.meta.url);
  const objects: { bucket: string; path: string; sha256: string; sizeBytes: number; updatedAt: string | null }[] = [];
  const hashes = new Set<string>(); let total = 0;
  try {
    await mkdir(new URL("objects/", root), { recursive: true });
    for (const bucket of ["erp-documents", "website-media", "erp-opening-sources"]) {
      const { data: policy, error: missing } = await ctx.admin.storage.getBucket(bucket); if (missing || !policy) throw new Error("Required storage bucket unavailable");
      if (bucket !== "website-media" && policy.public) throw new Error("Private bucket visibility is unsafe");
      const walk = async (prefix: string, depth: number) => {
        if (depth > 10) throw new Error("Storage prefix nesting exceeds backup limit");
        for (let offset = 0; ; offset += 100) {
          const { data, error } = await ctx.admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } }); if (error || !data) throw new Error("Storage listing failed");
          for (const entry of data) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (!entry.id) { await walk(path, depth + 1); continue; }
            if (objects.length >= 1000 || Number(entry.metadata?.size ?? 0) > 10 * 1024 * 1024) throw new Error("Storage backup bounds exceeded");
            const { data: blob, error: download } = await ctx.admin.storage.from(bucket).download(path);
            if (download || !blob || blob.size > 10 * 1024 * 1024 || entry.metadata?.size !== undefined && blob.size !== Number(entry.metadata.size)) throw new Error("Storage object download/size verification failed");
            total += blob.size; if (total > 250 * 1024 * 1024) throw new Error("Storage backup exceeds 250 MB limit");
            const bytes = new Uint8Array(await blob.arrayBuffer()); const sha256 = hash(bytes); const local = new URL(`objects/${sha256}`, root);
            if (!hashes.has(sha256)) { await writeFile(local, bytes, { flag: "wx", mode: 0o600 }); if (hash(await readFile(local)) !== sha256) throw new Error("Local byte backup hash verification failed"); hashes.add(sha256); }
            objects.push({ bucket, path, sha256, sizeBytes: bytes.length, updatedAt: entry.updated_at ?? null });
          }
          if (data.length < 100) break;
        }
      };
      await walk("", 0);
    }
    const manifest = JSON.stringify({ format: "mipro-object-backup-v1", state: "Complete", capturedAt: new Date().toISOString(), projectRef: new URL(ctx.config.SUPABASE_URL).hostname.split(".")[0], note: "Object-byte capture is independent of the database snapshot; this is not a restore drill or an offsite backup.", objects }, null, 2);
    await writeFile(new URL("manifest.json", root), manifest, { flag: "wx", mode: 0o600 });
    await writeFile(new URL("manifest.sha256", root), hash(Buffer.from(manifest)), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ objects: objects.length, uniqueContentFiles: hashes.size, totalBytes: total, localHashesVerified: true, privateFolder: root.pathname.split("/").filter(Boolean).at(-1), remoteObjectsChanged: false, restoreTested: false, offsite: false }));
  } finally { await ctx.client.end(); }
}
main().catch(() => { console.error("Object backup incomplete. Partial local files are retained; no remote objects were changed. Do not treat a folder without a Complete manifest as a backup."); process.exitCode = 1; });

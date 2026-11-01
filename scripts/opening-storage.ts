import { createContext } from "../server/foundation/context.js";
import { openingMime, maximumWorkbookBytes } from "../server/opening/workbook.js";
async function main() {
  const ctx = createContext();
  try {
    const { data, error } = await ctx.admin.storage.getBucket("erp-opening-sources");
    if (data) { if (data.public || data.file_size_limit !== maximumWorkbookBytes || !data.allowed_mime_types?.includes(openingMime)) throw new Error("Existing source bucket policy differs; no settings were changed."); console.log("Private opening-source storage policy verified."); return; }
    if (!process.argv.includes("--apply") || error && !["400", "404"].includes(String(error.status))) throw new Error("New private bucket requires --apply and provider access.");
    const created = await ctx.admin.storage.createBucket("erp-opening-sources", { public: false, fileSizeLimit: maximumWorkbookBytes, allowedMimeTypes: [openingMime] });
    if (created.error) throw new Error("Source bucket setup failed."); console.log("Created private, XLSX-only opening-source bucket. Existing buckets and objects were not changed.");
  } finally { await ctx.client.end(); }
}
main().catch(() => { console.error("Opening-source storage requires reviewed setup; no credentials are logged."); process.exitCode = 1; });

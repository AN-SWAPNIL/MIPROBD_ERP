import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

try { loadEnvFile(); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (!process.env.DATABASE_MIGRATION_URL) throw new Error("DATABASE_MIGRATION_URL is required");
export default defineConfig({
  schema: "./database/schema.ts",
  out: "./database/migrations",
  dialect: "postgresql",
  schemaFilter: ["erp_private"],
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL },
  strict: true
});

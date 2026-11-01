import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { rootCertificates } from "node:tls";
import { supabaseRootCa } from "./supabase-ca.js";
import * as schema from "./schema.js";

export function connectDatabase(url: string) {
  // node-postgres serializes work on each connection; transaction poolers cannot pipeline.
  const client = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: true, ca: [...rootCertificates, supabaseRootCa] }, connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000, statement_timeout: 15000, query_timeout: 20000 });
  client.on("error", (error: NodeJS.ErrnoException) => console.error("Idle database connection failed", { code: error.code ?? "CONNECTION" }));
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

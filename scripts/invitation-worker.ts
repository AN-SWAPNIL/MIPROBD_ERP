import "../server/config.js";
import { createContext } from "../server/foundation/context.js";
import { processInvitation } from "../server/foundation/invitation-outbox.js";

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Explicit --apply required to send queued invitations");
  const ctx = createContext();
  try { let count = 0; for (let i = 0; i < 5; i++) if (await processInvitation(ctx)) count++; console.log(`Invitation jobs processed: ${count}. Provider acceptance is not inbox confirmation.`); }
  finally { await ctx.client.end(); }
}
main().catch(() => { console.error("Invitation worker could not finish; inspect sanitized queue status. No credentials printed."); process.exitCode = 1; });

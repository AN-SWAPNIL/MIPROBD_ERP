import { createHmac } from "node:crypto";

// RFC 6238 test client only. Production code always uses Supabase's MFA engine.
export function authenticatorCode(secret: string, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) { const i = alphabet.indexOf(char); if (i < 0) throw new Error("Invalid temporary test secret"); bits += i.toString(2).padStart(5, "0"); }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2))); const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest(); const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

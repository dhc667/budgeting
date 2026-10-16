import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/supabase/database.ts";

export async function createInviteCode(
  admin: SupabaseClient<Database>,
  expiresInHours: number,
): Promise<string> {
  const code = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const { error } = await admin
    .from("invite_codes")
    .insert({ code_hash: hashInviteCode(code), expires_at: expiresAt.toISOString() });
  if (error) throw new Error(`Could not store the invite code: ${error.message}`);

  return code;
}

// Must match the hashing in the signup hook and trigger (db/migrations/0006_invite_signup.sql).
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

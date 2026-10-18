import type { SupabaseClient } from "@supabase/supabase-js";
import { hashInviteCode, newInviteCode } from "../src/instance/invite-code.ts";
import type { Database } from "../src/supabase/database.ts";

export async function createInviteCode(
  admin: SupabaseClient<Database>,
  expiresInHours: number,
): Promise<string> {
  const code = newInviteCode();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const { error } = await admin
    .from("invite_codes")
    .insert({ code_hash: await hashInviteCode(code), expires_at: expiresAt.toISOString() });
  if (error) throw new Error(`Could not store the invite code: ${error.message}`);

  return code;
}

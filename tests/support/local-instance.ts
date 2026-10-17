import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { defined } from "../../cli/defined.ts";
import { createInviteCode } from "../../cli/invites.ts";
import { buildConnectLink, type Instance } from "../../src/instance/connect-link.ts";
import type { Database } from "../../src/supabase/database.ts";
import type { Enums } from "../../src/supabase/database.types.ts";

process.loadEnvFile(".env.instance.local");
const env = (name: string) => process.env[name] ?? "";

export const instance: Instance = {
  supabaseUrl: env("SUPABASE_URL"),
  publishableKey: env("SUPABASE_PUBLISHABLE_KEY"),
};

export const admin = createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});

export const sql = postgres(env("DATABASE_URL"), { max: 1, onnotice: () => {} });

export const password = "correct horse battery";

export async function inviteLink(): Promise<string> {
  return buildConnectLink("http://localhost:3000/", {
    instance,
    inviteCode: await createInviteCode(admin, 24),
  });
}

export function signInLink(): string {
  return buildConnectLink("http://localhost:3000/", { instance, inviteCode: null });
}

export async function existingUser(displayName: string) {
  const email = uniqueEmail();
  const inviteCode = await createInviteCode(admin, 24);
  const { data, error } = await anonClient().auth.signUp({
    email,
    password,
    options: { data: { invite_code: inviteCode, display_name: displayName } },
  });
  if (error) throw error;
  return { email, userId: defined(data.user).id };
}

export async function signedInUser(displayName: string, language?: Language) {
  const client = anonClient();
  const inviteCode = await createInviteCode(admin, 24);
  const { data, error } = await client.auth.signUp({
    email: uniqueEmail(),
    password,
    options: { data: { invite_code: inviteCode, display_name: displayName, language } },
  });
  if (error) throw error;
  return { client, userId: defined(data.user).id };
}

export async function signedInAs(email: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function privateSpaceOf(user: SignedInUser) {
  const { data, error } = await user.client
    .from("spaces")
    .select("id, name")
    .eq("private_owner", user.userId)
    .single();
  if (error) throw error;
  return data;
}

export async function createSpace(
  creator: SignedInUser,
  name: string,
  members: SignedInUser[],
  language: Language = "en",
): Promise<string> {
  const { data, error } = await creator.client.rpc("create_space", {
    space_name: name,
    member_ids: members.map(({ userId }) => userId),
    starter_language: language,
  });
  if (error) throw error;
  return data;
}

export type SignedInUser = Awaited<ReturnType<typeof signedInUser>>;

type Language = Enums<"language">;

export function anonClient() {
  return createClient<Database>(instance.supabaseUrl, instance.publishableKey, {
    auth: { persistSession: false },
  });
}

export function uniqueEmail() {
  return `${crypto.randomUUID()}@test.local`;
}

export { defined };

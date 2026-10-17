import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInviteCode, hashInviteCode } from "../../cli/invites.ts";
import { migrationCount } from "../../db/migration-count.ts";
import {
  admin,
  anonClient,
  defined,
  password,
  signedInUser,
  sql,
  uniqueEmail,
} from "../support/local-instance.ts";

afterAll(() => sql.end());

describe("signup with an invite code", () => {
  it("creates the user and their profile, and uses up the code", async () => {
    const code = await createInviteCode(admin, 24);
    const { data, error } = await signUp({ invite_code: code, display_name: "Ana" });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    const userId = defined(data.user).id;
    const [profile] =
      await sql`select display_name, display_currency from profiles where id = ${userId}`;
    expect(profile).toEqual({ display_name: "Ana", display_currency: "USD" });
    const [invite] =
      await sql`select used_by from invite_codes where code_hash = ${hashInviteCode(code)}`;
    expect(invite).toEqual({ used_by: userId });
  });

  it("rejects a code that was already used", async () => {
    const code = await createInviteCode(admin, 24);
    await signUp({ invite_code: code, display_name: "First" });

    const { error } = await signUp({ invite_code: code, display_name: "Second" });

    expect(error?.message).toMatch(/invite code is invalid, already used or expired/);
  });

  it("rejects an expired code", async () => {
    const code = await createInviteCode(admin, 24);
    await sql`update invite_codes set expires_at = now() - interval '1 minute' where code_hash = ${hashInviteCode(code)}`;

    const { error } = await signUp({ invite_code: code, display_name: "Late" });

    expect(error?.message).toMatch(/invite code is invalid/);
  });

  it("rejects a signup without a code", async () => {
    const { error } = await signUp({ display_name: "Nobody" });

    expect(error?.message).toMatch(/invite code is invalid/);
  });

  it("keeps the code check in the database even if the hook is bypassed", async () => {
    const insertWithoutCode = sql`
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), ${uniqueEmail()}, '{}'::jsonb)`;

    await expect(insertWithoutCode).rejects.toThrow(/invalid, used or expired invite code/);
  });
});

describe("profiles", () => {
  let ana: ReturnType<typeof anonClient>;
  let anaId: string;
  let otherId: string;

  beforeAll(async () => {
    ({ client: ana, userId: anaId } = await signedInUser("Ana"));
    ({ userId: otherId } = await signedInUser("Ben"));
  });

  it("lets a user see everyone in the instance", async () => {
    const { data } = await ana.from("profiles").select("id").in("id", [anaId, otherId]);

    expect(data).toHaveLength(2);
  });

  it("lets a user edit their own name and display currency", async () => {
    const { error } = await ana
      .from("profiles")
      .update({ display_name: "Ana María", display_currency: "EUR" })
      .eq("id", anaId);

    expect(error).toBeNull();
    const [profile] =
      await sql`select display_name, display_currency from profiles where id = ${anaId}`;
    expect(profile).toEqual({ display_name: "Ana María", display_currency: "EUR" });
  });

  it("does not let a user edit someone else's profile", async () => {
    await ana.from("profiles").update({ display_name: "Hacked" }).eq("id", otherId);

    const [profile] = await sql`select display_name from profiles where id = ${otherId}`;
    expect(profile).toEqual({ display_name: "Ben" });
  });

  it("only accepts a display currency from the currency list", async () => {
    const before = await sql`select display_currency from profiles where id = ${anaId}`;

    const { error } = await ana
      .from("profiles")
      .update({ display_currency: "XYZ" })
      .eq("id", anaId);

    expect(error).not.toBeNull();
    expect(await sql`select display_currency from profiles where id = ${anaId}`).toEqual(before);
  });

  it("hides invite codes from users", async () => {
    const { data } = await ana.from("invite_codes").select("code_hash");

    expect(data ?? []).toEqual([]);
  });
});

describe("currencies", () => {
  it("lists each currency with its number of decimals", async () => {
    const { client } = await signedInUser("Ana");

    const { data } = await client
      .from("currencies")
      .select("code, decimals")
      .in("code", ["JPY", "USD", "KWD"]);

    expect(data).toEqual(
      expect.arrayContaining([
        { code: "JPY", decimals: 0 },
        { code: "USD", decimals: 2 },
        { code: "KWD", decimals: 3 },
      ]),
    );
  });
});

describe("a table or function added by a future migration", () => {
  it("is out of the app's reach until a migration grants access", async () => {
    await sql`create table public.privilege_probe (id int)`;
    await sql`create function public.privilege_probe() returns int language sql as 'select 1'`;
    try {
      const [access] = await sql`
        select
          has_table_privilege('anon', 'public.privilege_probe', 'select') as anon_reads,
          has_table_privilege('authenticated', 'public.privilege_probe', 'select,insert,update,delete') as user_touches,
          has_function_privilege('anon', 'public.privilege_probe()', 'execute') as anon_calls,
          has_function_privilege('authenticated', 'public.privilege_probe()', 'execute') as user_calls`;

      expect(access).toEqual({
        anon_reads: false,
        user_touches: false,
        anon_calls: false,
        user_calls: false,
      });
    } finally {
      await sql`drop function public.privilege_probe()`;
      await sql`drop table public.privilege_probe`;
    }
  });
});

describe("schema version", () => {
  it("matches the number of migrations, before anyone signs in", async () => {
    const { data, error } = await anonClient().rpc("schema_version");

    expect(error).toBeNull();
    expect(data).toBe(migrationCount());
  });
});

function signUp(metadata: Record<string, string>) {
  return anonClient().auth.signUp({ email: uniqueEmail(), password, options: { data: metadata } });
}

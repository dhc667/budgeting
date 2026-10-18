import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { input, password } from "@inquirer/prompts";
import { createClient } from "@supabase/supabase-js";
import * as z from "zod";
import type { AppSupabase } from "../../src/supabase/client.ts";
import type { Database } from "../../src/supabase/database.ts";
import { instanceFromEnv, readEnvFile } from "../env.ts";
import { fail } from "../fail.ts";
import { type Commands, dataOf, noPositionals, parseCommand, print } from "./command.ts";

export const sessionCommands: Commands = { login, logout, whoami };

export async function signedIn(
  envPath: string,
): Promise<{ supabase: AppSupabase; userId: string }> {
  const supabase = userClient(envPath);
  const { data, error } = await supabase.auth.getSession();
  if (error) fail(`Could not resume the session: ${error.message}`);
  if (!data.session) {
    fail(`Not signed in to ${hostOf(envPath)}. Run: pnpm app login --env ${envPath}`);
  }
  return { supabase, userId: data.session.user.id };
}

// The password only ever goes to Supabase; what stays on disk is the session it returns.
async function login(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {
    email: { type: "string" },
    "password-stdin": { type: "boolean", default: false },
  });
  noPositionals(positionals, "login [--email <email>] [--password-stdin]");
  const fromStdin = values["password-stdin"];
  if (fromStdin && !values.email) fail("--password-stdin needs --email too.");
  if (!fromStdin && !process.stdin.isTTY) {
    fail("login asks for the password in a terminal. Run it in one, or pass --password-stdin.");
  }

  const email = values.email ?? (await input({ message: "Email", required: true }));
  const secret = fromStdin
    ? await readStdin()
    : await password({ message: "Password", mask: true });
  const { data, error } = await userClient(values.env).auth.signInWithPassword({
    email,
    password: secret,
  });
  if (error) fail(`Could not sign in: ${error.message}`);

  console.log(`Signed in to ${hostOf(values.env)} as ${data.user.email ?? email}.`);
  console.log(`The session is saved in ${sessionPath(values.env)}; pnpm app logout ends it.`);
}

async function logout(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  noPositionals(positionals, "logout");
  const supabase = userClient(values.env);
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    console.log(`Not signed in to ${hostOf(values.env)}.`);
    return;
  }
  // The global scope would sign the user out on their phone too.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) fail(`Could not sign out: ${error.message}`);
  console.log(`Signed out of ${hostOf(values.env)}.`);
}

async function whoami(argv: string[]) {
  const { values, positionals } = parseCommand(argv, {});
  noPositionals(positionals, "whoami");
  const { supabase, userId } = await signedIn(values.env);
  const profile = await dataOf(
    supabase.from("profiles").select("display_name").eq("id", userId).single(),
  );
  const { data } = await supabase.auth.getUser();
  print({
    instance: hostOf(values.env),
    userId,
    email: data.user?.email ?? null,
    displayName: profile.display_name,
  });
}

function userClient(envPath: string): AppSupabase {
  const instance = instanceFromEnv(readEnvFile(envPath));
  return createClient<Database>(instance.supabaseUrl, instance.publishableKey, {
    auth: {
      storage: fileStorage(sessionPath(envPath)),
      // Each command is a short process: it refreshes an expired session when it reads it.
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Beside the env file, so each instance keeps its own session, and git ignores it the same way.
function sessionPath(envPath: string): string {
  return `${envPath}.session`;
}

// The refresh token in it signs in as the user: only they may read it.
function fileStorage(path: string) {
  const read = () =>
    existsSync(path) ? storedItems.parse(JSON.parse(readFileSync(path, "utf8"))) : {};
  const write = (items: Record<string, string>) => {
    if (Object.keys(items).length === 0) {
      rmSync(path, { force: true });
      return;
    }
    writeFileSync(path, JSON.stringify(items), { mode: 0o600 });
    chmodSync(path, 0o600);
  };
  return {
    getItem: (key: string) => read()[key] ?? null,
    setItem: (key: string, value: string) => write({ ...read(), [key]: value }),
    removeItem: (key: string) =>
      write(Object.fromEntries(Object.entries(read()).filter(([k]) => k !== key))),
  };
}

const storedItems = z.record(z.string(), z.string());

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  return text.replace(/\r?\n$/, "");
}

function hostOf(envPath: string): string {
  return new URL(instanceFromEnv(readEnvFile(envPath)).supabaseUrl).host;
}

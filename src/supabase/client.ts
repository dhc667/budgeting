import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Instance } from "../instance/connect-link";
import type { Database } from "./database.types";

export type AppSupabase = SupabaseClient<Database>;

// Each client runs a token refresh timer and listens to other tabs, so there is at most one per
// instance: React may build its state twice, and a second client would refresh the same session.
const clients = new Map<string, AppSupabase>();

export function supabaseFor(instance: Instance): AppSupabase {
  const key = clientKey(instance);
  let client = clients.get(key);
  if (!client) {
    client = createSupabase(instance);
    clients.set(key, client);
  }
  return client;
}

export function releaseSupabase(instance: Instance) {
  const key = clientKey(instance);
  void clients.get(key)?.auth.dispose();
  clients.delete(key);
}

// signOut() defaults to the global scope, which would sign the user out on every device.
export function signOutHere(supabase: AppSupabase) {
  return supabase.auth.signOut({ scope: "local" });
}

function clientKey(instance: Instance) {
  return `${instance.supabaseUrl} ${instance.publishableKey}`;
}

function createSupabase(instance: Instance): AppSupabase {
  return createClient<Database>(instance.supabaseUrl, instance.publishableKey, {
    auth: {
      // The default key uses only the host's first label, so a connect link to
      // <project-ref>.attacker.example would pick up this instance's session and send it there.
      storageKey: `budgeting.session.${new URL(instance.supabaseUrl).origin}`,
      // Sign-in never comes back through a redirect, and the hash belongs to the router.
      detectSessionInUrl: false,
    },
  });
}

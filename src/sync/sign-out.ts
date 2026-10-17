import { useCallback } from "react";
import type { Instance } from "../instance/connect-link";
import { useInstance } from "../instance/instance-context";
import { type AppSupabase, signOutHere } from "../supabase/client";
import { copyName } from "./sync";
import { deleteCopy } from "./store";

// Every place that signs the user out goes through here, so the copy never outlives the session.
export function useSignOut(): () => Promise<void> {
  const { instance, supabase } = useInstance();
  return useCallback(async () => {
    if (instance && supabase) await signOutAndDeleteCopy(supabase, instance);
  }, [instance, supabase]);
}

export async function signOutAndDeleteCopy(supabase: AppSupabase, instance: Instance) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  await signOutHere(supabase);
  if (userId) await deleteCopy(copyName(instance, userId));
}

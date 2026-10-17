import { useCallback } from "react";
import { useSession } from "../auth/session";
import type { Instance } from "../instance/connect-link";
import { useInstance } from "../instance/instance-context";
import { type AppSupabase, signOutHere } from "../supabase/client";
import { copyName } from "./copy-source";
import { deleteCopy } from "./store";

export function useSignOut(): () => Promise<void> {
  const { instance, supabase } = useInstance();
  const signedInUserId = useSession()?.user.id;
  return useCallback(async () => {
    if (instance && supabase) await signOutAndDeleteCopy(supabase, instance, signedInUserId);
  }, [instance, supabase, signedInUserId]);
}

// `signedInUserId` is the app's own idea of who is signed in, which outlives an expired session.
export async function signOutAndDeleteCopy(
  supabase: AppSupabase,
  instance: Instance,
  signedInUserId?: string,
) {
  const userId = signedInUserId ?? (await supabase.auth.getSession()).data.session?.user.id;
  await signOutHere(supabase);
  if (userId) await deleteCopy(copyName(instance, userId));
}

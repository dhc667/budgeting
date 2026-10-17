import type { Instance } from "../instance/connect-link";
import type { AppSupabase } from "../supabase/client";
import type { Changes } from "./copy";

// One copy per user per instance, so another user on the device never reads it.
export function copyName(instance: Instance, userId: string): string {
  return `budgeting.copy ${instance.supabaseUrl} ${userId}`;
}

export function changesFrom(supabase: AppSupabase) {
  return async (since: number): Promise<Changes> => {
    const { data, error } = await supabase.rpc("changes_since", { since });
    if (error) throw error;
    return data;
  };
}

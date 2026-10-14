import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session | null {
  return useContext(SessionContext);
}

export function useSignedInUser() {
  const session = useSession();
  if (!session) throw new Error("useSignedInUser must be used below RequireSession");
  return session.user;
}

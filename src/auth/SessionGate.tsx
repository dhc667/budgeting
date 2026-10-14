import type { Session } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { useSupabase } from "../instance/instance-context";
import { createQueryClient } from "../query-client";
import { SessionContext, useSession } from "./session";

export function SessionGate() {
  const supabase = useSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  // The first event is INITIAL_SESSION, carrying whatever session the client has stored.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (session === undefined) return null;
  return (
    <SessionContext value={session}>
      <Outlet />
    </SessionContext>
  );
}

export function RequireSession() {
  const session = useSession();
  if (!session) return <Navigate to="/sign-in" replace />;
  return (
    <UserQueryCache key={session.user.id}>
      <Outlet />
    </UserQueryCache>
  );
}

// Every user starts with an empty cache, so whatever a query is keyed by, the next person to sign
// in on this device never sees the previous one's data.
function UserQueryCache({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

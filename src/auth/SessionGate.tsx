import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { useSupabase } from "../instance/instance-context";
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
  return useSession() ? <Outlet /> : <Navigate to="/sign-in" replace />;
}

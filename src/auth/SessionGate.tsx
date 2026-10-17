import type { Session } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router";
import { deviceLanguage } from "../i18n/languages";
import { useSupabase } from "../instance/instance-context";
import { useProfile } from "../profile/profile-queries";
import { createQueryClient } from "../query-client";
import { useSyncExchangeRates } from "../rates/rates-sync";
import { isNoRows } from "../supabase/errors";
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
      <SignOutDeletedUser>
        <UserLanguage>
          <SyncExchangeRates>
            <Outlet />
          </SyncExchangeRates>
        </UserLanguage>
      </SignOutDeletedUser>
    </UserQueryCache>
  );
}

// Every user starts with an empty cache, so whatever a query is keyed by, the next person to sign
// in on this device never sees the previous one's data.
function UserQueryCache({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// A user deleted while signed in keeps a valid access token until it expires, with no profile to
// show; signing out is the only way forward.
function SignOutDeletedUser({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { error } = useProfile();
  const userDeleted = error !== null && isNoRows(error);

  useEffect(() => {
    if (userDeleted) void supabase.auth.signOut({ scope: "local" });
  }, [supabase, userDeleted]);

  return children;
}

// Signing out hands the device back to its own language for the sign-in screen.
function UserLanguage({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const language = useProfile().data?.language ?? null;

  useEffect(() => {
    void i18n.changeLanguage(language ?? deviceLanguage());
    return () => void i18n.changeLanguage(deviceLanguage());
  }, [i18n, language]);

  return children;
}

function SyncExchangeRates({ children }: { children: ReactNode }) {
  useSyncExchangeRates();
  return children;
}

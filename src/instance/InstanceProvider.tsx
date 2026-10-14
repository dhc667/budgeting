import { type ReactNode, useMemo, useState } from "react";
import { releaseSupabase, supabaseFor } from "../supabase/client";
import { type Instance, parseInstance } from "./connect-link";
import { InstanceContext, type InstanceContextValue } from "./instance-context";

const storageKey = "budgeting.instance";

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState(loadInstance);
  const supabase = useMemo(() => (instance ? supabaseFor(instance) : null), [instance]);

  const value = useMemo<InstanceContextValue>(
    () => ({
      instance,
      supabase,
      connect(next) {
        if (instance && sameInstance(instance, next)) return;
        if (instance) releaseSupabase(instance);
        localStorage.setItem(storageKey, JSON.stringify(next));
        setInstance(next);
      },
      disconnect() {
        if (instance) releaseSupabase(instance);
        localStorage.removeItem(storageKey);
        setInstance(null);
      },
    }),
    [instance, supabase],
  );

  return <InstanceContext value={value}>{children}</InstanceContext>;
}

// Anything unreadable counts as not connected, so a new connect link can still recover the device.
function loadInstance(): Instance | null {
  try {
    return parseInstance(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
  } catch {
    return null;
  }
}

function sameInstance(a: Instance, b: Instance) {
  return a.supabaseUrl === b.supabaseUrl && a.publishableKey === b.publishableKey;
}

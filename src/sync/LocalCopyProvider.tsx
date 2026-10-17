import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSignedInUser } from "../auth/session";
import { useInstance } from "../instance/instance-context";
import type { LocalCopy } from "./copy";
import { LocalCopyContext, type LocalCopyContextValue } from "./local-copy-context";
import { changesFrom, copyName, createCopySync } from "./sync";

export function LocalCopyProvider({ children }: { children: ReactNode }) {
  const { instance, supabase } = useInstance();
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const [copy, setCopy] = useState<LocalCopy | null>(null);

  const sync = useMemo(() => {
    if (!instance || !supabase)
      throw new Error("LocalCopyProvider must be used below InstanceGate");
    return createCopySync({
      name: copyName(instance, user.id),
      schemaVersion: __SCHEMA_VERSION__,
      fetchChanges: changesFrom(supabase),
      publish(next) {
        setCopy(next);
        void queryClient.invalidateQueries();
      },
    });
  }, [instance, supabase, user.id, queryClient]);

  useEffect(() => {
    const pull = () => void sync.pull();
    const pullWhenVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    pull();
    window.addEventListener("online", pull);
    document.addEventListener("visibilitychange", pullWhenVisible);
    return () => {
      window.removeEventListener("online", pull);
      document.removeEventListener("visibilitychange", pullWhenVisible);
      sync.close();
    };
  }, [sync]);

  const value = useMemo<LocalCopyContextValue>(
    () => ({ copy, requestPull: sync.pull }),
    [copy, sync],
  );
  return <LocalCopyContext value={value}>{children}</LocalCopyContext>;
}

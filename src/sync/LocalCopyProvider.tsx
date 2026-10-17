import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSignedInUser } from "../auth/session";
import { useInstance } from "../instance/instance-context";
import { changesFrom, copyName } from "./copy-source";
import type { LocalCopy } from "./copy";
import { copyQueryKey, LocalCopyContext, type LocalCopyContextValue } from "./local-copy-context";
import { type CopySync, createCopySync } from "./sync";

export function LocalCopyProvider({ children }: { children: ReactNode }) {
  const { instance, supabase } = useInstance();
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const [copy, setCopy] = useState<LocalCopy | null>(null);
  const syncRef = useRef<CopySync | null>(null);
  if (!instance || !supabase) throw new Error("LocalCopyProvider must be used below InstanceGate");

  useEffect(() => {
    const sync = createCopySync({
      name: copyName(instance, user.id),
      schemaVersion: __SCHEMA_VERSION__,
      fetchChanges: changesFrom(supabase),
      publish(next) {
        setCopy(next);
        void queryClient.invalidateQueries({ queryKey: copyQueryKey() });
      },
    });
    syncRef.current = sync;

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
      syncRef.current = null;
    };
  }, [instance, supabase, user.id, queryClient]);

  const requestPull = useCallback(() => syncRef.current?.pull() ?? Promise.resolve(), []);
  const value = useMemo<LocalCopyContextValue>(() => ({ copy, requestPull }), [copy, requestPull]);
  return <LocalCopyContext value={value}>{children}</LocalCopyContext>;
}

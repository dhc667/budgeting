import { createContext, useContext } from "react";
import type { LocalCopy } from "./copy";

export type LocalCopyContextValue = {
  copy: LocalCopy | null;
  requestPull: () => Promise<void>;
};

export const LocalCopyContext = createContext<LocalCopyContextValue | null>(null);

// Queries that read the copy go under this key, so they refetch when the copy changes and
// nothing else does.
export function copyQueryKey(...parts: readonly unknown[]): readonly unknown[] {
  return [copyQueryPrefix, ...parts];
}

const copyQueryPrefix = "copy";

// Null until the saved copy is loaded or the first pull arrives.
export function useLocalCopy(): LocalCopy | null {
  return useLocalCopyContext().copy;
}

// Resolves when the pull is done, whether or not it succeeded: a failed pull keeps the copy.
export function useRequestPull(): () => Promise<void> {
  return useLocalCopyContext().requestPull;
}

function useLocalCopyContext(): LocalCopyContextValue {
  const context = useContext(LocalCopyContext);
  if (!context) throw new Error("useLocalCopy must be used inside LocalCopyProvider");
  return context;
}

import { createContext, useContext } from "react";
import type { LocalCopy } from "./copy";

export type LocalCopyContextValue = {
  copy: LocalCopy | null;
  requestPull: () => Promise<void>;
};

export const LocalCopyContext = createContext<LocalCopyContextValue | null>(null);

// Null until the saved copy is loaded or the first pull arrives.
export function useLocalCopy(): LocalCopy | null {
  return useLocalCopyContext().copy;
}

// Resolves when the pull is done, whether or not it succeeded.
export function useRequestPull(): () => Promise<void> {
  return useLocalCopyContext().requestPull;
}

function useLocalCopyContext(): LocalCopyContextValue {
  const context = useContext(LocalCopyContext);
  if (!context) throw new Error("useLocalCopy must be used inside LocalCopyProvider");
  return context;
}

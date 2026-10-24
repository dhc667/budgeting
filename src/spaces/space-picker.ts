import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useDeviceKey } from "../instance/device-key";
import { isNonEmpty, type NonEmpty } from "../non-empty";
import { type Space, useSpaces } from "./space-queries";

// Hiding a space the user later leaves can hide every space still there: then all of them show.
export function useShownSpaces(): NonEmpty<Space> | undefined {
  const { data: spaces } = useSpaces();
  const [hidden] = useHiddenSpaces();
  return useMemo(() => {
    const shown = spaces?.filter(({ id }) => !hidden.includes(id));
    return shown && isNonEmpty(shown) ? shown : spaces;
  }, [spaces, hidden]);
}

// The device remembers the spaces it hides rather than those it shows, so a space the user is
// newly added to shows up.
export function useHiddenSpaces(): [string[], (spaceIds: string[]) => void] {
  const storageKey = useDeviceKey("hiddenSpaces");
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(storageKey));
  const hidden = useMemo(() => parseIds(stored), [stored]);
  const setHidden = useCallback(
    (spaceIds: string[]) => {
      localStorage.setItem(storageKey, JSON.stringify(spaceIds));
      listeners.forEach((listener) => listener());
    },
    [storageKey],
  );
  return [hidden, setHidden];
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parseIds(stored: string | null): string[] {
  try {
    const value: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

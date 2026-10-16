import { useCallback } from "react";
import { useDeviceKey } from "../instance/device-key";

export function useLastAccount(): { lastAccountId: string | null; remember: (id: string) => void } {
  const storageKey = useDeviceKey("lastAccount");
  const remember = useCallback(
    (accountId: string) => localStorage.setItem(storageKey, accountId),
    [storageKey],
  );
  return { lastAccountId: localStorage.getItem(storageKey), remember };
}

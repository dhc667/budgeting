import { useCallback, useState } from "react";
import { useDeviceKey } from "../instance/device-key";

export function useSubcategoriesShown(): [boolean, (shown: boolean) => void] {
  const storageKey = useDeviceKey("reportSubcategories");
  const [shown, setShown] = useState(() => localStorage.getItem(storageKey) === "true");
  const show = useCallback(
    (next: boolean) => {
      localStorage.setItem(storageKey, String(next));
      setShown(next);
    },
    [storageKey],
  );
  return [shown, show];
}

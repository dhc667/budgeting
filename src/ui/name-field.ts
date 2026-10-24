import { useState } from "react";
import { sameName } from "../names";
import { isUniqueViolation } from "../supabase/errors";

// A form finds a clash in the local copy as the user types. One the copy didn't know of, such as
// two people taking a name at once, comes back as the instance refusing the save, and shows the
// same way until the name changes.
export function useNameField(initial: string, saveError: Error | null) {
  const [name, setName] = useState(initial);
  const [savedName, setSavedName] = useState<string | null>(null);
  const refused =
    saveError !== null &&
    isUniqueViolation(saveError) &&
    savedName !== null &&
    sameName(savedName, name);
  return { name, setName, refused, saving: setSavedName };
}

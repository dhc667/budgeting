import { useSignedInUser } from "../auth/session";
import { useInstance } from "./instance-context";

// A key for what the device remembers. Two people may share a device, and a device may switch
// instances, so each person on each instance gets their own.
export function useDeviceKey(name: string): string {
  const { instance } = useInstance();
  const user = useSignedInUser();
  return `budgeting.${name} ${instance?.supabaseUrl} ${user.id}`;
}

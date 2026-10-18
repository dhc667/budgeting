import { createContext, useContext } from "react";
import type { AppSupabase } from "../supabase/client";
import type { Instance } from "./connect-link";

export type InstanceContextValue = {
  instance: Instance | null;
  supabase: AppSupabase | null;
  connect: (instance: Instance) => void;
  disconnect: () => void;
};

export const InstanceContext = createContext<InstanceContextValue | null>(null);

export function useInstance(): InstanceContextValue {
  const context = useContext(InstanceContext);
  if (!context) throw new Error("useInstance must be used inside InstanceProvider");
  return context;
}

export function useConnectedInstance(): Instance {
  const { instance } = useInstance();
  if (!instance) throw new Error("useConnectedInstance must be used below InstanceGate");
  return instance;
}

export function useSupabase(): AppSupabase {
  const { supabase } = useInstance();
  if (!supabase) throw new Error("useSupabase must be used below InstanceGate");
  return supabase;
}

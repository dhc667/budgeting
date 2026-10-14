import { useQuery } from "@tanstack/react-query";
import { useInstance, useSupabase } from "../instance/instance-context";

export function useCurrencyCodes() {
  const supabase = useSupabase();
  const { instance } = useInstance();
  return useQuery({
    queryKey: ["currencies", instance?.supabaseUrl],
    staleTime: Number.POSITIVE_INFINITY,
    async queryFn() {
      const { data, error } = await supabase.from("currencies").select("code").order("code");
      if (error) throw error;
      return data.map(({ code }) => code);
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";

export function useCurrencyCodes() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["currencies"],
    staleTime: Number.POSITIVE_INFINITY,
    async queryFn() {
      const { data, error } = await supabase.from("currencies").select("code").order("code");
      if (error) throw error;
      return data.map(({ code }) => code);
    },
  });
}

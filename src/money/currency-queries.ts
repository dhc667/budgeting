import { useQuery } from "@tanstack/react-query";
import type { Currency } from "../format/format";
import { useSupabase } from "../instance/instance-context";

export function useCurrencies() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["currencies"],
    staleTime: Number.POSITIVE_INFINITY,
    async queryFn(): Promise<Currency[]> {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, decimals")
        .order("code");
      if (error) throw error;
      return data;
    },
  });
}

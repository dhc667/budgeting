import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "../instance/instance-context";
import type { LatestRates } from "./convert";

export function useLatestRates() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["latest-rates"],
    async queryFn(): Promise<LatestRates> {
      const { data, error } = await supabase.rpc("latest_exchange_rates");
      if (error) throw error;
      return new Map(data.map((rate) => [rate.currency, rate]));
    },
  });
}

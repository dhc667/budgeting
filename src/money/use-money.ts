import { useFormat } from "../format/use-format";
import { useCurrencies } from "./currency-queries";

export function useMoney() {
  const format = useFormat();
  const { data: currencies = [] } = useCurrencies();
  return (minorUnits: number, code: string): string => {
    const currency = currencies.find((candidate) => candidate.code === code);
    return currency ? format.money(minorUnits, currency) : "";
  };
}

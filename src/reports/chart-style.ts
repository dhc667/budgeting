import type { Currency } from "../format/format";
import { useFormat } from "../format/use-format";

export function useChartMoney(currency: Currency) {
  const format = useFormat();
  return {
    full: (amount: unknown) => format.money(Number(amount), currency),
    compact: (amount: unknown) => format.compactMoney(Number(amount), currency),
  };
}

export const series = {
  income: "var(--chart-income)",
  expense: "var(--chart-expense)",
  line: "var(--chart-line)",
};

export const gridProps = { vertical: false, stroke: "currentColor", strokeOpacity: 0.2 };
export const axisProps = { tick: { fill: "currentColor" }, stroke: "currentColor" };
export const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--chart-surface)",
    color: "var(--chart-text)",
    borderColor: "currentColor",
    borderRadius: 8,
  },
  cursor: { fill: "currentColor", fillOpacity: 0.1 },
};
export const noAnimation = { isAnimationActive: false };

export const chartHeight = { netWorth: 160, incomeExpense: 200 };

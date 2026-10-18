import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

// The colours are variables on the wrapper so one class list switches them all in dark mode.
export function ChartFrame({ height, children }: { height: number; children: ReactElement }) {
  return (
    <div
      className="text-xs text-zinc-500 [--chart-expense:var(--color-red-400)] [--chart-income:var(--color-emerald-500)] [--chart-line:var(--color-emerald-600)] [--chart-surface:var(--color-white)] [--chart-text:var(--color-zinc-900)] dark:text-zinc-400 dark:[--chart-line:var(--color-emerald-400)] dark:[--chart-surface:var(--color-zinc-800)] dark:[--chart-text:var(--color-zinc-100)]"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

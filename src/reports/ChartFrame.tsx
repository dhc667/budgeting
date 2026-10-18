import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

// The colours are variables on the wrapper so one class list switches them all in dark mode. The
// background is the card's. Recharts makes its shapes focusable by click alone, and some browsers
// ring them when clicked; nothing reaches them from the keyboard, so they get no outline.
export function ChartFrame({
  height,
  className = "",
  children,
}: {
  height?: number;
  className?: string;
  children: ReactElement;
}) {
  return (
    <div
      className={`text-xs text-zinc-500 [--chart-background:var(--color-white)] [--chart-expense:var(--color-red-400)] [--chart-income:var(--color-emerald-500)] [--chart-line:var(--color-emerald-600)] [--chart-surface:var(--color-white)] [--chart-text:var(--color-zinc-900)] dark:text-zinc-400 dark:[--chart-background:var(--color-zinc-900)] dark:[--chart-line:var(--color-emerald-400)] dark:[--chart-surface:var(--color-zinc-800)] dark:[--chart-text:var(--color-zinc-100)] [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:overflow-visible ${className}`}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

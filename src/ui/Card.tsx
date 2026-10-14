import type { ReactNode } from "react";

type CardProps = { title: string; action?: ReactNode; className?: string; children: ReactNode };

export function Card({ title, action, className = "", children }: CardProps) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
      {children}
    </p>
  );
}

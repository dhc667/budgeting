import type { ReactNode } from "react";

export function CenteredMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 text-zinc-600 dark:text-zinc-400">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
      {children}
    </main>
  );
}

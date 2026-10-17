import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

// The lists too long to show in full on a screen, each a screen of its own.
export function ScreenLinks({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {children}
    </nav>
  );
}

export function ScreenLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      {label}
      <ChevronRight aria-hidden className="size-5 text-zinc-400" />
    </Link>
  );
}

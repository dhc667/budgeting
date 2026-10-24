import type { ReactNode } from "react";

export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

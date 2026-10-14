import type { ReactNode } from "react";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-12" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

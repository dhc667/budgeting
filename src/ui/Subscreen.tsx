import type { ReactNode } from "react";
import { BackLink } from "./BackLink";

type SubscreenProps = { back: { to: string; place: string }; title: string; children: ReactNode };

export function Subscreen({ back, title, children }: SubscreenProps) {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={back.to} place={back.place} />
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      {children}
    </div>
  );
}

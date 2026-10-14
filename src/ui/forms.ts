import type { FormEvent } from "react";

// Not a form action: React resets the form after an action, which would wipe the fields on a failed sign-in.
export function submitWith(handle: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handle(new FormData(event.currentTarget));
  };
}

export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

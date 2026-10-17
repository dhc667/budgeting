import type { FormEvent } from "react";

// Not a form action: React resets the form after an action, which would wipe the fields on a failed sign-in.
export function submitWith(handle: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handle(new FormData(event.currentTarget));
  };
}

// For a form with more than one way to send it: `button` is the value of the one that did.
export function submitWithButton(handle: (form: FormData, button: string | null) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { nativeEvent } = event;
    const submitter = nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
    handle(
      new FormData(event.currentTarget),
      submitter instanceof HTMLButtonElement ? submitter.value : null,
    );
  };
}

export function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function choiceField<T extends string>(
  form: FormData,
  name: string,
  choices: readonly T[],
): T | null {
  const value = textField(form, name);
  return choices.find((choice) => choice === value) ?? null;
}

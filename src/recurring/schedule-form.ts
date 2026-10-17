import { choiceField, textField } from "../ui/forms";
import { type Schedule, units } from "./schedule";

export function scheduleFrom(form: FormData, startsOn: string): Schedule {
  const ending = choiceField(form, "ending", endings) ?? "never";
  return {
    startsOn,
    every: Number(textField(form, "every")),
    unit: choiceField(form, "unit", units) ?? "month",
    endsOn: ending === "on" ? textField(form, "endsOn") : null,
    times: ending === "after" ? Number(textField(form, "times")) : null,
  };
}

export function endingOf(schedule: Schedule | null): Ending {
  if (schedule?.endsOn) return "on";
  if (schedule?.times) return "after";
  return "never";
}

export const endings = ["never", "on", "after"] as const;

export type Ending = (typeof endings)[number];

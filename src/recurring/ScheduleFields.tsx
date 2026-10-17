import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../ui/Field";
import { SelectField } from "../ui/SelectField";
import { type Schedule, units } from "./schedule";
import { unitName } from "./recurring";
import { type Ending, endingOf, endings } from "./schedule-form";

type ScheduleFieldsProps = { initial: Schedule | null; startsOn: string };

// Read back with `scheduleFrom` once the form is sent.
export function ScheduleFields({ initial, startsOn }: ScheduleFieldsProps) {
  const { t } = useTranslation();
  const [ending, setEnding] = useState<Ending>(endingOf(initial));
  return (
    <fieldset className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("recurring.form.every")}
          name="every"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          defaultValue={initial?.every ?? 1}
        />
        <SelectField
          label={t("recurring.form.unit")}
          name="unit"
          defaultValue={initial?.unit ?? "month"}
        >
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unitName(unit, t)}
            </option>
          ))}
        </SelectField>
      </div>
      <div role="radiogroup" aria-label={t("recurring.form.ends")} className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("recurring.form.ends")}</span>
        {endings.map((choice) => (
          <label key={choice} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="ending"
              value={choice}
              checked={ending === choice}
              onChange={() => setEnding(choice)}
              className="size-5"
            />
            {endingName(choice, t)}
          </label>
        ))}
      </div>
      {ending === "on" && (
        <Field
          label={t("recurring.form.endsOn")}
          name="endsOn"
          type="date"
          min={startsOn}
          required
          defaultValue={initial?.endsOn ?? ""}
        />
      )}
      {ending === "after" && (
        <Field
          label={t("recurring.form.times")}
          name="times"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          defaultValue={initial?.times ?? ""}
        />
      )}
    </fieldset>
  );
}

function endingName(ending: Ending, t: TFunction): string {
  switch (ending) {
    case "never":
      return t("recurring.form.endsNever");
    case "on":
      return t("recurring.form.endsOnDate");
    case "after":
      return t("recurring.form.endsAfter");
  }
}

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Description,
  Field,
  Label,
} from "@headlessui/react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { inputClass } from "./Field";

type PickerProps = {
  label: string;
  hint?: string;
  groups: PickerGroup[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder: string;
  // Submits the chosen id with the form under this name.
  name?: string;
  disabled?: boolean;
  // Offers the typed text as a new option when no option is named exactly that.
  create?: { label: (name: string) => string; onCreate: (name: string) => void };
};

// Typing narrows the options, but only an option can be chosen: leaving the field with text that
// names none puts the chosen option back.
export function Picker({
  label,
  hint,
  groups,
  value,
  onChange,
  placeholder,
  name,
  disabled,
  create,
}: PickerProps) {
  const [query, setQuery] = useState("");
  const options = groups.flatMap((group) => group.options);
  const selected = options.find((option) => option.id === value);
  const wanted = searchable(query.trim());
  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) =>
        searchable(option.search ?? option.label).includes(wanted),
      ),
    }))
    .filter((group) => group.options.length > 0);
  const newName = query.trim();
  const offersNew =
    create !== undefined &&
    newName !== "" &&
    !options.some((option) => searchable(option.label) === searchable(newName));

  const choose = (id: string | null) => {
    if (id === createValue) create?.onCreate(newName);
    else if (id !== null) onChange(id);
  };

  return (
    <Field disabled={disabled} className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Combobox immediate value={value} onChange={choose} onClose={() => setQuery("")} name={name}>
        <div className="relative">
          {selected?.icon && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              {selected.icon}
            </span>
          )}
          <ComboboxInput
            className={`${inputClass} w-full pr-10 ${selected?.icon ? "pl-12" : ""}`}
            displayValue={() => selected?.label ?? ""}
            onChange={(event) => setQuery(event.target.value)}
            // So that typing replaces the chosen option's name rather than adding to it.
            onFocus={(event) => event.target.select()}
            placeholder={placeholder}
            autoComplete="off"
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-3">
            <ChevronDown className="size-4 text-zinc-500" />
          </ComboboxButton>
          {/* Not modal: the rest of the form, the label included, stays reachable while it's open. */}
          <ComboboxOptions
            modal={false}
            className="absolute top-full z-20 mt-1 flex max-h-80 w-full flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg empty:invisible dark:border-zinc-800 dark:bg-zinc-900"
          >
            {shown.map(({ heading, options }, index) => (
              <div key={heading ?? index} className="flex flex-col">
                {heading !== null && (
                  <div className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    {heading}
                  </div>
                )}
                {options.map((option) => (
                  <ComboboxOption
                    key={option.id}
                    value={option.id}
                    aria-label={option.label}
                    className={`${optionClass} ${option.indent ? "pl-8" : ""}`}
                  >
                    {option.content}
                    {option.id === value && <Check className="size-4 shrink-0 text-emerald-600" />}
                  </ComboboxOption>
                ))}
              </div>
            ))}
            {offersNew && (
              <ComboboxOption
                value={createValue}
                aria-label={create.label(newName)}
                className={optionClass}
              >
                <Plus className="size-4 shrink-0 text-emerald-600" />
                <span className="flex-1 truncate">{create.label(newName)}</span>
              </ComboboxOption>
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
      {hint && <Description className="text-xs text-zinc-500">{hint}</Description>}
    </Field>
  );
}

// Accents and case don't keep "cafe" from finding "Café".
function searchable(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Not an id: ids are UUIDs and currency codes.
const createValue = "create";

const optionClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 data-focus:bg-zinc-100 dark:data-focus:bg-zinc-800";

export type PickerGroup = { heading: string | null; options: PickerOption[] };

// `label` names the option to assistive technology and fills the field once chosen, so it can say
// more than `content` shows. `search` is what typing matches, the label unless given. `icon` shows
// in the field beside the chosen option's label.
export type PickerOption = {
  id: string;
  label: string;
  content: ReactNode;
  icon?: ReactNode;
  search?: string;
  indent?: boolean;
};

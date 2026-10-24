import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { inputClass } from "./Field";

type PasswordFieldProps = Omit<ComponentProps<"input">, "type"> & { label: string };

export function PasswordField({ label, ...props }: PasswordFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative flex">
        <input
          id={id}
          type={shown ? "text" : "password"}
          className={`${inputClass} flex-1 pr-11`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <Icon className="size-5" />
        </button>
      </div>
    </div>
  );
}

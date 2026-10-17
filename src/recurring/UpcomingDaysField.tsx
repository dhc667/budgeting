import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useProfile, useUpdateProfile } from "../profile/profile-queries";
import { ErrorText } from "../ui/ErrorText";
import { SelectField } from "../ui/SelectField";

// Each user's own: how far ahead of today the dashboard's Upcoming card looks.
export function UpcomingDaysField() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  if (!profile) return null;
  const offered = choices.includes(profile.upcoming_days)
    ? choices
    : [...choices, profile.upcoming_days].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-1">
      <SelectField
        label={t("recurring.upcomingDays.label")}
        value={profile.upcoming_days}
        disabled={update.isPending}
        onChange={(event) => update.mutate({ upcoming_days: Number(event.target.value) })}
      >
        {offered.map((days) => (
          <option key={days} value={days}>
            {choiceName(days, t)}
          </option>
        ))}
      </SelectField>
      {update.error && <ErrorText>{t("recurring.errors.saveFailed")}</ErrorText>}
    </div>
  );
}

function choiceName(days: number, t: TFunction): string {
  return days === 0
    ? t("recurring.upcomingDays.dueOnly")
    : t("recurring.upcomingDays.within", { count: days });
}

const choices = [0, 3, 7, 14, 30];

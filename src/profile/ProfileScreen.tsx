import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { authErrorMessage } from "../auth/auth-errors";
import { useSignedInUser } from "../auth/session";
import { dateFormats, formatDate, formatAmount, numberFormats } from "../format/format";
import { deviceLanguage, languageNames, languages } from "../i18n/languages";
import { useInstance, useSupabase } from "../instance/instance-context";
import { CurrencySelect } from "../money/CurrencySelect";
import { useLatestRates } from "../rates/rate-queries";
import { useSignOut } from "../sync/sign-out";
import { isCheckViolation, refusalReason } from "../supabase/errors";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { choiceField, submitWith, textField } from "../ui/forms";
import { SelectField } from "../ui/SelectField";
import { type Profile, useProfile, useUpdateProfile } from "./profile-queries";

export function ProfileScreen() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  if (!profile) return null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
      <AboutForm profile={profile} />
      <FormatsForm profile={profile} />
      <SpacesCard />
      <PasswordForm />
      <DeviceCard />
    </div>
  );
}

function AboutForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const updateProfile = useUpdateProfile();
  const { data: rates } = useLatestRates();
  const offered = new Set(["USD", profile.display_currency]);
  rates?.forEach(({ currency, stale }) => !stale && offered.add(currency));
  const save = (form: FormData) =>
    updateProfile.mutate({
      display_name: textField(form, "displayName").trim(),
      display_currency: textField(form, "displayCurrency"),
    });

  return (
    <Card title={t("profile.about.title")}>
      <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
        <Field label={t("auth.email")} value={useSignedInUser().email ?? ""} disabled readOnly />
        <Field
          label={t("profile.about.name")}
          name="displayName"
          defaultValue={profile.display_name}
          required
        />
        <CurrencySelect
          label={t("profile.about.displayCurrency")}
          hint={t("profile.about.displayCurrencyHint")}
          name="displayCurrency"
          only={offered}
          defaultValue={profile.display_currency}
        />
        <SaveControls mutation={updateProfile} />
      </form>
    </Card>
  );
}

function FormatsForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const updateProfile = useUpdateProfile();
  const save = (form: FormData) =>
    updateProfile.mutate({
      language: choiceField(form, "language", languages),
      number_format: choiceField(form, "numberFormat", numberFormats),
      date_format: choiceField(form, "dateFormat", dateFormats),
    });
  const automatic = (example: string) => t("profile.formats.automatic", { example });
  const sample = { minorUnits: 123456, decimals: 2 };
  const today = new Date();

  return (
    <Card title={t("profile.formats.title")}>
      <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">{t("profile.formats.automaticHint")}</p>
        <SelectField
          label={t("profile.formats.language")}
          name="language"
          defaultValue={profile.language ?? ""}
        >
          <option value="">{automatic(languageNames[deviceLanguage()])}</option>
          {languages.map((language) => (
            <option key={language} value={language}>
              {languageNames[language]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("profile.formats.numbers")}
          name="numberFormat"
          defaultValue={profile.number_format ?? ""}
        >
          <option value="">
            {automatic(formatAmount(sample.minorUnits, sample.decimals, null))}
          </option>
          {numberFormats.map((format) => (
            <option key={format} value={format}>
              {formatAmount(sample.minorUnits, sample.decimals, format)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("profile.formats.dates")}
          name="dateFormat"
          defaultValue={profile.date_format ?? ""}
        >
          <option value="">{automatic(formatDate(today, null))}</option>
          {dateFormats.map((format) => (
            <option key={format} value={format}>
              {formatDate(today, format)}
            </option>
          ))}
        </SelectField>
        <SaveControls mutation={updateProfile} />
      </form>
    </Card>
  );
}

function SaveControls({ mutation }: { mutation: ReturnType<typeof useUpdateProfile> }) {
  const { t } = useTranslation();
  return (
    <>
      {mutation.error && <ErrorText>{saveErrorMessage(mutation.error, t)}</ErrorText>}
      {mutation.isSuccess && <p className="text-sm text-emerald-600">{t("profile.saved")}</p>}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {t("profile.save")}
      </Button>
    </>
  );
}

function saveErrorMessage(error: Error, t: TFunction): string {
  if (isCheckViolation(error)) return t("profile.errors.nameBlank");
  if (refusalReason(error) === "no_recent_rate") return t("profile.errors.noRecentRate");
  return t("profile.errors.saveFailed");
}

function SpacesCard() {
  const { t } = useTranslation();
  return (
    <Card title={t("spaces.title")}>
      <p className="text-sm text-zinc-500">{t("profile.spaces.explained")}</p>
      <Link to="/spaces" className="self-start font-medium text-emerald-700 dark:text-emerald-400">
        {t("profile.spaces.manage")}
      </Link>
    </Card>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const supabase = useSupabase();
  const changePassword = useMutation({
    async mutationFn(form: FormData) {
      const password = textField(form, "password");
      if (password !== textField(form, "confirmation"))
        throw new Error(t("profile.password.mismatch"));
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });

  return (
    <Card title={t("profile.password.title")}>
      <form onSubmit={submitWith(changePassword.mutate)} className="flex flex-col gap-4">
        <Field
          label={t("profile.password.new")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label={t("profile.password.repeat")}
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
        {changePassword.error && <ErrorText>{authErrorMessage(changePassword.error, t)}</ErrorText>}
        {changePassword.isSuccess && (
          <p className="text-sm text-emerald-600">{t("profile.password.changed")}</p>
        )}
        <Button type="submit" disabled={changePassword.isPending} className="self-start">
          {t("profile.password.submit")}
        </Button>
      </form>
    </Card>
  );
}

function DeviceCard() {
  const { t } = useTranslation();
  const { instance, disconnect } = useInstance();
  const signOut = useSignOut();
  const signOutAndDisconnect = async () => {
    await signOut();
    disconnect();
  };

  return (
    <Card title={t("profile.device.title")}>
      <p className="text-sm text-zinc-500">
        {instance && t("instance.connectedTo", { host: new URL(instance.supabaseUrl).host })}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void signOut()}>
          {t("auth.signOut")}
        </Button>
        <Button variant="secondary" onClick={() => void signOutAndDisconnect()}>
          {t("profile.device.signOutAndDisconnect")}
        </Button>
      </div>
    </Card>
  );
}

import { useMutation } from "@tanstack/react-query";
import { useSignedInUser } from "../auth/session";
import { useInstance, useSupabase } from "../instance/instance-context";
import { useCurrencyCodes } from "../money/currency-queries";
import { currencyName } from "../money/format";
import { signOutHere } from "../supabase/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorText } from "../ui/ErrorText";
import { Field, inputClass } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";
import { type Profile, useProfile, useUpdateProfile } from "./profile-queries";

export function ProfileScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ProfileForm profile={profile} />
      <PasswordForm />
      <DeviceCard />
    </div>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useUpdateProfile();
  const save = (form: FormData) =>
    updateProfile.mutate({
      display_name: textField(form, "displayName").trim(),
      display_currency: textField(form, "displayCurrency"),
    });

  return (
    <Card title="About you">
      <form onSubmit={submitWith(save)} className="flex flex-col gap-4">
        <Field label="Email" value={useSignedInUser().email ?? ""} disabled readOnly />
        <Field label="Name" name="displayName" defaultValue={profile.display_name} required />
        <CurrencySelect defaultValue={profile.display_currency} />
        {updateProfile.error && <ErrorText>{updateProfile.error.message}</ErrorText>}
        {updateProfile.isSuccess && <p className="text-sm text-emerald-600">Saved.</p>}
        <Button type="submit" disabled={updateProfile.isPending} className="self-start">
          Save
        </Button>
      </form>
    </Card>
  );
}

function CurrencySelect({ defaultValue }: { defaultValue: string }) {
  const { data: codes = [defaultValue] } = useCurrencyCodes();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="displayCurrency" className="text-sm font-medium">
        Display currency
      </label>
      <select
        id="displayCurrency"
        name="displayCurrency"
        defaultValue={defaultValue}
        className={inputClass}
      >
        {codes.map((code) => (
          <option key={code} value={code}>
            {code} · {currencyName(code)}
          </option>
        ))}
      </select>
      <p className="text-xs text-zinc-500">Totals across currencies are shown in this one.</p>
    </div>
  );
}

function PasswordForm() {
  const supabase = useSupabase();
  const changePassword = useMutation({
    async mutationFn(form: FormData) {
      const password = textField(form, "password");
      if (password !== textField(form, "confirmation"))
        throw new Error("The passwords don't match.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
  });

  return (
    <Card title="Password">
      <form onSubmit={submitWith(changePassword.mutate)} className="flex flex-col gap-4">
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label="Repeat new password"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
        {changePassword.error && <ErrorText>{changePassword.error.message}</ErrorText>}
        {changePassword.isSuccess && <p className="text-sm text-emerald-600">Password changed.</p>}
        <Button type="submit" disabled={changePassword.isPending} className="self-start">
          Change password
        </Button>
      </form>
    </Card>
  );
}

function DeviceCard() {
  const supabase = useSupabase();
  const { instance, disconnect } = useInstance();
  const signOutAndDisconnect = async () => {
    await signOutHere(supabase);
    disconnect();
  };

  return (
    <Card title="This device">
      <p className="text-sm text-zinc-500">
        Connected to {instance && new URL(instance.supabaseUrl).host}.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => void signOutHere(supabase)}>
          Sign out
        </Button>
        <Button variant="secondary" onClick={() => void signOutAndDisconnect()}>
          Sign out and disconnect
        </Button>
      </div>
    </Card>
  );
}

import { useMutation } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link, Navigate, useLocation } from "react-router";
import { shownLanguage } from "../i18n/languages";
import { useSupabase } from "../instance/instance-context";
import { useSignOut } from "../sync/sign-out";
import { signUpErrorMessage } from "./auth-errors";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { PasswordField } from "../ui/PasswordField";
import { submitWith, textField } from "../ui/forms";

export function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const supabase = useSupabase();
  const session = useSession();
  const inviteCode = inviteCodeIn(useLocation().state);
  const signUp = useMutation({
    async mutationFn(form: FormData) {
      const password = textField(form, "password");
      if (password !== textField(form, "confirmation")) throw new Error(t("auth.signUp.mismatch"));
      const { error } = await supabase.auth.signUp({
        email: textField(form, "email"),
        password,
        options: {
          data: {
            invite_code: inviteCode,
            display_name: textField(form, "displayName"),
            // Names the private space's starter categories.
            language: shownLanguage(i18n.resolvedLanguage),
          },
        },
      });
      if (error) throw error;
    },
  });

  if (!inviteCode) return <Navigate to={session ? "/" : "/sign-in"} replace />;
  if (session) {
    // A session that appeared after submitting is the account just created.
    if (!signUp.isIdle) return <Navigate to="/" replace />;
    return <AlreadySignedIn email={session.user.email} />;
  }

  return (
    <AuthLayout title={t("auth.signUp.title")}>
      <form onSubmit={submitWith(signUp.mutate)} className="flex flex-col gap-4">
        <Field
          label={t("auth.signUp.name")}
          name="displayName"
          autoComplete="given-name"
          required
        />
        <Field label={t("auth.email")} name="email" type="email" autoComplete="email" required />
        <PasswordField
          label={t("auth.password")}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordField
          label={t("auth.signUp.repeatPassword")}
          name="confirmation"
          autoComplete="new-password"
          required
        />
        {signUp.error && <ErrorText>{signUpErrorMessage(signUp.error, t)}</ErrorText>}
        <Button type="submit" disabled={signUp.isPending}>
          {t("auth.signUp.submit")}
        </Button>
      </form>
      <p className="text-sm text-zinc-500">
        <Trans
          i18nKey="auth.signUp.inviteOnce"
          components={{ signIn: <Link to="/sign-in" className="underline" /> }}
        />
      </p>
    </AuthLayout>
  );
}

function AlreadySignedIn({ email = "" }: { email: string | undefined }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  return (
    <AuthLayout title={t("auth.alreadySignedIn.title")}>
      <p className="text-zinc-600 dark:text-zinc-400">
        {t("auth.alreadySignedIn.body", { email })}
      </p>
      <Button onClick={() => void signOut()}>{t("auth.signOut")}</Button>
      <Link to="/" replace className="text-sm text-zinc-500 underline">
        {t("auth.alreadySignedIn.keepUsing", { email })}
      </Link>
    </AuthLayout>
  );
}

function inviteCodeIn(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("inviteCode" in state)) return undefined;
  return typeof state.inviteCode === "string" ? state.inviteCode : undefined;
}

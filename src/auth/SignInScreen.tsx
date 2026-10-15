import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { useInstance, useSupabase } from "../instance/instance-context";
import { authErrorMessage } from "./auth-errors";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";

export function SignInScreen() {
  const { t } = useTranslation();
  const supabase = useSupabase();
  const session = useSession();
  const { instance, disconnect } = useInstance();
  const signIn = useMutation({
    async mutationFn(form: FormData) {
      const { error } = await supabase.auth.signInWithPassword({
        email: textField(form, "email"),
        password: textField(form, "password"),
      });
      if (error) throw error;
    },
  });

  if (session) return <Navigate to="/" replace />;

  return (
    <AuthLayout title={t("auth.signIn.title")}>
      <form onSubmit={submitWith(signIn.mutate)} className="flex flex-col gap-4">
        <Field label={t("auth.email")} name="email" type="email" autoComplete="email" required />
        <Field
          label={t("auth.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {signIn.error && <ErrorText>{authErrorMessage(signIn.error, t)}</ErrorText>}
        <Button type="submit" disabled={signIn.isPending}>
          {t("auth.signIn.submit")}
        </Button>
      </form>
      <p className="text-sm text-zinc-500">{t("auth.signIn.forgotPassword")}</p>
      <p className="text-xs text-zinc-500">
        {instance && t("instance.connectedTo", { host: new URL(instance.supabaseUrl).host })}{" "}
        <button type="button" onClick={disconnect} className="underline">
          {t("auth.disconnect")}
        </button>
      </p>
    </AuthLayout>
  );
}

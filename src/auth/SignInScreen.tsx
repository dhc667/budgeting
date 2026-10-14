import { useMutation } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useInstance, useSupabase } from "../instance/instance-context";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";

export function SignInScreen() {
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
    <AuthLayout title="Sign in">
      <form onSubmit={submitWith(signIn.mutate)} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {signIn.error && <ErrorText>{signIn.error.message}</ErrorText>}
        <Button type="submit" disabled={signIn.isPending}>
          Sign in
        </Button>
      </form>
      <p className="text-sm text-zinc-500">
        Forgot your password? Ask the person who runs your family's budget to reset it.
      </p>
      <p className="text-xs text-zinc-500">
        Connected to {instance && new URL(instance.supabaseUrl).host}.{" "}
        <button type="button" onClick={disconnect} className="underline">
          Disconnect
        </button>
      </p>
    </AuthLayout>
  );
}

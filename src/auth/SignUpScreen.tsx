import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useLocation } from "react-router";
import { useSupabase } from "../instance/instance-context";
import { signOutHere } from "../supabase/client";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Field";
import { submitWith, textField } from "../ui/forms";

export function SignUpScreen() {
  const supabase = useSupabase();
  const session = useSession();
  const inviteCode = inviteCodeIn(useLocation().state);
  const signUp = useMutation({
    async mutationFn(form: FormData) {
      const { error } = await supabase.auth.signUp({
        email: textField(form, "email"),
        password: textField(form, "password"),
        options: {
          data: { invite_code: inviteCode, display_name: textField(form, "displayName") },
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
    <AuthLayout title="Create your account">
      <form onSubmit={submitWith(signUp.mutate)} className="flex flex-col gap-4">
        <Field label="Your name" name="displayName" autoComplete="given-name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {signUp.error && <ErrorText>{signUp.error.message}</ErrorText>}
        <Button type="submit" disabled={signUp.isPending}>
          Create account
        </Button>
      </form>
      <p className="text-sm text-zinc-500">
        Your invite works once. If you already have an account,{" "}
        <Link to="/sign-in" className="underline">
          sign in
        </Link>{" "}
        instead.
      </p>
    </AuthLayout>
  );
}

function AlreadySignedIn({ email }: { email: string | undefined }) {
  const supabase = useSupabase();
  return (
    <AuthLayout title="You're already signed in">
      <p className="text-zinc-600 dark:text-zinc-400">
        This device is signed in as {email}. To create a new account with this invite, sign out
        first.
      </p>
      <Button onClick={() => void signOutHere(supabase)}>Sign out</Button>
      <Link to="/" replace className="text-sm text-zinc-500 underline">
        Keep using the app as {email}
      </Link>
    </AuthLayout>
  );
}

function inviteCodeIn(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("inviteCode" in state)) return undefined;
  return typeof state.inviteCode === "string" ? state.inviteCode : undefined;
}

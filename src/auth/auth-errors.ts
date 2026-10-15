import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { TFunction } from "i18next";

export function signUpErrorMessage(error: Error, t: TFunction): string {
  // Hooks can't set an error code, so the signup hook rejecting the invite code shows only as a 403.
  if (isAuthApiError(error) && error.status === 403) return t("auth.errors.inviteRejected");
  return authErrorMessage(error, t);
}

// Errors this app can explain are translated; anything else shows Supabase's own English message.
export function authErrorMessage(error: Error, t: TFunction): string {
  if (isAuthRetryableFetchError(error)) return t("auth.errors.unreachable");
  if (!isAuthApiError(error)) return error.message;
  switch (error.code) {
    case "invalid_credentials":
      return t("auth.errors.invalidCredentials");
    case "email_exists":
    case "user_already_exists":
      return t("auth.errors.emailTaken");
    case "weak_password":
      return t("auth.errors.weakPassword");
    case "same_password":
      return t("auth.errors.samePassword");
    default:
      return error.message;
  }
}

export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
}

export function isUniqueViolation(error: Error): boolean {
  return "code" in error && error.code === "23505";
}

// Postgres names the constraint only in the message.
export function violatedConstraint(error: Error): string | null {
  if (!isCheckViolation(error) && !isUniqueViolation(error)) return null;
  return /constraint "([^"]+)"/.exec(error.message)?.[1] ?? null;
}

// What a database function reports when it refuses a request.
export function isRaisedException(error: Error): boolean {
  return "code" in error && error.code === "P0001";
}

// The functions whose refusals the app explains name the reason in the error's detail.
export function refusalReason(error: Error): string | null {
  if (!isRaisedException(error) || !("details" in error)) return null;
  return typeof error.details === "string" ? error.details : null;
}

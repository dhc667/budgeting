export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
}

// What a database function reports when it refuses a request.
export function isRaisedException(error: Error): boolean {
  return "code" in error && error.code === "P0001";
}

// Why a database function refused, for the refusals that say so in their detail.
export function refusalReason(error: Error): string | null {
  if (!isRaisedException(error) || !("details" in error)) return null;
  return typeof error.details === "string" ? error.details : null;
}

// What `.single()` reports when no row matched.
export function isNoRows(error: Error): boolean {
  return "code" in error && error.code === "PGRST116";
}

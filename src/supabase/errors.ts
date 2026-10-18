export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
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

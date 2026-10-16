export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
}

// What a database function reports when it refuses a request.
export function isRaisedException(error: Error): boolean {
  return "code" in error && error.code === "P0001";
}

// What `.single()` reports when no row matched.
export function isNoRows(error: Error): boolean {
  return "code" in error && error.code === "PGRST116";
}

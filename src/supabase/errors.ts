export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
}

// What `.single()` reports when no row matched.
export function isNoRows(error: Error): boolean {
  return "code" in error && error.code === "PGRST116";
}

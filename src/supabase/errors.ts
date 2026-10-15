export function isCheckViolation(error: Error): boolean {
  return "code" in error && error.code === "23514";
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// supabase-js hands back its errors as plain objects, not Error instances.
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

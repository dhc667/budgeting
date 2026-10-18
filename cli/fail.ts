export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

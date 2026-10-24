// Shared with the app CLI, which runs under Node's type stripping: import only with extensions.

// Names compare as the database's unique indexes compare them (nameKey in db/schema.ts): case and
// runs of spaces don't count, accents do.
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

export function findNamed<Named extends { name: string }>(
  candidates: Named[],
  name: string,
): Named | undefined {
  return candidates.find((candidate) => sameName(candidate.name, name));
}

export function nameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

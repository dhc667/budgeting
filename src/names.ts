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
  return name
    .replace(new RegExp(`${nameSpaces}+`, "g"), " ")
    .trim()
    .toLowerCase();
}

// What JavaScript's \s matches, spelled out: Postgres's [[:space:]] depends on the instance's
// locale, so the unique indexes use this too.
export const nameSpaces = String.raw`[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]`;

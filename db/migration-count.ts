import { readdirSync, readFileSync } from "node:fs";

const migrationsFolder = new URL("migrations/", import.meta.url);

// The migrator runs the journal's entries, not the folder's files, and skips any entry dated before
// the last one a database applied. A journal out of step with the files, or out of order, would
// leave databases behind the app for good, so this refuses to count one.
export function migrationCount(folder: URL = migrationsFolder): number {
  const entries = readJournal(folder);
  assertInOrder(entries);
  assertMatchesFiles(entries, folder);
  return entries.length;
}

type JournalEntry = { tag: string; when: number };

function readJournal(folder: URL): JournalEntry[] {
  const journal: unknown = JSON.parse(readFileSync(new URL("meta/_journal.json", folder), "utf8"));
  if (
    typeof journal !== "object" ||
    journal === null ||
    !("entries" in journal) ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error("The migrations journal has no entries list.");
  }
  return journal.entries.map(parseEntry);
}

function parseEntry(value: unknown): JournalEntry {
  if (typeof value === "object" && value !== null && "tag" in value && "when" in value) {
    const { tag, when } = value;
    if (typeof tag === "string" && typeof when === "number") return { tag, when };
  }
  throw new Error(`Malformed migrations journal entry: ${JSON.stringify(value)}`);
}

function assertInOrder(entries: JournalEntry[]) {
  entries.forEach((entry, i) => {
    const previous = entries[i - 1];
    if (previous && entry.when <= previous.when) {
      throw new Error(
        `Migration ${entry.tag} is dated before ${previous.tag}, so databases that already applied ` +
          `${previous.tag} would skip it. Regenerate it so it comes last.`,
      );
    }
  });
}

function assertMatchesFiles(entries: JournalEntry[], folder: URL) {
  const files = new Set(
    readdirSync(folder)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, -".sql".length)),
  );
  const tags = new Set(entries.map((entry) => entry.tag));
  const notInJournal = [...files].filter((file) => !tags.has(file));
  const missingFiles = [...tags].filter((tag) => !files.has(tag));
  if (notInJournal.length > 0 || missingFiles.length > 0) {
    throw new Error(
      `The migrations journal and folder disagree. Not in the journal: ${notInJournal.join(", ") || "none"}. ` +
        `Missing files: ${missingFiles.join(", ") || "none"}.`,
    );
  }
}

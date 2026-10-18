// Shared with the instance CLI, which runs under Node's type stripping: keep this file free of imports.

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

// Must match the hashing in the signup hook and trigger (db/migrations/0006_invite_signup.sql).
export async function hashInviteCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

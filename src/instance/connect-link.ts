// Shared with the owner's CLI, which runs under Node's type stripping: keep this file free of imports.

export type Instance = {
  supabaseUrl: string;
  publishableKey: string;
};

export type ConnectRequest = {
  instance: Instance;
  inviteCode: string | null;
};

export const connectPath = "/connect";

// The parameters ride in the hash fragment so they never reach GitHub Pages' server logs.
export function buildConnectLink(appUrl: string, { instance, inviteCode }: ConnectRequest): string {
  const params = new URLSearchParams({ url: instance.supabaseUrl, key: instance.publishableKey });
  if (inviteCode) params.set("code", inviteCode);

  const url = new URL(appUrl);
  url.hash = `${connectPath}?${params}`;
  return url.toString();
}

export function parseConnectParams(params: URLSearchParams): ConnectRequest | null {
  const instance = parseInstance({
    supabaseUrl: params.get("url"),
    publishableKey: params.get("key"),
  });
  return instance && { instance, inviteCode: params.get("code") || null };
}

export function parseInstance(value: unknown): Instance | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("supabaseUrl" in value) || !("publishableKey" in value)) return null;
  const { supabaseUrl, publishableKey } = value;
  if (typeof supabaseUrl !== "string" || !isSupabaseUrl(supabaseUrl)) return null;
  if (typeof publishableKey !== "string" || publishableKey === "") return null;
  return { supabaseUrl, publishableKey };
}

// Plain http only for a Supabase running on this machine; elsewhere it would send passwords in the clear.
function isSupabaseUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || (protocol === "http:" && loopbackHosts.has(hostname));
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

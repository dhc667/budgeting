import type { Json } from "./database.types";

export function memberOf(value: Json | null | undefined, key: string): Json | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value[key];
}

import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { fail } from "../fail.ts";

export type Commands = Record<string, (argv: string[]) => Promise<void>>;

export function parseCommand<const T extends ParseArgsOptionsConfig>(argv: string[], options: T) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: { ...options, env: { type: "string", default: ".env.instance" } },
  });
}

export function onlyId(positionals: string[], usage: string): string {
  const [id, ...extra] = positionals;
  if (!id || extra.length > 0) fail(`Usage: pnpm app ${usage}`);
  return id;
}

export function noPositionals(positionals: string[], usage: string) {
  if (positionals.length > 0) fail(`Usage: pnpm app ${usage}`);
}

export function required<T>(value: T | undefined, flag: string): T {
  if (value === undefined) fail(`${flag} is required.`);
  return value;
}

export function minorUnits(text: string, flag: string): number {
  const amount = integer(text, flag);
  if (amount <= 0) fail(`${flag} must be above zero.`);
  return amount;
}

// Amounts are integers in each currency's minor units (ADR 0010): 1250 is 12.50 USD.
export function integer(text: string, flag: string): number {
  if (!/^-?\d+$/.test(text)) fail(`${flag} must be a whole number of minor units, like 1250.`);
  return Number(text);
}

export function day(text: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail(`${flag} must be a date like 2026-10-18.`);
  }
  return text;
}

// Ids go into PostgREST filter strings, where anything else could add a condition of its own.
export function uuid(text: string, flag: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    fail(`${flag} must be an id, like 0b6f9a0e-6c1d-4f7e-9a51-2f3c8d1e4b7a.`);
  }
  return text;
}

export function choice<T extends string>(text: string, choices: readonly T[], flag: string): T {
  const chosen = choices.find((c) => c === text);
  if (!chosen) fail(`${flag} must be one of: ${choices.join(", ")}.`);
  return chosen;
}

export async function dataOf<Response extends { data: unknown; error: Error | null }>(
  query: PromiseLike<Response>,
): Promise<Extract<Response, { error: null }>["data"]> {
  const response = await query;
  if (response.error) throw response.error;
  return response.data;
}

export function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

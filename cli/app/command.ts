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

export function positiveWhole(text: string, flag: string): number {
  if (!/^\d+$/.test(text) || Number(text) === 0) {
    fail(`${flag} must be a whole number above zero, like 50.`);
  }
  return Number(text);
}

export function day(text: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail(`${flag} must be a date like 2026-10-18.`);
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

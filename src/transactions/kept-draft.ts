import { useCallback, useState } from "react";
import * as z from "zod/mini";
import { useDeviceKey } from "../instance/device-key";
import { Constants } from "../supabase/database.types";
import type { TransactionDraft } from "./transaction-writes";

// What the user was typing into a new transaction they left unsaved, one for each way into the form.
export function useKeptDraft(way: string) {
  const storageKey = useDeviceKey(`newTransaction${way}`);
  const [kept] = useState(() => parseDraft(localStorage.getItem(storageKey)));
  const keep = useCallback(
    (draft: TransactionDraft) => {
      if (anythingTyped(draft)) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    },
    [storageKey],
  );
  const forget = useCallback(() => localStorage.removeItem(storageKey), [storageKey]);
  return { kept, keep, forget };
}

function anythingTyped({ title, note, amount }: TransactionDraft): boolean {
  return title.trim() !== "" || note.trim() !== "" || amount > 0;
}

function parseDraft(stored: string | null): TransactionDraft | null {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(stored ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const draftSchema = z.object({
  type: z.enum(Constants.public.Enums.transaction_type),
  date: z.string(),
  title: z.string(),
  note: z.string(),
  accountId: z.string(),
  amount: z.number(),
  categoryId: z.nullable(z.string()),
  toAccountId: z.nullable(z.string()),
  toAmount: z.nullable(z.number()),
  counterpartyId: z.nullable(z.string()),
  debtCurrency: z.nullable(z.string()),
  debtAmount: z.nullable(z.number()),
});

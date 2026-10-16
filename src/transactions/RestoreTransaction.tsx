import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { refusalReason } from "../supabase/errors";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { useRestoreTransaction } from "./transaction-queries";

export function RestoreTransaction({ transactionId }: { transactionId: string }) {
  const { t } = useTranslation();
  const restoreTransaction = useRestoreTransaction(transactionId);
  return (
    <div className="mt-1 flex flex-col gap-1">
      <Button
        variant="secondary"
        className="self-start"
        disabled={restoreTransaction.isPending}
        onClick={() => restoreTransaction.mutate()}
      >
        {t("transactions.restore.submit")}
      </Button>
      {restoreTransaction.error && (
        <ErrorText>{restoreErrorMessage(restoreTransaction.error, t)}</ErrorText>
      )}
    </div>
  );
}

function restoreErrorMessage(error: Error, t: TFunction): string {
  const reason = refusalReason(error);
  if (reason === null) return t("transactions.restore.failed");
  switch (restoreRefusals.find((refusal) => refusal === reason)) {
    case "exists":
      return t("transactions.restore.exists");
    case "other_space":
      return t("transactions.restore.otherSpace");
    case "account_deleted":
      return t("transactions.restore.accountDeleted");
    case "currency_changed":
      return t("transactions.restore.currencyChanged");
    case "category_deleted":
      return t("transactions.restore.categoryDeleted");
    case undefined:
      return t("transactions.restore.refused");
  }
}

// The reasons restore_transaction gives in its errors' detail.
const restoreRefusals = [
  "exists",
  "other_space",
  "account_deleted",
  "currency_changed",
  "category_deleted",
] as const;

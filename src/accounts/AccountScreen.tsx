import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { localToday } from "../format/days";
import { useMoney } from "../money/use-money";
import { afterSuccess } from "../query-client";
import { spaceName } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import {
  type Account,
  useArchiveAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "./account-queries";
import { AccountForm } from "./AccountForm";
import { AccountNotFound } from "./AccountSubscreen";
import { useRoutedAccount } from "./routed-account";
import { ColorDot } from "../colors/ColorDot";

export function AccountScreen() {
  const { t } = useTranslation();
  const money = useMoney();
  const account = useRoutedAccount();
  const { data: spaces = [] } = useSpaces();
  if (account === undefined) return null;
  if (account === null) return <AccountNotFound />;
  const space = spaces.find(({ id }) => id === account.space_id);

  // Keyed so that another account's screen starts with fresh forms rather than this one's.
  return (
    <div key={account.id} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/" place={t("nav.home")} />
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <ColorDot color={account.color} />
          {account.name}
        </h1>
        <p className="text-sm text-zinc-500">
          {space && spaceName(space, t)}
          {account.archived && ` · ${t("accounts.archivedBadge")}`}
        </p>
      </header>
      <Card title={t("accounts.balance")}>
        <p className="text-3xl font-semibold tabular-nums">
          {money(account.balance, account.currency)}
        </p>
      </Card>
      <nav
        aria-label={account.name}
        className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <ScreenLink to={`/accounts/${account.id}/transactions`} label={t("transactions.title")} />
        <ScreenLink to={`/accounts/${account.id}/history`} label={t("accounts.history")} />
      </nav>
      <EditCard account={account} />
      <ArchiveCard account={account} />
      <DeleteCard account={account} />
    </div>
  );
}

function ScreenLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      {label}
      <ChevronRight aria-hidden className="size-5 text-zinc-400" />
    </Link>
  );
}

function EditCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const updateAccount = useUpdateAccount(account.id);
  return (
    <Card title={t("accounts.details")}>
      <AccountForm
        initial={{
          name: account.name,
          currency: account.currency,
          color: account.color,
          openingAmount: account.opening_balance,
          openingDate: account.opening_date ?? localToday(),
        }}
        currencyFixed={account.has_transactions}
        submitLabel={t("accounts.form.save")}
        mutation={updateAccount}
        onSave={(details) => updateAccount.mutate(details)}
      />
    </Card>
  );
}

function ArchiveCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [confirming, setConfirming] = useState(false);
  const archive = useArchiveAccount(account.id);
  const setArchived = (archived: boolean) =>
    archive.mutate(archived, { onSuccess: () => setConfirming(false) });

  return (
    <Card title={t("accounts.archive.title")}>
      {account.archived ? (
        <>
          <p className="text-sm text-zinc-500">{t("accounts.archive.isArchived")}</p>
          <Button
            variant="secondary"
            disabled={archive.isPending}
            onClick={() => setArchived(false)}
            className="self-start"
          >
            {t("accounts.archive.unarchive")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-500">{t("accounts.archive.explained")}</p>
          <Button
            variant="secondary"
            disabled={archive.isPending}
            onClick={() => (account.balance === 0 ? setArchived(true) : setConfirming(true))}
            className="self-start"
          >
            {t("accounts.archive.submit")}
          </Button>
        </>
      )}
      {archive.error && !confirming && <ErrorText>{t("accounts.errors.saveFailed")}</ErrorText>}
      <ConfirmDialog
        open={confirming}
        title={t("accounts.archive.confirmTitle", { name: account.name })}
        confirmLabel={t("accounts.archive.confirm")}
        pending={archive.isPending}
        onConfirm={() => setArchived(true)}
        onCancel={() => {
          archive.reset();
          setConfirming(false);
        }}
      >
        <p>
          {t("accounts.archive.stillHolds", {
            name: account.name,
            balance: money(account.balance, account.currency),
          })}
        </p>
        {archive.error && <ErrorText>{t("accounts.errors.saveFailed")}</ErrorText>}
      </ConfirmDialog>
    </Card>
  );
}

function DeleteCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteAccount = useDeleteAccount(account.id);
  const confirm = () => afterSuccess(deleteAccount.mutateAsync(), () => navigate("/"));

  if (account.has_transactions) {
    return (
      <Card title={t("accounts.delete.title")}>
        <p className="text-sm text-zinc-500">{t("accounts.delete.hasTransactions")}</p>
      </Card>
    );
  }
  return (
    <Card title={t("accounts.delete.title")}>
      <p className="text-sm text-zinc-500">{t("accounts.delete.explained")}</p>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("accounts.delete.submit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("accounts.delete.confirmTitle", { name: account.name })}
        confirmLabel={t("accounts.delete.confirm")}
        danger
        pending={deleteAccount.isPending}
        onConfirm={confirm}
        onCancel={() => {
          deleteAccount.reset();
          setConfirming(false);
        }}
      >
        {deleteAccount.error && <ErrorText>{t("accounts.errors.deleteFailed")}</ErrorText>}
      </ConfirmDialog>
    </Card>
  );
}

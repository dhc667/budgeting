import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BackLink } from "../ui/BackLink";
import { EmptyState } from "../ui/Card";
import type { Account } from "./account-queries";
import { useRoutedAccount } from "./routed-account";

type AccountSubscreenProps = { title: string; children: (account: Account) => ReactNode };

export function AccountSubscreen({ title, children }: AccountSubscreenProps) {
  const account = useRoutedAccount();
  if (account === undefined) return null;
  if (account === null) return <AccountNotFound />;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to={`/accounts/${account.id}`} place={account.name} />
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>
      {children(account)}
    </div>
  );
}

export function AccountNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("accounts.notFound")}</EmptyState>
      <Link to="/" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("accounts.backHome")}
      </Link>
    </div>
  );
}

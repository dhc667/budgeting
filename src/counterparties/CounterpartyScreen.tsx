import { ArrowDownLeft, ArrowUpRight, Heart } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { ColorDot } from "../colors/ColorDot";
import { useMoney } from "../money/use-money";
import { afterSuccess } from "../query-client";
import { spaceName } from "../spaces/space";
import { useSpaces } from "../spaces/space-queries";
import { TransactionList } from "../transactions/TransactionList";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { type ButtonVariant, buttonClass } from "../ui/button-class";
import { Card, EmptyState } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ErrorText } from "../ui/ErrorText";
import {
  useCounterparties,
  useDeleteCounterparty,
  useUpdateCounterparty,
} from "./counterparty-queries";
import { CounterpartyForm } from "./CounterpartyForm";
import { owedPhrase } from "./owed";
import type { Counterparty, CounterpartyBalance } from "./read-counterparties";

export function CounterpartyScreen() {
  const { t } = useTranslation();
  const { counterpartyId = "" } = useParams();
  const { data: counterparties } = useCounterparties();
  const { data: spaces = [] } = useSpaces();
  if (!counterparties) return null;
  const counterparty = counterparties.find(({ id }) => id === counterpartyId);
  if (!counterparty) return <CounterpartyNotFound />;
  const space = spaces.find(({ id }) => id === counterparty.space_id);

  // Keyed so that another counterparty's screen starts with a fresh form rather than this one's.
  return (
    <div key={counterparty.id} className="flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <BackLink to="/" place={t("nav.home")} />
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <ColorDot color={counterparty.color} />
          {counterparty.name}
        </h1>
        {space && <p className="text-sm text-zinc-500">{spaceName(space, t)}</p>}
      </header>
      <BalanceCard counterparty={counterparty} />
      <Card title={t("transactions.title")}>
        <TransactionList
          filter={{ counterpartyIds: [counterparty.id] }}
          empty={t("counterparties.noTransactions")}
        />
      </Card>
      <EditCard counterparty={counterparty} />
      <DeleteCard counterparty={counterparty} />
    </div>
  );
}

export function CounterpartyNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <EmptyState>{t("counterparties.notFound")}</EmptyState>
      <Link to="/" className="font-medium text-emerald-700 dark:text-emerald-400">
        {t("nav.home")}
      </Link>
    </div>
  );
}

function BalanceCard({ counterparty }: { counterparty: Counterparty }) {
  const { t } = useTranslation();
  const { id, name, balances } = counterparty;
  return (
    <Card title={t("counterparties.balance")}>
      {balances.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("counterparties.nothingYet")}</p>
      ) : (
        balances.map((balance) => <CurrencyBalance key={balance.currency} balance={balance} />)
      )}
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          to={`/transactions/new?type=given&counterparty=${id}`}
          label={t("counterparties.give", { name })}
          icon={<ArrowUpRight className="size-5" />}
        />
        <ButtonLink
          to={`/transactions/new?type=received&counterparty=${id}`}
          label={t("counterparties.receive", { name })}
          icon={<ArrowDownLeft className="size-5" />}
        />
        {balances.some(({ owed }) => owed !== 0) && (
          <ButtonLink
            to={`/counterparties/${id}/forgive`}
            label={t("counterparties.forgive.open")}
            icon={<Heart className="size-5" />}
            variant="secondary"
          />
        )}
      </div>
    </Card>
  );
}

// How much of what is owed has been paid back or forgiven, whichever way the money first went.
function CurrencyBalance({ balance }: { balance: CounterpartyBalance }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { currency, given, received, forgiven, owed } = balance;
  const [lent, repaid] = owed >= 0 ? [given, received] : [received, given];
  const share = lent === 0 ? 1 : Math.min((repaid + forgiven) / lent, 1);

  return (
    <section className="flex flex-col gap-2">
      <p className="text-lg font-semibold">{owedPhrase(balance, money, t)}</p>
      <div
        role="progressbar"
        aria-label={t("counterparties.paidBack", {
          paid: money(repaid, currency),
          total: money(lent, currency),
        })}
        aria-valuenow={Math.round(share * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div className="h-full bg-emerald-600" style={{ width: `${share * 100}%` }} />
      </div>
      <p className="text-sm text-zinc-500">
        {t("counterparties.paidBack", {
          paid: money(repaid, currency),
          total: money(lent, currency),
        })}
        {" · "}
        {t("counterparties.givenAndReceived", {
          given: money(given, currency),
          received: money(received, currency),
        })}
        {forgiven > 0 &&
          ` · ${t("counterparties.forgivenSoFar", { amount: money(forgiven, currency) })}`}
      </p>
    </section>
  );
}

type ButtonLinkProps = {
  to: string;
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
};

function ButtonLink({ to, label, icon, variant }: ButtonLinkProps) {
  return (
    <Link to={to} className={buttonClass(variant)}>
      {icon}
      {label}
    </Link>
  );
}

function EditCard({ counterparty }: { counterparty: Counterparty }) {
  const { t } = useTranslation();
  const updateCounterparty = useUpdateCounterparty(counterparty.id);
  return (
    <Card title={t("counterparties.details")}>
      <CounterpartyForm
        initial={{ name: counterparty.name, color: counterparty.color }}
        submitLabel={t("counterparties.form.save")}
        mutation={updateCounterparty}
        onSave={(details) => updateCounterparty.mutate(details)}
      />
    </Card>
  );
}

function DeleteCard({ counterparty }: { counterparty: Counterparty }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const deleteCounterparty = useDeleteCounterparty(counterparty.id);
  if (counterparty.has_transactions) {
    return (
      <Card title={t("counterparties.delete.title")}>
        <p className="text-sm text-zinc-500">{t("counterparties.delete.hasTransactions")}</p>
      </Card>
    );
  }
  const confirm = () => afterSuccess(deleteCounterparty.mutateAsync(), () => navigate("/"));

  return (
    <Card title={t("counterparties.delete.title")}>
      <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {t("counterparties.delete.submit")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("counterparties.delete.confirmTitle", { name: counterparty.name })}
        confirmLabel={t("counterparties.delete.confirm")}
        danger
        pending={deleteCounterparty.isPending}
        onConfirm={confirm}
        onCancel={() => {
          deleteCounterparty.reset();
          setConfirming(false);
        }}
      >
        {deleteCounterparty.error && (
          <ErrorText>{t("counterparties.errors.deleteFailed")}</ErrorText>
        )}
      </ConfirmDialog>
    </Card>
  );
}

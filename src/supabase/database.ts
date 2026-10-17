import type { Database as Generated } from "./database.types.ts";

// Postgres reports every column of a view as nullable, and every function argument as required,
// so the generated types say so too. These restore what the definitions allow.
export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Views" | "Functions"> & {
    Views: {
      accounts: Omit<GeneratedViews["accounts"], "Row"> & {
        Row: NotNullExcept<GeneratedViews["accounts"]["Row"], "opening_date">;
      };
      categories: Omit<GeneratedViews["categories"], "Row"> & {
        Row: Omit<NotNullExcept<GeneratedViews["categories"]["Row"], "parent_id">, "kind"> & {
          kind: "expense" | "income";
        };
      };
      transaction_details: Omit<GeneratedViews["transaction_details"], "Row"> & {
        Row: NotNullExcept<
          GeneratedViews["transaction_details"]["Row"],
          TransactionSide | "title" | "note" | "type"
        >;
      };
    };
    Functions: Omit<
      GeneratedFunctions,
      | "create_category"
      | "update_category"
      | "delete_category"
      | "add_transaction"
      | "update_transaction"
      | "title_suggestions"
      | "create_recurring_transaction"
      | "update_recurring_transaction"
      | "record_recurring_transaction"
      | "changes_since"
    > & {
      create_category: WithNullableArgs<GeneratedFunctions["create_category"], "parent">;
      update_category: WithNullableArgs<GeneratedFunctions["update_category"], "parent">;
      delete_category: WithNullableArgs<GeneratedFunctions["delete_category"], "move_to">;
      add_transaction: WithNullableArgs<GeneratedFunctions["add_transaction"], TransactionDetail>;
      update_transaction: WithNullableArgs<
        GeneratedFunctions["update_transaction"],
        TransactionDetail
      >;
      create_recurring_transaction: WithNullableArgs<
        GeneratedFunctions["create_recurring_transaction"],
        TransactionDetail | ScheduleEnd
      >;
      update_recurring_transaction: WithNullableArgs<
        GeneratedFunctions["update_recurring_transaction"],
        TransactionDetail | ScheduleEnd
      >;
      record_recurring_transaction: WithNullableArgs<
        GeneratedFunctions["record_recurring_transaction"],
        "to_amount"
      >;
      changes_since: Omit<GeneratedFunctions["changes_since"], "Returns"> & {
        Returns: Changes;
      };
      title_suggestions: Omit<GeneratedFunctions["title_suggestions"], "Returns"> & {
        Returns: NotNullExcept<
          GeneratedFunctions["title_suggestions"]["Returns"][number],
          TransactionSide | "note"
        >[];
      };
    };
  };
};

type Changes = {
  version: number;
  reset: boolean;
  space_ids: string[];
  rows: { [Table in SyncedTable]: GeneratedTables[Table]["Row"][] };
  deleted: { table: SyncedTable; key: Record<string, string> }[];
};

type SyncedTable =
  | "currencies"
  | "exchange_rates"
  | "exchange_rate_history_starts"
  | "profiles"
  | "spaces"
  | "space_members"
  | "activity"
  | "ledger_accounts"
  | "transactions"
  | "postings"
  | "recurring_transactions"
  | "budgets"
  | "budget_exclusions";

type GeneratedTables = Generated["public"]["Tables"];

type GeneratedViews = Generated["public"]["Views"];

type GeneratedFunctions = Generated["public"]["Functions"];

// Which of these a transaction has depends on its type, and on which of its sides a member sees.
type TransactionSide =
  | "from_account_id"
  | "from_amount"
  | "from_currency"
  | "to_account_id"
  | "to_amount"
  | "to_currency"
  | "category_id";

type TransactionDetail = "title" | "note" | "category" | "to_account" | "to_amount";

type ScheduleEnd = "ends_on" | "times";

type NotNullExcept<Row, Nullable extends keyof Row> = {
  [Column in keyof Row]: Column extends Nullable ? Row[Column] : NonNullable<Row[Column]>;
};

type WithNullableArgs<Fn extends { Args: object }, Nullable extends keyof Fn["Args"]> = Omit<
  Fn,
  "Args"
> & {
  Args: {
    [Arg in keyof Fn["Args"]]: Arg extends Nullable ? Fn["Args"][Arg] | null : Fn["Args"][Arg];
  };
};

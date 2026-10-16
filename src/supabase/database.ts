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
    };
    Functions: Omit<
      GeneratedFunctions,
      "create_category" | "update_category" | "delete_category"
    > & {
      create_category: WithNullableArgs<GeneratedFunctions["create_category"], "parent">;
      update_category: WithNullableArgs<GeneratedFunctions["update_category"], "parent">;
      delete_category: WithNullableArgs<GeneratedFunctions["delete_category"], "move_to">;
    };
  };
};

type GeneratedViews = Generated["public"]["Views"];

type GeneratedFunctions = Generated["public"]["Functions"];

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

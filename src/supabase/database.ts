import type { Database as Generated } from "./database.types";

// Postgres reports every column of a view as nullable, so the generated types say so too. These
// restore what the view's definition guarantees.
export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Views"> & {
    Views: {
      accounts: Omit<GeneratedViews["accounts"], "Row"> & {
        Row: NotNullExcept<GeneratedViews["accounts"]["Row"], "opening_date">;
      };
    };
  };
};

type GeneratedViews = Generated["public"]["Views"];

type NotNullExcept<Row, Nullable extends keyof Row> = {
  [Column in keyof Row]: Column extends Nullable ? Row[Column] : NonNullable<Row[Column]>;
};

CREATE TYPE "public"."built_in_category" AS ENUM('debts_forgiven', 'debts_forgiven_to_you');--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'forgave';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'forgiven';--> statement-breakpoint
ALTER TABLE "ledger_accounts" DROP CONSTRAINT "named_unless_opening_balance";--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "built_in" "built_in_category";--> statement-breakpoint
CREATE UNIQUE INDEX "one_of_each_built_in_category_per_space" ON "ledger_accounts" USING btree ("space_id","built_in") WHERE "ledger_accounts"."built_in" is not null;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "named_unless_opening_balance_or_built_in" CHECK (("ledger_accounts"."kind" = 'opening_balance' or "ledger_accounts"."built_in" is not null) = ("ledger_accounts"."name" is null));--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "built_in_category_of_its_kind" CHECK ("ledger_accounts"."built_in" is null
        or ("ledger_accounts"."built_in" = 'debts_forgiven' and "ledger_accounts"."kind" = 'expense')
        or ("ledger_accounts"."built_in" = 'debts_forgiven_to_you' and "ledger_accounts"."kind" = 'income'));--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "built_in_category_unnested" CHECK ("ledger_accounts"."built_in" is null or "ledger_accounts"."parent_id" is null);
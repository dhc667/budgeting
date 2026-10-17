CREATE TABLE "deleted_rows" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deleted_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"table_name" text NOT NULL,
	"key" jsonb NOT NULL,
	"version" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_exclusions" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "currencies" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rate_history_starts" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "postings" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "deleted_rows_version_idx" ON "deleted_rows" USING btree ("version");--> statement-breakpoint
CREATE INDEX "activity_version_idx" ON "activity" USING btree ("version");--> statement-breakpoint
CREATE INDEX "budget_exclusions_version_idx" ON "budget_exclusions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "budgets_version_idx" ON "budgets" USING btree ("version");--> statement-breakpoint
CREATE INDEX "currencies_version_idx" ON "currencies" USING btree ("version");--> statement-breakpoint
CREATE INDEX "exchange_rate_history_starts_version_idx" ON "exchange_rate_history_starts" USING btree ("version");--> statement-breakpoint
CREATE INDEX "exchange_rates_version_idx" ON "exchange_rates" USING btree ("version");--> statement-breakpoint
CREATE INDEX "ledger_accounts_version_idx" ON "ledger_accounts" USING btree ("version");--> statement-breakpoint
CREATE INDEX "postings_version_idx" ON "postings" USING btree ("version");--> statement-breakpoint
CREATE INDEX "profiles_version_idx" ON "profiles" USING btree ("version");--> statement-breakpoint
CREATE INDEX "recurring_transactions_version_idx" ON "recurring_transactions" USING btree ("version");--> statement-breakpoint
CREATE INDEX "space_members_version_idx" ON "space_members" USING btree ("version");--> statement-breakpoint
CREATE INDEX "spaces_version_idx" ON "spaces" USING btree ("version");--> statement-breakpoint
CREATE INDEX "transactions_version_idx" ON "transactions" USING btree ("version");--> statement-breakpoint
CREATE POLICY "users see every deleted row" ON "deleted_rows" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
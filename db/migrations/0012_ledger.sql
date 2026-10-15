CREATE TYPE "public"."color" AS ENUM('red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'slate');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('account', 'expense', 'income', 'opening_balance');--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"name" text,
	"currency" text,
	"color" "color",
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "named_unless_opening_balance" CHECK (("ledger_accounts"."kind" = 'opening_balance') = ("ledger_accounts"."name" is null)),
	CONSTRAINT "name_not_blank" CHECK (trim("ledger_accounts"."name") <> ''),
	CONSTRAINT "currency_only_on_accounts" CHECK (("ledger_accounts"."kind" = 'account') = ("ledger_accounts"."currency" is not null)),
	CONSTRAINT "colored_unless_opening_balance" CHECK (("ledger_accounts"."kind" = 'opening_balance') = ("ledger_accounts"."color" is null))
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_accounts_space_id_idx" ON "ledger_accounts" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_opening_balance_category_per_space" ON "ledger_accounts" USING btree ("space_id") WHERE "ledger_accounts"."kind" = 'opening_balance';--> statement-breakpoint
CREATE INDEX "postings_transaction_id_idx" ON "postings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "postings_ledger_account_id_idx" ON "postings" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX "transactions_created_by_idx" ON "transactions" USING btree ("created_by");--> statement-breakpoint
CREATE POLICY "members see their spaces' accounts and categories" ON "ledger_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_space_member("ledger_accounts"."space_id"));--> statement-breakpoint
CREATE POLICY "members edit their spaces' accounts" ON "ledger_accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.is_space_member("ledger_accounts"."space_id") and "ledger_accounts"."kind" = 'account') WITH CHECK (public.is_space_member("ledger_accounts"."space_id") and "ledger_accounts"."kind" = 'account');--> statement-breakpoint
CREATE POLICY "members delete their spaces' accounts" ON "ledger_accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.is_space_member("ledger_accounts"."space_id") and "ledger_accounts"."kind" = 'account');--> statement-breakpoint
CREATE POLICY "members see postings in their spaces" ON "postings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.ledger_accounts where ledger_accounts.id = "postings"."ledger_account_id"));--> statement-breakpoint
CREATE POLICY "members see transactions touching their spaces" ON "transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.postings where postings.transaction_id = "transactions"."id"));
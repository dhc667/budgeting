CREATE TYPE "public"."repeat_unit" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"title" text,
	"note" text,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" uuid,
	"to_account_id" uuid,
	"to_amount" bigint,
	"starts_on" date NOT NULL,
	"every" integer NOT NULL,
	"unit" "repeat_unit" NOT NULL,
	"ends_on" date,
	"times" integer,
	"done" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "title_not_blank" CHECK (trim("recurring_transactions"."title") <> ''),
	CONSTRAINT "note_not_blank" CHECK (trim("recurring_transactions"."note") <> ''),
	CONSTRAINT "amount_positive" CHECK ("recurring_transactions"."amount" > 0),
	CONSTRAINT "to_amount_positive" CHECK ("recurring_transactions"."to_amount" > 0),
	CONSTRAINT "category_or_to_account" CHECK (("recurring_transactions"."type" = 'transfer') = ("recurring_transactions"."to_account_id" is not null and "recurring_transactions"."category_id" is null)),
	CONSTRAINT "every_positive" CHECK ("recurring_transactions"."every" > 0),
	CONSTRAINT "times_positive" CHECK ("recurring_transactions"."times" > 0),
	CONSTRAINT "ends_on_or_after_start" CHECK ("recurring_transactions"."ends_on" >= "recurring_transactions"."starts_on"),
	CONSTRAINT "one_end" CHECK ("recurring_transactions"."ends_on" is null or "recurring_transactions"."times" is null),
	CONSTRAINT "done_not_negative" CHECK ("recurring_transactions"."done" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recurring_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_ledger_accounts_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_to_account_id_ledger_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_transactions_space_id_idx" ON "recurring_transactions" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "recurring_transactions_account_id_idx" ON "recurring_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_transactions_category_id_idx" ON "recurring_transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "recurring_transactions_to_account_id_idx" ON "recurring_transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX "recurring_transactions_created_by_idx" ON "recurring_transactions" USING btree ("created_by");--> statement-breakpoint
CREATE POLICY "members of every space a rule touches see it" ON "recurring_transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("recurring_transactions"."space_id" = any (array(select public.my_space_ids())) and ("recurring_transactions"."to_account_id" is null or exists (select 1 from public.ledger_accounts where ledger_accounts.id = "recurring_transactions"."to_account_id")));
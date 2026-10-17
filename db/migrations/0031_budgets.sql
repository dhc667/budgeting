CREATE TABLE "budget_exclusions" (
	"budget_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	CONSTRAINT "budget_exclusions_budget_id_transaction_id_pk" PRIMARY KEY("budget_id","transaction_id")
);
--> statement-breakpoint
ALTER TABLE "budget_exclusions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"every" integer,
	"unit" "repeat_unit",
	"carry_unspent" boolean DEFAULT false NOT NULL,
	"carry_overspent" boolean DEFAULT false NOT NULL,
	"category_ids" uuid[],
	"account_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_not_blank" CHECK (trim("budgets"."name") <> ''),
	CONSTRAINT "amount_positive" CHECK ("budgets"."amount" > 0),
	CONSTRAINT "every_positive" CHECK ("budgets"."every" > 0),
	CONSTRAINT "repeating_or_fixed" CHECK (("budgets"."every" is not null and "budgets"."unit" is not null and "budgets"."ends_on" is null) or ("budgets"."every" is null and "budgets"."unit" is null and "budgets"."ends_on" is not null)),
	CONSTRAINT "ends_on_or_after_start" CHECK ("budgets"."ends_on" >= "budgets"."starts_on"),
	CONSTRAINT "carry_over_only_when_repeating" CHECK ("budgets"."every" is not null or not ("budgets"."carry_unspent" or "budgets"."carry_overspent"))
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_exclusions" ADD CONSTRAINT "budget_exclusions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_exclusions" ADD CONSTRAINT "budget_exclusions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_exclusions_transaction_id_idx" ON "budget_exclusions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "budgets_space_id_idx" ON "budgets" USING btree ("space_id");--> statement-breakpoint
CREATE POLICY "members see what their spaces' budgets leave out" ON "budget_exclusions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.budgets where budgets.id = "budget_exclusions"."budget_id"));--> statement-breakpoint
CREATE POLICY "members see their spaces' budgets" ON "budgets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("budgets"."space_id" = any (array(select public.my_space_ids())));--> statement-breakpoint
CREATE POLICY "members add budgets" ON "budgets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("budgets"."space_id" = any (array(select public.my_space_ids())));--> statement-breakpoint
CREATE POLICY "members edit their spaces' budgets" ON "budgets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("budgets"."space_id" = any (array(select public.my_space_ids()))) WITH CHECK ("budgets"."space_id" = any (array(select public.my_space_ids())));--> statement-breakpoint
CREATE POLICY "members delete their spaces' budgets" ON "budgets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("budgets"."space_id" = any (array(select public.my_space_ids())));
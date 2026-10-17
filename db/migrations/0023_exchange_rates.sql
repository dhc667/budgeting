CREATE TABLE "exchange_rate_history_starts" (
	"provider" text NOT NULL,
	"currency" text NOT NULL,
	"starts_on" date NOT NULL,
	"checked_on" date NOT NULL,
	CONSTRAINT "exchange_rate_history_starts_provider_currency_pk" PRIMARY KEY("provider","currency")
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_history_starts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"rate" numeric NOT NULL,
	CONSTRAINT "exchange_rates_date_currency_pk" PRIMARY KEY("date","currency"),
	CONSTRAINT "rate_positive" CHECK ("exchange_rates"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "currencies" ADD COLUMN "rates_by_hand" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_rate_history_starts" ADD CONSTRAINT "exchange_rate_history_starts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates" USING btree ("currency","date" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "users see where every provider's history starts" ON "exchange_rate_history_starts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "users see every exchange rate" ON "exchange_rates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
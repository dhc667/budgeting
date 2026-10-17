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
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates" USING btree ("currency","date" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "users see every exchange rate" ON "exchange_rates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
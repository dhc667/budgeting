CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"decimals" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users see every currency" ON "currencies" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
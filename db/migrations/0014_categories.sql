CREATE TABLE "starter_categories" (
	"id" smallint PRIMARY KEY NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"icon" text NOT NULL,
	"color" "color" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "starter_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starter_category_names" (
	"starter_category_id" smallint NOT NULL,
	"language" "language" NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "starter_category_names_starter_category_id_language_pk" PRIMARY KEY("starter_category_id","language")
);
--> statement-breakpoint
ALTER TABLE "starter_category_names" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "starter_category_names" ADD CONSTRAINT "starter_category_names_starter_category_id_starter_categories_id_fk" FOREIGN KEY ("starter_category_id") REFERENCES "public"."starter_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_parent_id_ledger_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_accounts_parent_id_idx" ON "ledger_accounts" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "icon_only_on_categories" CHECK (("ledger_accounts"."kind" in ('expense', 'income')) = ("ledger_accounts"."icon" is not null));
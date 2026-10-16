CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'refund', 'income', 'transfer');--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "transactions_newest_first_idx" ON "transactions" USING btree ("date" DESC NULLS FIRST,"created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "title_not_blank" CHECK (trim("transactions"."title") <> '');--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "note_not_blank" CHECK (trim("transactions"."note") <> '');
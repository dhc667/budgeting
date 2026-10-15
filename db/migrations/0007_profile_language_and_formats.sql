CREATE TYPE "public"."date_format" AS ENUM('day_month_year', 'month_day_year', 'year_month_day');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'es-419', 'pt-BR');--> statement-breakpoint
CREATE TYPE "public"."number_format" AS ENUM('comma_period', 'period_comma', 'space_comma', 'apostrophe_period');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "language" "language";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "number_format" "number_format";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "date_format" date_format;
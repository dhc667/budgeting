CREATE TYPE "public"."activity_action" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"space_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"action" "activity_action" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"old" jsonb,
	"new" jsonb
);
--> statement-breakpoint
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_membership_per_user" UNIQUE("space_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "space_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"private_owner" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_private_owner_unique" UNIQUE("private_owner"),
	CONSTRAINT "private_or_named" CHECK (("spaces"."private_owner" is null) = ("spaces"."name" is not null)),
	CONSTRAINT "name_not_blank" CHECK (trim("spaces"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_private_owner_profiles_id_fk" FOREIGN KEY ("private_owner") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_space_id_idx" ON "activity" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "activity_row_id_idx" ON "activity" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "activity_changed_by_idx" ON "activity" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "space_members_user_id_idx" ON "space_members" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "members see their spaces' activity" ON "activity" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_space_member("activity"."space_id"));--> statement-breakpoint
CREATE POLICY "members see who else is a member" ON "space_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_space_member("space_members"."space_id"));--> statement-breakpoint
CREATE POLICY "members add users" ON "space_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.is_space_member("space_members"."space_id"));--> statement-breakpoint
CREATE POLICY "members remove members or leave" ON "space_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.is_space_member("space_members"."space_id"));--> statement-breakpoint
CREATE POLICY "members see their spaces" ON "spaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.is_space_member("spaces"."id"));--> statement-breakpoint
CREATE POLICY "members rename shared spaces" ON "spaces" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.is_space_member("spaces"."id") and "spaces"."private_owner" is null) WITH CHECK (public.is_space_member("spaces"."id") and "spaces"."private_owner" is null);--> statement-breakpoint
CREATE POLICY "members delete shared spaces" ON "spaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.is_space_member("spaces"."id") and "spaces"."private_owner" is null);
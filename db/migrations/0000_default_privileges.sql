-- Supabase gives anon and authenticated every privilege on new tables, sequences and functions in
-- public, and Postgres lets everyone execute new functions. Revoking those defaults means a table
-- or function is reachable from the app only through an explicit grant, not just RLS.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
--> statement-breakpoint
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
--> statement-breakpoint
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
--> statement-breakpoint
alter default privileges for role postgres revoke execute on functions from public;

-- The app compares this with the migrations it was built with (ADR 0001).
create or replace function public.schema_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from drizzle.__drizzle_migrations;
$$;
--> statement-breakpoint
grant execute on function public.schema_version() to anon, authenticated;

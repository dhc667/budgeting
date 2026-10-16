-- The caller's spaces, looked up once per query by the policies on space-owned tables. Security
-- definer so that reading space_members here doesn't run its own policy, which calls this again.
create or replace function public.my_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select space_id from public.space_members where user_id = (select auth.uid());
$$;
--> statement-breakpoint
grant execute on function public.my_space_ids() to authenticated;

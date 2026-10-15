-- Policies on space-owned tables call this. Security definer so that checking membership doesn't
-- run space_members' own policies, which call this again. plpgsql because its body is only checked
-- when it runs: space_members is created by the next migration, whose policies need this to exist.
create or replace function public.is_space_member(space uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.space_members
    where space_id = space and user_id = (select auth.uid())
  );
end;
$$;
--> statement-breakpoint
grant execute on function public.is_space_member(uuid) to authenticated;

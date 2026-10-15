-- Arguments: the column holding the row's space id, then 'shared_only' to leave private spaces out.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  space uuid := (coalesce(new_row, old_row)->>tg_argv[0])::uuid;
begin
  if old_row = new_row then
    return null;
  end if;

  -- A deleted space takes its activity with it, so a change cascading from it has nowhere to go.
  if not exists (select 1 from public.spaces where id = space) then
    return null;
  end if;

  if tg_argv[1] = 'shared_only'
    and exists (select 1 from public.spaces where id = space and private_owner is not null) then
    return null;
  end if;

  insert into public.activity (space_id, table_name, row_id, action, changed_by, old, new)
  values (
    space,
    tg_table_name,
    (coalesce(new_row, old_row)->>'id')::uuid,
    lower(tg_op)::public.activity_action,
    auth.uid(),
    old_row,
    new_row
  );
  return null;
end;
$$;
--> statement-breakpoint
create trigger log_activity
after insert or update or delete on public.spaces
for each row execute function public.log_activity('id', 'shared_only');
--> statement-breakpoint
create trigger log_activity
after insert or update or delete on public.space_members
for each row execute function public.log_activity('space_id', 'shared_only');
--> statement-breakpoint
create or replace function public.check_new_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.spaces
    where id = new.space_id and private_owner is not null and private_owner <> new.user_id
  ) then
    raise exception 'a private space has no members but its owner';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger check_new_member
before insert on public.space_members
for each row execute function public.check_new_member();
--> statement-breakpoint
-- Security definer because, run as the user, `for update` applies the spaces update policy, which
-- hides private spaces: the owner would then be let out of their own.
create or replace function public.keep_a_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  space public.spaces;
begin
  -- The lock makes two last members leaving at once take turns, so the second sees it would be alone.
  select * into space from public.spaces where id = old.space_id for update;

  -- The space is being deleted, members and all.
  if not found then
    return old;
  end if;

  if space.private_owner is not null then
    if exists (select 1 from public.profiles where id = space.private_owner) then
      raise exception 'a private space always keeps its owner';
    end if;
    return old;
  end if;

  if not exists (select 1 from public.space_members where space_id = old.space_id and id <> old.id) then
    raise exception 'the last member of a space can''t leave it';
  end if;
  return old;
end;
$$;
--> statement-breakpoint
create trigger keep_a_member
before delete on public.space_members
for each row execute function public.keep_a_member();
--> statement-breakpoint
create or replace function public.create_space(space_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_space uuid;
begin
  if auth.uid() is null then
    raise exception 'only a signed-in user can create a space';
  end if;

  insert into public.spaces (name) values (trim(space_name)) returning id into new_space;
  insert into public.space_members (space_id, user_id) values (new_space, auth.uid());
  insert into public.space_members (space_id, user_id)
  select distinct new_space, member_id
  from unnest(member_ids) as member_id
  where member_id <> auth.uid();
  return new_space;
end;
$$;
--> statement-breakpoint
grant execute on function public.create_space(text, uuid[]) to authenticated;
--> statement-breakpoint
grant select, delete on public.spaces to authenticated;
--> statement-breakpoint
grant update (name) on public.spaces to authenticated;
--> statement-breakpoint
grant select, delete on public.space_members to authenticated;
--> statement-breakpoint
grant insert (space_id, user_id) on public.space_members to authenticated;
--> statement-breakpoint
grant select on public.activity to authenticated;
--> statement-breakpoint
create or replace function public.redeem_invite_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  private_space uuid;
begin
  -- The used_at check is re-evaluated after the row lock, so of two signups racing on one code only one finds it.
  update public.invite_codes
  set used_at = now(), used_by = new.id
  where code_hash = encode(sha256(convert_to(new.raw_user_meta_data->>'invite_code', 'UTF8')), 'hex')
    and used_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid, used or expired invite code';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  );

  insert into public.spaces (private_owner) values (new.id) returning id into private_space;
  insert into public.space_members (space_id, user_id) values (private_space, new.id);

  return new;
end;
$$;
--> statement-breakpoint
insert into public.spaces (private_owner) select id from public.profiles;
--> statement-breakpoint
insert into public.space_members (space_id, user_id)
select id, private_owner from public.spaces;

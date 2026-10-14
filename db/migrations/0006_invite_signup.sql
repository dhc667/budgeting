-- The hook only gives a readable error; the trigger below is the actual gate (ADR 0004).
create or replace function public.check_invite_code(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.invite_codes
    where code_hash = encode(sha256(convert_to(event->'user'->'user_metadata'->>'invite_code', 'UTF8')), 'hex')
      and used_at is null
      and expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This invite code is invalid, already used or expired. Ask for a new one.'
    )
  );
end;
$$;
--> statement-breakpoint
grant execute on function public.check_invite_code(jsonb) to supabase_auth_admin;
--> statement-breakpoint
revoke execute on function public.check_invite_code(jsonb) from public, anon, authenticated;
--> statement-breakpoint
create or replace function public.redeem_invite_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  return new;
end;
$$;
--> statement-breakpoint
revoke execute on function public.redeem_invite_code() from public, anon, authenticated;
--> statement-breakpoint
create or replace trigger redeem_invite_code
after insert on auth.users
for each row execute function public.redeem_invite_code();

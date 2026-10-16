insert into public.starter_categories (id, kind, icon, color) values
  (1, 'expense', 'shopping-cart', 'green'),
  (2, 'expense', 'utensils', 'orange'),
  (3, 'expense', 'bus', 'blue'),
  (4, 'expense', 'house', 'amber'),
  (5, 'expense', 'receipt', 'teal'),
  (6, 'expense', 'heart-pulse', 'red'),
  (7, 'expense', 'shopping-bag', 'pink'),
  (8, 'expense', 'film', 'violet'),
  (9, 'expense', 'graduation-cap', 'indigo'),
  (10, 'expense', 'plane', 'cyan'),
  (11, 'expense', 'gift', 'lime'),
  (12, 'expense', 'ellipsis', 'slate'),
  (13, 'income', 'briefcase', 'green'),
  (14, 'income', 'gift', 'lime'),
  (15, 'income', 'trending-up', 'teal'),
  (16, 'income', 'ellipsis', 'slate');
--> statement-breakpoint
insert into public.starter_category_names (starter_category_id, language, name) values
  (1, 'en', 'Groceries'), (1, 'es-419', 'Supermercado'), (1, 'pt-BR', 'Mercado'),
  (2, 'en', 'Eating out'), (2, 'es-419', 'Comer afuera'), (2, 'pt-BR', 'Comer fora'),
  (3, 'en', 'Transport'), (3, 'es-419', 'Transporte'), (3, 'pt-BR', 'Transporte'),
  (4, 'en', 'Home'), (4, 'es-419', 'Hogar'), (4, 'pt-BR', 'Casa'),
  (5, 'en', 'Bills & utilities'), (5, 'es-419', 'Cuentas y servicios'), (5, 'pt-BR', 'Contas e serviços'),
  (6, 'en', 'Health'), (6, 'es-419', 'Salud'), (6, 'pt-BR', 'Saúde'),
  (7, 'en', 'Shopping'), (7, 'es-419', 'Compras'), (7, 'pt-BR', 'Compras'),
  (8, 'en', 'Entertainment'), (8, 'es-419', 'Entretenimiento'), (8, 'pt-BR', 'Lazer'),
  (9, 'en', 'Education'), (9, 'es-419', 'Educación'), (9, 'pt-BR', 'Educação'),
  (10, 'en', 'Travel'), (10, 'es-419', 'Viajes'), (10, 'pt-BR', 'Viagens'),
  (11, 'en', 'Gifts'), (11, 'es-419', 'Regalos'), (11, 'pt-BR', 'Presentes'),
  (12, 'en', 'Other'), (12, 'es-419', 'Otros'), (12, 'pt-BR', 'Outros'),
  (13, 'en', 'Salary'), (13, 'es-419', 'Sueldo'), (13, 'pt-BR', 'Salário'),
  (14, 'en', 'Gifts'), (14, 'es-419', 'Regalos'), (14, 'pt-BR', 'Presentes'),
  (15, 'en', 'Interest & investments'), (15, 'es-419', 'Intereses e inversiones'), (15, 'pt-BR', 'Juros e investimentos'),
  (16, 'en', 'Other'), (16, 'es-419', 'Otros'), (16, 'pt-BR', 'Outros');
--> statement-breakpoint
-- A trigger can't take arguments from the statement that fired it, so whoever creates a space
-- names its language here first. English if nobody did.
create or replace function public.add_starter_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (space_id, kind, name, icon, color, created_at)
  select new.id, starter.kind, names.name, starter.icon, starter.color, new.created_at
  from public.starter_categories as starter
  join public.starter_category_names as names on names.starter_category_id = starter.id
  where names.language
    = coalesce(nullif(current_setting('budgeting.starter_language', true), ''), 'en')::public.language;
  return null;
end;
$$;
--> statement-breakpoint
create trigger add_starter_categories
after insert on public.spaces
for each row execute function public.add_starter_categories();
--> statement-breakpoint
-- Starter categories are as old as their space: they come with it, like its opening-balance category.
create or replace function public.came_with_space(category public.ledger_accounts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.spaces where id = category.space_id and created_at = category.created_at
  );
$$;
--> statement-breakpoint
drop trigger log_activity on public.ledger_accounts;
--> statement-breakpoint
-- Listing every starter category as added would bury what members did.
create trigger log_inserts
after insert on public.ledger_accounts
for each row when (new.kind <> 'opening_balance' and not public.came_with_space(new))
execute function public.log_activity('space_id', 'every_space');
--> statement-breakpoint
-- Reordering moves every account in a space, which would bury the changes that matter.
create trigger log_updates
after update on public.ledger_accounts
for each row when (new.kind <> 'opening_balance')
execute function public.log_activity('space_id', 'every_space', 'position');
--> statement-breakpoint
-- delete_category logs its own entry, which says where the category's transactions went.
drop trigger log_deletes on public.ledger_accounts;
--> statement-breakpoint
create trigger log_deletes
after delete on public.ledger_accounts
for each row when (old.kind = 'account')
execute function public.log_activity('space_id', 'every_space');
--> statement-breakpoint
create or replace function public.check_category_nesting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.ledger_accounts;
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Locked so that the parent can't move or change kind while a subcategory joins it.
  select * into parent from public.ledger_accounts where id = new.parent_id for share;

  if not found then
    raise exception 'no such parent category';
  end if;
  if new.kind not in ('expense', 'income') or parent.kind not in ('expense', 'income') then
    raise exception 'only categories nest';
  end if;
  if parent.space_id <> new.space_id then
    raise exception 'a subcategory belongs to its parent''s space';
  end if;
  if parent.id = new.id or parent.parent_id is not null then
    raise exception 'categories nest one level deep';
  end if;
  if exists (select 1 from public.ledger_accounts where parent_id = new.id) then
    raise exception 'a category with subcategories can''t become one';
  end if;

  new.kind := parent.kind;
  return new;
end;
$$;
--> statement-breakpoint
create trigger check_category_nesting
before insert or update of parent_id, kind on public.ledger_accounts
for each row execute function public.check_category_nesting();
--> statement-breakpoint
create or replace function public.subcategories_follow_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ledger_accounts set kind = new.kind where parent_id = new.id;
  return null;
end;
$$;
--> statement-breakpoint
create trigger subcategories_follow_kind
after update of kind on public.ledger_accounts
for each row when (old.kind is distinct from new.kind)
execute function public.subcategories_follow_kind();
--> statement-breakpoint
drop function public.create_space(text, uuid[]);
--> statement-breakpoint
create function public.create_space(
  space_name text,
  member_ids uuid[],
  -- Defaulted so that a copy of the app from before categories can still create spaces.
  starter_language public.language default 'en'
)
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

  perform set_config('budgeting.starter_language', starter_language::text, true);
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

  -- Metadata comes straight from the client, so a language the app doesn't know falls back.
  perform set_config(
    'budgeting.starter_language',
    coalesce(
      (
        select language::text
        from unnest(enum_range(null::public.language)) as language
        where language::text = new.raw_user_meta_data->>'language'
      ),
      'en'
    ),
    true
  );
  insert into public.spaces (private_owner) values (new.id) returning id into private_space;
  insert into public.space_members (space_id, user_id) values (private_space, new.id);

  return new;
end;
$$;
--> statement-breakpoint
create or replace function public.create_category(
  space uuid,
  category_name text,
  category_kind public.ledger_account_kind,
  category_icon text,
  category_color public.color,
  parent uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  category uuid;
begin
  if not public.is_space_member(space) then
    raise exception 'only a member of a space can add categories to it';
  end if;
  if category_kind not in ('expense', 'income') then
    raise exception 'a category is for expenses or income';
  end if;

  insert into public.ledger_accounts (space_id, kind, name, icon, color, parent_id)
  values (space, category_kind, trim(category_name), category_icon, category_color, parent)
  returning id into category;
  return category;
end;
$$;
--> statement-breakpoint
create or replace function public.update_category(
  category_id uuid,
  category_name text,
  category_kind public.ledger_account_kind,
  category_icon text,
  category_color public.color,
  parent uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if category_kind not in ('expense', 'income') then
    raise exception 'a category is for expenses or income';
  end if;

  -- Both rows, in id order: two categories moving under each other at once then take turns
  -- instead of deadlocking, and the second finds the first already nested.
  perform from public.ledger_accounts
  where id in (category_id, parent) and public.is_space_member(space_id)
  order by id
  for update;

  update public.ledger_accounts
  set
    name = trim(category_name),
    kind = category_kind,
    icon = category_icon,
    color = category_color,
    parent_id = parent
  where id = category_id and kind in ('expense', 'income') and public.is_space_member(space_id);

  if not found then
    raise exception 'no such category in your spaces';
  end if;
end;
$$;
--> statement-breakpoint
create or replace function public.delete_category(category_id uuid, move_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  category public.ledger_accounts;
  target public.ledger_accounts;
  transaction_count integer;
  moved jsonb := '{}';
begin
  -- Both rows, in id order, so that two categories deleted into each other at once take turns
  -- instead of deadlocking, and the target can't go away or change kind meanwhile.
  perform from public.ledger_accounts
  where id in (category_id, move_to) and public.is_space_member(space_id)
  order by id
  for update;

  select * into category
  from public.ledger_accounts
  where id = category_id and kind in ('expense', 'income') and public.is_space_member(space_id);

  if not found then
    raise exception 'no such category in your spaces';
  end if;
  if exists (select 1 from public.ledger_accounts where parent_id = category.id) then
    raise exception 'a category with subcategories can''t be deleted';
  end if;

  select count(distinct transaction_id) into transaction_count
  from public.postings
  where ledger_account_id = category.id;

  if transaction_count > 0 then
    select * into target
    from public.ledger_accounts
    where id = move_to and id <> category.id and space_id = category.space_id and kind = category.kind;

    if not found then
      raise exception 'a category''s transactions move to another of its kind in its space';
    end if;
    update public.postings set ledger_account_id = target.id where ledger_account_id = category.id;
    moved := jsonb_build_object(
      'moved_to', jsonb_build_object('id', target.id, 'name', target.name),
      'moved_transactions', transaction_count
    );
  end if;

  delete from public.ledger_accounts where id = category.id;
  insert into public.activity (space_id, table_name, row_id, action, changed_by, old, new)
  values (
    category.space_id,
    'ledger_accounts',
    category.id,
    'delete',
    auth.uid(),
    to_jsonb(category) || moved,
    null
  );
end;
$$;
--> statement-breakpoint
create view public.categories with (security_invoker = true) as
select
  id,
  space_id,
  kind,
  parent_id,
  name,
  icon,
  color,
  created_at,
  (
    select count(distinct transaction_id) from public.postings
    where ledger_account_id = ledger_accounts.id
  )::integer as transaction_count
from public.ledger_accounts
where kind in ('expense', 'income');
--> statement-breakpoint
grant execute on function
  public.create_space(text, uuid[], public.language),
  public.create_category(uuid, text, public.ledger_account_kind, text, public.color, uuid),
  public.update_category(uuid, text, public.ledger_account_kind, text, public.color, uuid),
  public.delete_category(uuid, uuid)
to authenticated;
--> statement-breakpoint
grant select on public.categories to authenticated;

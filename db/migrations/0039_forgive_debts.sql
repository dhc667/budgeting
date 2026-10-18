-- The values 0038 adds to transaction_type can't be read until the migration's transaction commits,
-- so only plpgsql bodies name them (see 0037).
--
-- A forgiven debt passes through an account (ADR 0014): what the counterparty owes comes back into
-- the account and goes out to one of the space's built-in categories, or the other way round. The
-- account keeps its balance, and the forgiveness counts as its spending or income.
create function public.add_built_in_categories(space uuid, added_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ledger_accounts (space_id, kind, built_in, icon, color, created_at)
  values
    (space, 'expense', 'debts_forgiven', 'heart', 'pink', added_at),
    (space, 'income', 'debts_forgiven_to_you', 'heart', 'teal', added_at);
$$;
--> statement-breakpoint
-- As old as their space, like its starter categories, so that adding them isn't in its activity.
select public.add_built_in_categories(id, created_at) from public.spaces;
--> statement-breakpoint
create function public.uses_counterparty(transaction_type public.transaction_type)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  return transaction_type in ('given', 'received', 'forgave', 'forgiven');
end;
$$;
--> statement-breakpoint
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
  perform public.add_built_in_categories(new.id, new.created_at);
  return null;
end;
$$;
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
  if parent.built_in is not null then
    raise exception 'a built-in category has no subcategories';
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
-- A built-in category's name comes from the app's language, so the name sent for one is dropped.
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

  if exists (
    select 1 from public.ledger_accounts
    where id = category_id and built_in is not null and (kind <> category_kind or parent is not null)
  ) then
    raise exception 'a built-in category keeps its kind and has no parent';
  end if;

  update public.ledger_accounts
  set
    name = case when built_in is null then trim(category_name) end,
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
  if category.built_in is not null then
    raise exception 'a built-in category can''t be deleted';
  end if;
  if exists (select 1 from public.ledger_accounts where parent_id = category.id) then
    raise exception 'a category with subcategories can''t be deleted';
  end if;

  select count(distinct transaction_id) into transaction_count
  from public.postings
  where ledger_account_id = category.id;

  if transaction_count > 0
    or exists (select 1 from public.recurring_transactions where recurring_transactions.category_id = category.id)
  then
    select * into target
    from public.ledger_accounts
    where id = move_to
      and id <> category.id
      and space_id = category.space_id
      and kind = category.kind
      and built_in is null;

    if not found then
      raise exception 'a category''s transactions move to another of its kind in its space';
    end if;
    update public.postings set ledger_account_id = target.id where ledger_account_id = category.id;
    update public.recurring_transactions
    set category_id = target.id
    where recurring_transactions.category_id = category.id;
    if category.kind = 'expense' then
      update public.budgets
      set category_ids = array(select distinct unnest(array_replace(category_ids, category.id, target.id)))
      where category.id = any (category_ids);
    end if;
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
    (to_jsonb(category) - 'version') || moved,
    null
  );
end;
$$;
--> statement-breakpoint
-- A counterparty can be deleted once its last transaction is, so it may be gone.
create or replace function public.restored_ledger_account(posting jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := (posting->>'ledger_account_id')::uuid;
  account public.ledger_accounts;
begin
  -- No else: opening balances are refused before their postings get here.
  case posting->>'account_kind'
    when 'account' then
      select * into account from public.ledger_accounts where id = target for share;

      if not found then
        raise exception 'an account it used was deleted' using detail = 'account_deleted';
      end if;
      if account.currency <> posting->>'currency' then
        raise exception 'an account it used changed currency' using detail = 'currency_changed';
      end if;
      return target;
    when 'counterparty' then
      perform from public.ledger_accounts where id = target for share;

      if not found then
        raise exception 'its counterparty was deleted' using detail = 'counterparty_deleted';
      end if;
      return target;
    when 'expense', 'income' then
      loop
        perform from public.ledger_accounts where id = target for share;
        if found then
          return target;
        end if;

        select (old->'moved_to'->>'id')::uuid into target
        from public.activity
        where table_name = 'ledger_accounts' and row_id = target and action = 'delete';

        if target is null then
          raise exception 'its category was deleted' using detail = 'category_deleted';
        end if;
      end loop;
  end case;
end;
$$;
--> statement-breakpoint
create or replace function public.transaction_sides(
  transaction_type public.transaction_type,
  account uuid,
  amount bigint,
  other_side uuid,
  to_account uuid,
  to_amount bigint,
  used_before uuid[]
)
returns table (side_account uuid, side_currency text, side_amount bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  money public.ledger_accounts;
  other public.ledger_accounts;
  category_kind public.ledger_account_kind;
  forgiven_in uuid;
  owed bigint;
  outflow bigint;
begin
  if amount is null or amount <= 0 then
    raise exception 'a transaction moves an amount above zero';
  end if;
  money := public.usable_account(account, used_before);

  -- No else: a missing type raises case_not_found rather than writing nothing.
  case transaction_type
    when 'expense', 'refund', 'income' then
      select * into other
      from public.ledger_accounts
      where id = other_side and kind in ('expense', 'income') and public.is_space_member(space_id)
      for share;

      if not found then
        raise exception 'no such category in your spaces';
      end if;
      if other.built_in is not null then
        raise exception 'a built-in category takes only forgiven debts';
      end if;
      category_kind := case transaction_type when 'income' then 'income' else 'expense' end;
      if other.kind <> category_kind then
        raise exception 'an expense or refund uses an expense category, and an income an income category';
      end if;
      if other.space_id <> money.space_id then
        raise exception 'an expense or income uses an account and a category from the same space';
      end if;

      outflow := case transaction_type when 'expense' then amount else -amount end;
      return query values
        (money.id, money.currency, -outflow),
        (other.id, money.currency, outflow);
    when 'given', 'received', 'forgave', 'forgiven' then
      select * into other
      from public.ledger_accounts
      where id = other_side and kind = 'counterparty' and public.is_space_member(space_id)
      -- Not for share: two debts forgiven at once would each find all of it still owed.
      for no key update;

      if not found then
        raise exception 'no such counterparty in your spaces';
      end if;
      if other.space_id <> money.space_id then
        raise exception 'a debt uses an account and a counterparty from the same space';
      end if;

      outflow := case when transaction_type in ('given', 'forgiven') then amount else -amount end;
      if transaction_type in ('given', 'received') then
        return query values
          (money.id, money.currency, -outflow),
          (other.id, money.currency, outflow);
      else
        select coalesce(sum(postings.amount), 0) into owed
        from public.postings
        where ledger_account_id = other.id and currency = money.currency;
        -- What whoever is forgiven owes.
        if transaction_type = 'forgiven' then
          owed := -owed;
        end if;

        if amount > owed then
          raise exception 'a debt is forgiven up to what''s owed' using detail = 'more_than_owed';
        end if;

        select id into forgiven_in
        from public.ledger_accounts
        where space_id = money.space_id
          and built_in = case transaction_type
            when 'forgave' then 'debts_forgiven'::public.built_in_category
            else 'debts_forgiven_to_you'::public.built_in_category
          end;

        -- In from the counterparty and out to the category, or the other way round.
        return query values
          (other.id, money.currency, outflow),
          (money.id, money.currency, -outflow),
          (money.id, money.currency, outflow),
          (forgiven_in, money.currency, -outflow);
      end if;
    when 'transfer' then
      other := public.usable_account(to_account, used_before);
      if other.id = money.id then
        raise exception 'a transfer moves money between two different accounts';
      end if;
      if other.currency <> money.currency and (to_amount is null or to_amount <= 0) then
        raise exception 'a transfer between currencies needs the amount received above zero';
      end if;

      return query values
        (money.id, money.currency, -amount),
        (
          other.id,
          other.currency,
          case when other.currency = money.currency then amount else to_amount end
        );
  end case;
end;
$$;
--> statement-breakpoint
-- Null for opening balances, and for any shape the functions above never write.
create or replace function public.transaction_type(transaction uuid)
returns public.transaction_type
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
    select case
      when count(*) = 4 then
        case
          when not (bool_or(ledger_accounts.kind = 'counterparty') and bool_or(ledger_accounts.kind = 'account')) then null
          when bool_or(ledger_accounts.kind = 'expense') then 'forgave'
          when bool_or(ledger_accounts.kind = 'income') then 'forgiven'
        end
      when count(*) <> 2 then null
      when bool_and(ledger_accounts.kind = 'account') then 'transfer'
      when bool_or(ledger_accounts.kind = 'expense') and bool_or(ledger_accounts.kind = 'account') then
        case when sum(postings.amount) filter (where ledger_accounts.kind = 'account') < 0
          then 'expense' else 'refund' end
      when bool_or(ledger_accounts.kind = 'income') and bool_or(ledger_accounts.kind = 'account')
        and sum(postings.amount) filter (where ledger_accounts.kind = 'account') > 0 then 'income'
      when bool_or(ledger_accounts.kind = 'counterparty') and bool_or(ledger_accounts.kind = 'account') then
        case when sum(postings.amount) filter (where ledger_accounts.kind = 'account') < 0
          then 'given' else 'received' end
    end::public.transaction_type
    from public.postings
    join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
    where postings.transaction_id = transaction
  );
end;
$$;
--> statement-breakpoint
create or replace function public.add_transaction(
  transaction_id uuid,
  transaction_type public.transaction_type,
  transaction_date date,
  title text,
  note text,
  account uuid,
  amount bigint,
  category uuid,
  to_account uuid,
  to_amount bigint,
  counterparty uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  added uuid;
begin
  if auth.uid() is null then
    raise exception 'only a signed-in user can add transactions';
  end if;
  perform public.check_transaction_date(transaction_date);
  if exists (
    select 1 from public.activity
    where table_name = 'transactions' and row_id = add_transaction.transaction_id
  ) then
    return;
  end if;

  insert into public.transactions (id, date, title, note, created_by)
  values (transaction_id, transaction_date, nullif(trim(title), ''), nullif(trim(note), ''), auth.uid())
  on conflict (id) do nothing
  returning id into added;

  if added is null then
    return;
  end if;
  perform public.write_postings(
    added,
    transaction_type,
    account,
    amount,
    case when public.uses_counterparty(transaction_type) then counterparty else category end,
    to_account,
    to_amount,
    '{}'
  );
  perform public.log_transaction_changes(added, 'insert', '{}', public.snapshots_by_space(added));
end;
$$;
--> statement-breakpoint
create or replace function public.update_transaction(
  transaction_id uuid,
  transaction_type public.transaction_type,
  transaction_date date,
  title text,
  note text,
  account uuid,
  amount bigint,
  category uuid,
  to_account uuid,
  to_amount bigint,
  counterparty uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction uuid := transaction_id;
  before jsonb;
  used_before uuid[];
begin
  perform public.check_transaction_date(transaction_date);
  perform public.lock_changeable_transaction(transaction);
  before := public.snapshots_by_space(transaction);

  select array_agg(ledger_account_id) into used_before
  from public.postings
  where postings.transaction_id = transaction;

  update public.transactions
  set
    date = transaction_date,
    title = nullif(trim(update_transaction.title), ''),
    note = nullif(trim(update_transaction.note), '')
  where id = transaction;
  delete from public.postings where postings.transaction_id = transaction;
  perform public.write_postings(
    transaction,
    transaction_type,
    account,
    amount,
    case when public.uses_counterparty(transaction_type) then counterparty else category end,
    to_account,
    to_amount,
    used_before
  );
  perform public.log_transaction_changes(
    transaction, 'update', before, public.snapshots_by_space(transaction)
  );
end;
$$;
--> statement-breakpoint
create or replace view public.categories with (security_invoker = true) as
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
  )::integer as transaction_count,
  built_in
from public.ledger_accounts
where kind in ('expense', 'income');

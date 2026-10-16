-- The latest date anywhere on Earth: the server's clock can't tell which day it is for the user.
create or replace function public.latest_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Etc/GMT-14')::date;
$$;
--> statement-breakpoint
create or replace function public.check_opening_date(opening_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if opening_date > public.latest_today() then
    raise exception 'an opening balance can''t be dated in the future';
  end if;
end;
$$;
--> statement-breakpoint
create or replace function public.check_transaction_date(transaction_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if transaction_date > public.latest_today() then
    raise exception 'a transaction can''t be dated in the future';
  end if;
end;
$$;
--> statement-breakpoint
-- Security definer, like everything below that reads a transaction's postings: a member of one of
-- the spaces a transfer joins sees only their side of it.
create or replace function public.spaces_touched(transaction uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct ledger_accounts.space_id
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transaction;
$$;
--> statement-breakpoint
create or replace function public.can_change_transaction(transaction uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.spaces_touched(transaction) as space where not public.is_space_member(space)
  );
$$;
--> statement-breakpoint
-- Null for opening balances, and for any shape the functions below never write.
create or replace function public.transaction_type(transaction uuid)
returns public.transaction_type
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) <> 2 then null
    when bool_and(ledger_accounts.kind = 'account') then 'transfer'
    when bool_or(ledger_accounts.kind = 'expense') and bool_or(ledger_accounts.kind = 'account') then
      case when sum(postings.amount) filter (where ledger_accounts.kind = 'account') < 0
        then 'expense' else 'refund' end
    when bool_or(ledger_accounts.kind = 'income') and bool_or(ledger_accounts.kind = 'account')
      and sum(postings.amount) filter (where ledger_accounts.kind = 'account') > 0 then 'income'
  end::public.transaction_type
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transaction;
$$;
--> statement-breakpoint
-- What a space's activity keeps of a transaction: its own postings in full, and of the other side
-- of a transfer only which way the money went, so a private account never shows in a shared space.
create or replace function public.transaction_snapshot(transaction uuid, space uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(transactions)
    || jsonb_build_object(
      'type', public.transaction_type(transaction),
      'postings', (
        select jsonb_agg(
          to_jsonb(postings)
            || jsonb_build_object('account_kind', ledger_accounts.kind, 'account_name', ledger_accounts.name)
          order by postings.amount desc
        )
        from public.postings
        join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
        where postings.transaction_id = transaction and ledger_accounts.space_id = space
      )
    )
    || coalesce(
      (
        select jsonb_build_object('other_space', case when postings.amount > 0 then 'to' else 'from' end)
        from public.postings
        join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
        where postings.transaction_id = transaction and ledger_accounts.space_id <> space
        limit 1
      ),
      '{}'
    )
  from public.transactions
  where id = transaction;
$$;
--> statement-breakpoint
create or replace function public.snapshots_by_space(transaction uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(space, public.transaction_snapshot(transaction, space)), '{}')
  from public.spaces_touched(transaction) as space;
$$;
--> statement-breakpoint
-- One entry in each space the transaction touched before or after.
create or replace function public.log_transaction_changes(
  transaction uuid,
  action public.activity_action,
  before jsonb,
  after jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  space text;
begin
  for space in select jsonb_object_keys(before) union select jsonb_object_keys(after) loop
    perform public.log_transaction(space::uuid, transaction, action, before->space, after->space);
  end loop;
end;
$$;
--> statement-breakpoint
-- Locked so that the account can't be archived while a transaction joins it. An archived account
-- still takes the transactions that already used it.
create or replace function public.usable_account(account uuid, used_before uuid[])
returns public.ledger_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  usable public.ledger_accounts;
begin
  select * into usable
  from public.ledger_accounts
  where id = account and kind = 'account' and public.is_space_member(space_id)
  for share;

  if not found then
    raise exception 'no such account in your spaces';
  end if;
  if usable.archived and not usable.id = any(used_before) then
    raise exception 'an archived account takes no new transactions';
  end if;
  return usable;
end;
$$;
--> statement-breakpoint
create or replace function public.write_postings(
  transaction uuid,
  transaction_type public.transaction_type,
  account uuid,
  amount bigint,
  category uuid,
  to_account uuid,
  to_amount bigint,
  used_before uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  money public.ledger_accounts;
  other public.ledger_accounts;
  category_kind public.ledger_account_kind;
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
      where id = category and kind in ('expense', 'income') and public.is_space_member(space_id)
      for share;

      if not found then
        raise exception 'no such category in your spaces';
      end if;
      category_kind := case transaction_type when 'income' then 'income' else 'expense' end;
      if other.kind <> category_kind then
        raise exception 'an expense or refund uses an expense category, and an income an income category';
      end if;
      if other.space_id <> money.space_id then
        raise exception 'an expense or income uses an account and a category from the same space';
      end if;

      outflow := case transaction_type when 'expense' then amount else -amount end;
      insert into public.postings (transaction_id, ledger_account_id, currency, amount)
      values
        (transaction, money.id, money.currency, -outflow),
        (transaction, other.id, money.currency, outflow);
    when 'transfer' then
      other := public.usable_account(to_account, used_before);
      if other.id = money.id then
        raise exception 'a transfer moves money between two different accounts';
      end if;
      if other.currency <> money.currency and (to_amount is null or to_amount <= 0) then
        raise exception 'a transfer between currencies needs the amount received above zero';
      end if;

      insert into public.postings (transaction_id, ledger_account_id, currency, amount)
      values
        (transaction, money.id, money.currency, -amount),
        (
          transaction,
          other.id,
          other.currency,
          case when other.currency = money.currency then amount else to_amount end
        );
  end case;
end;
$$;
--> statement-breakpoint
-- The id comes from the app, so a device that sends a transaction again, never having heard back,
-- saves it once (ADR 0011). Activity outlives a deleted transaction, so a late resend can't bring it
-- back.
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
  to_amount bigint
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
    added, transaction_type, account, amount, category, to_account, to_amount, '{}'
  );
  perform public.log_transaction_changes(added, 'insert', '{}', public.snapshots_by_space(added));
end;
$$;
--> statement-breakpoint
-- Locked so that two members changing the same transaction take turns.
create or replace function public.lock_changeable_transaction(transaction uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform from public.transactions where id = transaction for update;

  if not found
    or public.is_opening_balance(transaction)
    or not exists (
      select 1 from public.spaces_touched(transaction) as space where public.is_space_member(space)
    ) then
    raise exception 'no such transaction in your spaces';
  end if;
  if not public.can_change_transaction(transaction) then
    raise exception 'only a member of both spaces can change a transfer between them';
  end if;
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
  to_amount bigint
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
    transaction, transaction_type, account, amount, category, to_account, to_amount, used_before
  );
  perform public.log_transaction_changes(
    transaction, 'update', before, public.snapshots_by_space(transaction)
  );
end;
$$;
--> statement-breakpoint
create or replace function public.delete_transaction(transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction uuid := transaction_id;
  before jsonb;
begin
  perform public.lock_changeable_transaction(transaction);
  before := public.snapshots_by_space(transaction);
  delete from public.transactions where id = transaction;
  perform public.log_transaction_changes(transaction, 'delete', before, '{}');
end;
$$;
--> statement-breakpoint
-- The sides of one change, logged in each space it touched, read as one. A member of only one of
-- those spaces has just that side, which stays as it was logged.
create or replace function public.merged_snapshot(snapshots jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when count(snapshot) <= 1 then (array_agg(snapshot) filter (where snapshot is not null))[1]
    else ((array_agg(snapshot) filter (where snapshot is not null))[1] - 'other_space')
      || jsonb_build_object(
        'postings',
        (
          select jsonb_agg(posting order by (posting->>'amount')::bigint desc)
          from unnest(snapshots) as side, jsonb_array_elements(side->'postings') as posting
        )
      )
  end
  from unnest(snapshots) as sides(snapshot);
$$;
--> statement-breakpoint
create or replace function public.transaction_history(transaction_id uuid)
returns setof public.activity
language sql
stable
set search_path = ''
as $$
  select
    min(id),
    (array_agg(space_id order by id))[1],
    'transactions'::text,
    row_id,
    action,
    changed_by,
    changed_at,
    public.merged_snapshot(array_agg(old order by id)),
    public.merged_snapshot(array_agg(new order by id))
  from public.activity
  where table_name = 'transactions' and row_id = transaction_history.transaction_id
  group by row_id, action, changed_by, changed_at
  order by min(id) desc;
$$;
--> statement-breakpoint
-- A member sees the postings in their own spaces, so a transfer from another space shows one side.
create view public.transaction_details with (security_invoker = true) as
select
  transactions.id,
  transactions.date,
  transactions.title,
  transactions.note,
  transactions.created_by,
  transactions.created_at,
  public.transaction_type(transactions.id) as type,
  not public.can_change_transaction(transactions.id) as one_sided,
  sent.ledger_account_id as from_account_id,
  -sent.amount as from_amount,
  sent.currency as from_currency,
  received.ledger_account_id as to_account_id,
  received.amount as to_amount,
  received.currency as to_currency,
  category.ledger_account_id as category_id,
  array(
    select distinct ledger_accounts.space_id
    from public.postings
    join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
    where postings.transaction_id = transactions.id
  ) as space_ids
from public.transactions
left join lateral (
  select postings.ledger_account_id, postings.amount, postings.currency
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transactions.id
    and ledger_accounts.kind = 'account'
    and postings.amount < 0
  limit 1
) as sent on true
left join lateral (
  select postings.ledger_account_id, postings.amount, postings.currency
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transactions.id
    and ledger_accounts.kind = 'account'
    and postings.amount > 0
  limit 1
) as received on true
left join lateral (
  select postings.ledger_account_id
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transactions.id and ledger_accounts.kind in ('expense', 'income')
  limit 1
) as category on true
where not public.is_opening_balance(transactions.id);
--> statement-breakpoint
-- The latest transaction of each title, one per category, or per pair of accounts for a transfer,
-- so that picking a title fills in the rest the way it was last time.
create or replace function public.title_suggestions()
returns setof public.transaction_details
language sql
stable
set search_path = ''
as $$
  select *
  from (
    select distinct on (
      lower(title),
      type,
      category_id,
      case when category_id is null then from_account_id end,
      case when category_id is null then to_account_id end
    ) *
    from public.transaction_details
    where created_by = auth.uid() and title is not null and type is not null and not one_sided
    order by
      lower(title),
      type,
      category_id,
      case when category_id is null then from_account_id end,
      case when category_id is null then to_account_id end,
      date desc,
      created_at desc
  ) as latest
  order by date desc, created_at desc;
$$;
--> statement-breakpoint
grant execute on function
  public.add_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint),
  public.update_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint),
  public.delete_transaction(uuid),
  public.transaction_history(uuid),
  public.merged_snapshot(jsonb[]),
  public.title_suggestions(),
  public.transaction_type(uuid),
  public.can_change_transaction(uuid)
to authenticated;
--> statement-breakpoint
grant select on public.transaction_details to authenticated;

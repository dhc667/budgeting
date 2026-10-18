-- The values 0036 adds to ledger_account_kind and transaction_type can't be read until the
-- migration's transaction commits, and every pending migration runs in one transaction. Only
-- plpgsql bodies, parsed when first called, may name them; views and SQL functions compare text.
--
-- A counterparty is a ledger account for whoever money is lent to or borrowed from (ADR 0013).
-- `other_side` is the category of an expense, refund or income, or the counterparty of money given
-- or received.
drop function public.transaction_sides(
  public.transaction_type, uuid, bigint, uuid, uuid, bigint, uuid[]
);
--> statement-breakpoint
create function public.transaction_sides(
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
    when 'given', 'received' then
      select * into other
      from public.ledger_accounts
      where id = other_side and kind = 'counterparty' and public.is_space_member(space_id)
      for share;

      if not found then
        raise exception 'no such counterparty in your spaces';
      end if;
      if other.space_id <> money.space_id then
        raise exception 'money given or received uses an account and a counterparty from the same space';
      end if;

      outflow := case transaction_type when 'given' then amount else -amount end;
      return query values
        (money.id, money.currency, -outflow),
        (other.id, money.currency, outflow);
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
drop function public.write_postings(
  uuid, public.transaction_type, uuid, bigint, uuid, uuid, bigint, uuid[]
);
--> statement-breakpoint
create function public.write_postings(
  transaction uuid,
  transaction_type public.transaction_type,
  account uuid,
  amount bigint,
  other_side uuid,
  to_account uuid,
  to_amount bigint,
  used_before uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.postings (transaction_id, ledger_account_id, currency, amount)
  select transaction, side_account, side_currency, side_amount
  from public.transaction_sides(
    transaction_type, account, amount, other_side, to_account, to_amount, used_before
  );
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
-- Unchanged but for counterparty_id.
create or replace view public.transaction_details with (security_invoker = true) as
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
  ) as space_ids,
  extensions.unaccent(concat_ws(E'\n', transactions.title, transactions.note)) as search_text,
  counterparty.ledger_account_id as counterparty_id
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
left join lateral (
  select postings.ledger_account_id
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where postings.transaction_id = transactions.id and ledger_accounts.kind::text = 'counterparty'
  limit 1
) as counterparty on true
-- Not is_opening_balance(): a function Postgres can't inline would run for every transaction read,
-- where this looks the opening balances up once.
where transactions.id not in (
  select postings.transaction_id
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where ledger_accounts.kind = 'opening_balance'
);
--> statement-breakpoint
-- Dropped rather than replaced to take a counterparty. It defaults to null so that the recurring
-- transaction functions, which call these with the arguments they had, still find them.
drop function public.add_transaction(
  uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint
);
--> statement-breakpoint
drop function public.update_transaction(
  uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint
);
--> statement-breakpoint
-- The id comes from the app, so a device that sends a transaction again, never having heard back,
-- saves it once (ADR 0011). Activity outlives a deleted transaction, so a late resend can't bring it
-- back.
create function public.add_transaction(
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
    case when transaction_type in ('given', 'received') then counterparty else category end,
    to_account,
    to_amount,
    '{}'
  );
  perform public.log_transaction_changes(added, 'insert', '{}', public.snapshots_by_space(added));
end;
$$;
--> statement-breakpoint
create function public.update_transaction(
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
    case when transaction_type in ('given', 'received') then counterparty else category end,
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
create function public.create_counterparty(
  space uuid,
  counterparty_name text,
  counterparty_color public.color
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  counterparty uuid;
begin
  if not public.is_space_member(space) then
    raise exception 'only a member of a space can add counterparties to it';
  end if;

  insert into public.ledger_accounts (space_id, kind, name, color)
  values (space, 'counterparty', trim(counterparty_name), counterparty_color)
  returning id into counterparty;
  return counterparty;
end;
$$;
--> statement-breakpoint
create function public.update_counterparty(
  counterparty_id uuid,
  counterparty_name text,
  counterparty_color public.color
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ledger_accounts
  set name = trim(counterparty_name), color = counterparty_color
  where id = counterparty_id and kind = 'counterparty' and public.is_space_member(space_id);

  if not found then
    raise exception 'no such counterparty in your spaces';
  end if;
end;
$$;
--> statement-breakpoint
-- Its transactions would be left with one side, so only a counterparty without any goes.
create function public.delete_counterparty(counterparty_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  counterparty public.ledger_accounts;
begin
  select * into counterparty
  from public.ledger_accounts
  where id = counterparty_id and kind = 'counterparty' and public.is_space_member(space_id)
  for update;

  if not found then
    raise exception 'no such counterparty in your spaces';
  end if;
  if exists (select 1 from public.postings where ledger_account_id = counterparty.id) then
    raise exception 'a counterparty with transactions can''t be deleted';
  end if;
  delete from public.ledger_accounts where id = counterparty.id;
end;
$$;
--> statement-breakpoint
grant execute on function
  public.add_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid),
  public.update_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid),
  public.create_counterparty(uuid, text, public.color),
  public.update_counterparty(uuid, text, public.color),
  public.delete_counterparty(uuid)
to authenticated;

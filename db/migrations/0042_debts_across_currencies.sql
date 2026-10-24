-- Money given or received may move a debt in another currency than its account's (ADR 0016). The
-- debt's currency is the new last argument, null for the account's, and `to_amount` then carries
-- what the money changed in the debt. It defaults to null so that the recurring transaction
-- functions, which call these with the arguments they had, still find them.
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
  used_before uuid[],
  debt_currency text default null
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
  debt_in text;
  debt_outflow bigint;
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
      debt_in := coalesce(debt_currency, money.currency);
      if transaction_type in ('given', 'received') then
        if debt_in = money.currency then
          debt_outflow := outflow;
        elsif to_amount is null or to_amount <= 0 then
          raise exception 'money given or received in another currency needs the debt amount above zero';
        else
          debt_outflow := sign(outflow) * to_amount;
        end if;
        return query values
          (money.id, money.currency, -outflow),
          (other.id, debt_in, debt_outflow);
      else
        if debt_in <> money.currency then
          raise exception 'a debt is forgiven in its own currency';
        end if;
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
  used_before uuid[],
  debt_currency text default null
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
    transaction_type, account, amount, other_side, to_account, to_amount, used_before, debt_currency
  );
end;
$$;
--> statement-breakpoint
drop function public.add_transaction(
  uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid
);
--> statement-breakpoint
drop function public.update_transaction(
  uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid
);
--> statement-breakpoint
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
  counterparty uuid default null,
  debt_currency text default null
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
    '{}',
    debt_currency
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
  counterparty uuid default null,
  debt_currency text default null
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
    used_before,
    debt_currency
  );
  perform public.log_transaction_changes(
    transaction, 'update', before, public.snapshots_by_space(transaction)
  );
end;
$$;
--> statement-breakpoint
grant execute on function
  public.add_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid, text),
  public.update_transaction(uuid, public.transaction_type, date, text, text, uuid, bigint, uuid, uuid, bigint, uuid, text)
to authenticated;
--> statement-breakpoint
-- Unchanged but for what the transaction changed in a debt, in the debt's currency.
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
  counterparty.ledger_account_id as counterparty_id,
  abs(counterparty.amount) as debt_amount,
  counterparty.currency as debt_currency
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
  select postings.ledger_account_id, postings.amount, postings.currency
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

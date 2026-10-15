-- Arguments: the column holding the row's space id; 'shared_only' to leave private spaces out, or
-- 'every_space'; then any columns whose changes alone aren't worth recording.
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
  unrecorded text[] := coalesce(tg_argv[2:], '{}');
begin
  if (old_row - unrecorded) = (new_row - unrecorded) then
    return null;
  end if;

  -- A deleted space takes its activity with it, so a change cascading from it has nowhere to go.
  if not exists (select 1 from public.spaces where id = space) then
    return null;
  end if;

  -- No else: a misspelt mode raises case_not_found rather than logging private spaces.
  case tg_argv[1]
    when 'shared_only' then
      if exists (select 1 from public.spaces where id = space and private_owner is not null) then
        return null;
      end if;
    when 'every_space' then
      null;
  end case;

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
-- Reordering moves every account in a space, which would bury the changes that matter. The
-- opening-balance category comes and goes with its space, so it isn't worth recording either.
create trigger log_activity
after insert or update on public.ledger_accounts
for each row when (new.kind <> 'opening_balance')
execute function public.log_activity('space_id', 'every_space', 'position');
--> statement-breakpoint
create trigger log_deletes
after delete on public.ledger_accounts
for each row execute function public.log_activity('space_id', 'every_space');
--> statement-breakpoint
create or replace function public.add_opening_balance_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (space_id, kind) values (new.id, 'opening_balance');
  return null;
end;
$$;
--> statement-breakpoint
create trigger add_opening_balance_category
after insert on public.spaces
for each row execute function public.add_opening_balance_category();
--> statement-breakpoint
insert into public.ledger_accounts (space_id, kind) select id, 'opening_balance' from public.spaces;
--> statement-breakpoint
create or replace function public.is_opening_balance(transaction uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.postings
    join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
    where postings.transaction_id = transaction and ledger_accounts.kind = 'opening_balance'
  );
$$;
--> statement-breakpoint
create or replace function public.check_posting_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ledger_accounts
    where id = new.ledger_account_id and kind = 'account' and currency <> new.currency
  ) then
    raise exception 'a posting moves money in its account''s currency';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger check_posting_currency
before insert or update on public.postings
for each row execute function public.check_posting_currency();
--> statement-breakpoint
-- A cross-currency transfer balances in neither currency, so only single-currency ones are checked.
create or replace function public.check_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction uuid := coalesce(new.transaction_id, old.transaction_id);
  posting_count int;
  currency_count int;
  total numeric;
begin
  if not exists (select 1 from public.transactions where id = transaction) then
    return null;
  end if;

  select count(*), count(distinct currency), sum(amount)
  into posting_count, currency_count, total
  from public.postings where transaction_id = transaction;

  if posting_count < 2 or (currency_count = 1 and total <> 0) then
    raise exception 'a transaction''s postings must balance';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create constraint trigger check_balanced
after insert or update or delete on public.postings
deferrable initially deferred
for each row execute function public.check_balanced();
--> statement-breakpoint
create or replace function public.keep_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.postings
    where ledger_account_id = new.id and not public.is_opening_balance(transaction_id)
  ) then
    raise exception 'an account''s currency can''t change once it has transactions';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger keep_currency
before update of currency on public.ledger_accounts
for each row when (old.currency is distinct from new.currency)
execute function public.keep_currency();
--> statement-breakpoint
-- The activity record keeps a transaction as one entry with its postings, each naming its account
-- as it was then, so the entry still reads right after the account is renamed or deleted.
create or replace function public.transaction_snapshot(transaction uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(transactions) || jsonb_build_object(
    'postings',
    (
      select jsonb_agg(
        to_jsonb(postings)
          || jsonb_build_object('account_kind', ledger_accounts.kind, 'account_name', ledger_accounts.name)
        order by postings.amount desc
      )
      from public.postings
      join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
      where postings.transaction_id = transaction
    )
  )
  from public.transactions
  where id = transaction;
$$;
--> statement-breakpoint
create or replace function public.log_transaction(
  space uuid,
  transaction uuid,
  action public.activity_action,
  old_snapshot jsonb,
  new_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old_snapshot = new_snapshot or not exists (select 1 from public.spaces where id = space) then
    return;
  end if;
  insert into public.activity (space_id, table_name, row_id, action, changed_by, old, new)
  values (space, 'transactions', transaction, action, auth.uid(), old_snapshot, new_snapshot);
end;
$$;
--> statement-breakpoint
-- The latest date anywhere on Earth: the server's clock can't tell which day it is for the user.
create or replace function public.check_opening_date(opening_date date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if opening_date > (now() at time zone 'Etc/GMT-14')::date then
    raise exception 'an opening balance can''t be dated in the future';
  end if;
end;
$$;
--> statement-breakpoint
create or replace function public.set_opening_balance(
  account public.ledger_accounts,
  opening_amount bigint,
  opening_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  opening_balance uuid;
  category uuid;
  before jsonb;
begin
  perform public.check_opening_date(opening_date);

  select transaction_id into opening_balance
  from public.postings
  where ledger_account_id = account.id and public.is_opening_balance(transaction_id);

  if opening_balance is null then
    if opening_amount = 0 then
      return;
    end if;
    select id into category
    from public.ledger_accounts
    where space_id = account.space_id and kind = 'opening_balance';
    insert into public.transactions (date, created_by)
    values (opening_date, auth.uid())
    returning id into opening_balance;
    insert into public.postings (transaction_id, ledger_account_id, currency, amount)
    values
      (opening_balance, account.id, account.currency, opening_amount),
      (opening_balance, category, account.currency, -opening_amount);
    perform public.log_transaction(
      account.space_id, opening_balance, 'insert', null, public.transaction_snapshot(opening_balance)
    );
    return;
  end if;

  before := public.transaction_snapshot(opening_balance);
  if opening_amount = 0 then
    delete from public.transactions where id = opening_balance;
    perform public.log_transaction(account.space_id, opening_balance, 'delete', before, null);
    return;
  end if;

  update public.transactions set date = opening_date where id = opening_balance;
  update public.postings
  set
    currency = account.currency,
    amount = case when ledger_account_id = account.id then opening_amount else -opening_amount end
  where transaction_id = opening_balance;
  perform public.log_transaction(
    account.space_id, opening_balance, 'update', before, public.transaction_snapshot(opening_balance)
  );
end;
$$;
--> statement-breakpoint
create or replace function public.create_account(
  space uuid,
  account_name text,
  account_currency text,
  account_color public.color,
  opening_amount bigint,
  opening_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.ledger_accounts;
begin
  if not public.is_space_member(space) then
    raise exception 'only a member of a space can add accounts to it';
  end if;

  insert into public.ledger_accounts (space_id, kind, name, currency, color, position)
  values (
    space,
    'account',
    trim(account_name),
    account_currency,
    account_color,
    coalesce(
      (select max(position) + 1 from public.ledger_accounts where space_id = space and kind = 'account'),
      0
    )
  )
  returning * into account;
  perform public.set_opening_balance(account, opening_amount, opening_date);
  return account.id;
end;
$$;
--> statement-breakpoint
create or replace function public.update_account(
  account_id uuid,
  account_name text,
  account_currency text,
  account_color public.color,
  opening_amount bigint,
  opening_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.ledger_accounts;
begin
  update public.ledger_accounts
  set name = trim(account_name), currency = account_currency, color = account_color
  where id = account_id and kind = 'account' and public.is_space_member(space_id)
  returning * into account;

  if not found then
    raise exception 'no such account in your spaces';
  end if;
  perform public.set_opening_balance(account, opening_amount, opening_date);
end;
$$;
--> statement-breakpoint
-- Deleting an account is only for mistakes, so its opening balance goes with it. Any other
-- transaction keeps it: the foreign key from its postings refuses the delete.
create or replace function public.delete_opening_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opening_balance uuid;
  before jsonb;
begin
  for opening_balance in
    select transaction_id from public.postings
    where ledger_account_id = old.id and public.is_opening_balance(transaction_id)
  loop
    before := public.transaction_snapshot(opening_balance);
    delete from public.transactions where id = opening_balance;
    perform public.log_transaction(old.space_id, opening_balance, 'delete', before, null);
  end loop;
  return old;
end;
$$;
--> statement-breakpoint
create trigger delete_opening_balance
before delete on public.ledger_accounts
for each row when (old.kind = 'account')
execute function public.delete_opening_balance();
--> statement-breakpoint
-- Deleting a space cascades to its accounts in no set order, and an account deleted after the
-- opening-balance category could no longer tell its opening balance apart. So they go first.
create or replace function public.delete_opening_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.transactions
  where id in (
    select postings.transaction_id
    from public.postings
    join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
    where ledger_accounts.space_id = old.id and ledger_accounts.kind = 'opening_balance'
  );
  return old;
end;
$$;
--> statement-breakpoint
create trigger delete_opening_balances
before delete on public.spaces
for each row execute function public.delete_opening_balances();
--> statement-breakpoint
create or replace function public.reorder_accounts(account_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.ledger_accounts
  set position = ordered.position
  from unnest(account_ids) with ordinality as ordered(id, position)
  where ledger_accounts.id = ordered.id;
$$;
--> statement-breakpoint
create view public.accounts with (security_invoker = true) as
select
  id,
  space_id,
  name,
  currency,
  color,
  position,
  archived,
  created_at,
  coalesce(
    (select sum(amount) from public.postings where ledger_account_id = ledger_accounts.id),
    0
  )::bigint as balance,
  coalesce(
    (
      select amount from public.postings
      where ledger_account_id = ledger_accounts.id and public.is_opening_balance(transaction_id)
    ),
    0
  ) as opening_balance,
  (
    select transactions.date
    from public.postings
    join public.transactions on transactions.id = postings.transaction_id
    where postings.ledger_account_id = ledger_accounts.id and public.is_opening_balance(transactions.id)
  ) as opening_date,
  exists (
    select 1 from public.postings
    where ledger_account_id = ledger_accounts.id and not public.is_opening_balance(transaction_id)
  ) as has_transactions
from public.ledger_accounts
where kind = 'account';
--> statement-breakpoint
create or replace function public.account_history(account_id uuid)
returns setof public.activity
language sql
stable
set search_path = ''
as $$
  select * from public.activity
  where (table_name = 'ledger_accounts' and row_id = account_id)
    or (
      table_name = 'transactions'
      and (
        new @> jsonb_build_object('postings', jsonb_build_array(jsonb_build_object('ledger_account_id', account_id)))
        or old @> jsonb_build_object('postings', jsonb_build_array(jsonb_build_object('ledger_account_id', account_id)))
      )
    )
  order by id desc;
$$;
--> statement-breakpoint
grant execute on function
  public.create_account(uuid, text, text, public.color, bigint, date),
  public.update_account(uuid, text, text, public.color, bigint, date),
  public.reorder_accounts(uuid[]),
  public.account_history(uuid),
  public.is_opening_balance(uuid)
to authenticated;
--> statement-breakpoint
grant select, delete on public.ledger_accounts to authenticated;
--> statement-breakpoint
grant update (archived, position) on public.ledger_accounts to authenticated;
--> statement-breakpoint
grant select on public.transactions, public.postings to authenticated;
--> statement-breakpoint
grant select, delete on public.accounts to authenticated;
--> statement-breakpoint
grant update (archived) on public.accounts to authenticated;

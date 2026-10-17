-- The postings a transaction would have, checked but not written, so that a recurring transaction
-- is refused for whatever its transactions would be refused for.
create or replace function public.transaction_sides(
  transaction_type public.transaction_type,
  account uuid,
  amount bigint,
  category uuid,
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
begin
  insert into public.postings (transaction_id, ledger_account_id, currency, amount)
  select transaction, side_account, side_currency, side_amount
  from public.transaction_sides(
    transaction_type, account, amount, category, to_account, to_amount, used_before
  );
end;
$$;
--> statement-breakpoint
create or replace function public.create_recurring_transaction(
  transaction_type public.transaction_type,
  title text,
  note text,
  account uuid,
  amount bigint,
  category uuid,
  to_account uuid,
  to_amount bigint,
  starts_on date,
  every integer,
  unit public.repeat_unit,
  ends_on date,
  times integer,
  record_first boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_transfer boolean := transaction_type = 'transfer';
  created uuid;
begin
  if auth.uid() is null then
    raise exception 'only a signed-in user can add recurring transactions';
  end if;
  if record_first then
    perform public.add_transaction(
      gen_random_uuid(), transaction_type, starts_on, title, note, account, amount, category,
      to_account, to_amount
    );
  else
    perform from public.transaction_sides(
      transaction_type, account, amount, category, to_account, to_amount, '{}'
    );
  end if;

  insert into public.recurring_transactions (
    space_id, type, title, note, account_id, amount, category_id, to_account_id, to_amount,
    starts_on, every, unit, ends_on, times, done, created_by
  )
  values (
    (select space_id from public.ledger_accounts where id = account),
    transaction_type,
    nullif(trim(title), ''),
    nullif(trim(note), ''),
    account,
    amount,
    case when is_transfer then null else category end,
    case when is_transfer then to_account end,
    case when is_transfer then to_amount end,
    starts_on,
    every,
    unit,
    ends_on,
    times,
    case when record_first then 1 else 0 end,
    auth.uid()
  )
  returning id into created;
  return created;
end;
$$;
--> statement-breakpoint
-- Recording or skipping moves `done` on, which `move_on` logs along with which it was.
create trigger log_activity
after insert or update or delete on public.recurring_transactions
for each row execute function public.log_activity('space_id', 'every_space', 'done');
--> statement-breakpoint
create or replace function public.move_on(rule public.recurring_transactions, how jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved public.recurring_transactions;
begin
  update public.recurring_transactions set done = done + 1 where id = rule.id returning * into moved;
  insert into public.activity (space_id, table_name, row_id, action, changed_by, old, new)
  values (
    rule.space_id,
    'recurring_transactions',
    rule.id,
    'update',
    auth.uid(),
    to_jsonb(rule),
    to_jsonb(moved) || how
  );
end;
$$;
--> statement-breakpoint
-- Locked so that two members changing the same rule take turns. A transfer from another space is
-- only for members of both, as for its transactions.
create or replace function public.lock_rule(recurring_transaction uuid)
returns public.recurring_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions;
begin
  select * into rule
  from public.recurring_transactions
  where id = recurring_transaction
    and public.is_space_member(space_id)
    and (
      to_account_id is null
      or exists (
        select 1 from public.ledger_accounts
        where id = to_account_id and public.is_space_member(ledger_accounts.space_id)
      )
    )
  for update;

  if not found then
    raise exception 'no such recurring transaction in your spaces';
  end if;
  return rule;
end;
$$;
--> statement-breakpoint
-- The second of two members acting on the same upcoming transaction is refused, rather than
-- recording it twice or editing a rule that moved on since they opened it.
create or replace function public.lock_upcoming(recurring_transaction uuid, occurrence integer)
returns public.recurring_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_rule(recurring_transaction);
begin
  if rule.done <> occurrence then
    raise exception 'this upcoming transaction was already recorded or skipped';
  end if;
  return rule;
end;
$$;
--> statement-breakpoint
create or replace function public.lock_due(recurring_transaction uuid, occurrence integer)
returns public.recurring_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_upcoming(recurring_transaction, occurrence);
begin
  if rule.paused then
    raise exception 'this recurring transaction is paused';
  end if;
  return rule;
end;
$$;
--> statement-breakpoint
create or replace function public.record_recurring_transaction(
  recurring_transaction_id uuid,
  occurrence integer,
  transaction_date date,
  amount bigint,
  to_amount bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_due(recurring_transaction_id, occurrence);
  recorded uuid := gen_random_uuid();
begin
  perform public.add_transaction(
    recorded, rule.type, transaction_date, rule.title, rule.note, rule.account_id, amount,
    rule.category_id, rule.to_account_id, to_amount
  );
  perform public.move_on(rule, jsonb_build_object('recorded', recorded));
end;
$$;
--> statement-breakpoint
create or replace function public.skip_recurring_transaction(
  recurring_transaction_id uuid,
  occurrence integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_due(recurring_transaction_id, occurrence);
begin
  perform public.move_on(rule, jsonb_build_object('skipped', true));
end;
$$;
--> statement-breakpoint
-- Changing the schedule restarts it: the app sends the date the next one is due as the start, and
-- only what's left of its times, so that what was done before counts for nothing new.
create or replace function public.update_recurring_transaction(
  recurring_transaction_id uuid,
  seen_done integer,
  transaction_type public.transaction_type,
  title text,
  note text,
  account uuid,
  amount bigint,
  category uuid,
  to_account uuid,
  to_amount bigint,
  starts_on date,
  every integer,
  unit public.repeat_unit,
  ends_on date,
  times integer,
  restart boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_upcoming(recurring_transaction_id, seen_done);
  is_transfer boolean := transaction_type = 'transfer';
begin
  perform from public.transaction_sides(
    transaction_type, account, amount, category, to_account, to_amount, '{}'
  );

  update public.recurring_transactions
  set
    space_id = (select space_id from public.ledger_accounts where id = account),
    type = transaction_type,
    title = nullif(trim(update_recurring_transaction.title), ''),
    note = nullif(trim(update_recurring_transaction.note), ''),
    account_id = account,
    amount = update_recurring_transaction.amount,
    category_id = case when is_transfer then null else category end,
    to_account_id = case when is_transfer then to_account end,
    to_amount = case when is_transfer then update_recurring_transaction.to_amount end,
    starts_on = update_recurring_transaction.starts_on,
    every = update_recurring_transaction.every,
    unit = update_recurring_transaction.unit,
    ends_on = update_recurring_transaction.ends_on,
    times = update_recurring_transaction.times,
    done = case when restart then 0 else done end
  where id = rule.id;
end;
$$;
--> statement-breakpoint
create or replace function public.pause_recurring_transaction(recurring_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_rule(recurring_transaction_id);
begin
  update public.recurring_transactions set paused = true where id = rule.id;
end;
$$;
--> statement-breakpoint
-- The app works out the first occurrence due from today on: those that fell while it was paused
-- never happened.
create or replace function public.resume_recurring_transaction(
  recurring_transaction_id uuid,
  seen_done integer,
  next_occurrence integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_upcoming(recurring_transaction_id, seen_done);
begin
  if next_occurrence < rule.done then
    raise exception 'a resumed recurring transaction can''t go back to one already done';
  end if;
  update public.recurring_transactions
  set paused = false, done = next_occurrence
  where id = rule.id;
end;
$$;
--> statement-breakpoint
create or replace function public.delete_recurring_transaction(recurring_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_transactions := public.lock_rule(recurring_transaction_id);
begin
  delete from public.recurring_transactions where id = rule.id;
end;
$$;
--> statement-breakpoint
-- Its recurring transactions move with its transactions, so a category used only by one still
-- needs somewhere for it to go.
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

  if transaction_count > 0
    or exists (select 1 from public.recurring_transactions where recurring_transactions.category_id = category.id)
  then
    select * into target
    from public.ledger_accounts
    where id = move_to and id <> category.id and space_id = category.space_id and kind = category.kind;

    if not found then
      raise exception 'a category''s transactions move to another of its kind in its space';
    end if;
    update public.postings set ledger_account_id = target.id where ledger_account_id = category.id;
    update public.recurring_transactions
    set category_id = target.id
    where recurring_transactions.category_id = category.id;
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
create or replace function public.recurring_transaction_history(recurring_transaction_id uuid)
returns setof public.activity
language sql
stable
set search_path = ''
as $$
  select * from public.activity
  where table_name = 'recurring_transactions'
    and row_id = recurring_transaction_history.recurring_transaction_id
  order by id desc;
$$;
--> statement-breakpoint
grant execute on function
  public.create_recurring_transaction(public.transaction_type, text, text, uuid, bigint, uuid, uuid, bigint, date, integer, public.repeat_unit, date, integer, boolean),
  public.record_recurring_transaction(uuid, integer, date, bigint, bigint),
  public.skip_recurring_transaction(uuid, integer),
  public.update_recurring_transaction(uuid, integer, public.transaction_type, text, text, uuid, bigint, uuid, uuid, bigint, date, integer, public.repeat_unit, date, integer, boolean),
  public.pause_recurring_transaction(uuid),
  public.resume_recurring_transaction(uuid, integer, integer),
  public.delete_recurring_transaction(uuid),
  public.recurring_transaction_history(uuid)
to authenticated;
--> statement-breakpoint
grant select on public.recurring_transactions to authenticated;

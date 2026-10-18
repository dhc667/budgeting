-- The id of the writing Postgres transaction, not the 32-bit one, which wraps. Only the trigger
-- functions call it, and they are security definer, so nobody is granted it.
create or replace function public.current_version()
returns bigint
language sql
set search_path = ''
as $$
  select pg_current_xact_id()::text::bigint;
$$;
--> statement-breakpoint
create or replace function public.set_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := public.current_version();
  return new;
end;
$$;
--> statement-breakpoint
-- A posting can make a transaction visible to someone new, so changing one is a change to its
-- transaction too. Security definer so that the user's lack of update rights on transactions
-- doesn't matter.
create or replace function public.stamp_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transactions
  set version = public.current_version()
  where id in (old.transaction_id, new.transaction_id);
  return null;
end;
$$;
--> statement-breakpoint
-- Security definer because users can't write deleted_rows.
create or replace function public.record_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deleted_rows (table_name, key, version)
  select
    tg_table_name,
    jsonb_object_agg(key_column, to_jsonb(old) -> key_column),
    public.current_version()
  from unnest(tg_argv) as key_column;
  return null;
end;
$$;
--> statement-breakpoint
do $$
declare
  synced record;
begin
  for synced in
    select * from (values
      ('currencies', array['code']),
      ('exchange_rates', array['date', 'currency']),
      ('exchange_rate_history_starts', array['provider', 'currency']),
      ('profiles', array['id']),
      ('spaces', array['id']),
      ('space_members', array['id']),
      ('activity', array['id']),
      ('ledger_accounts', array['id']),
      ('transactions', array['id']),
      ('postings', array['id']),
      ('recurring_transactions', array['id']),
      ('budgets', array['id']),
      ('budget_exclusions', array['budget_id', 'transaction_id'])
    ) as t(table_name, key_columns)
  loop
    execute format(
      'create trigger set_version before insert or update on public.%I
       for each row execute function public.set_version()',
      synced.table_name
    );
    execute format(
      'create trigger record_deletion after delete on public.%I
       for each row execute function public.record_deletion(%s)',
      synced.table_name,
      (select string_agg(quote_literal(key_column), ', ') from unnest(synced.key_columns) as key_column)
    );
  end loop;
end;
$$;
--> statement-breakpoint
create trigger stamp_transaction
after insert or update or delete on public.postings
for each row execute function public.stamp_transaction();
--> statement-breakpoint
grant select on public.deleted_rows to authenticated;
--> statement-breakpoint
-- One snapshot, so the version and everything sent with it agree. Stable for that reason: a stable
-- function's queries all see the snapshot of the query calling it. Not security definer, so Row
-- Level Security filters it as it does any other read.
--
-- A key can be in both `deleted` and `rows`: a restored transaction keeps its id. `rows` holds what
-- exists at the snapshot, so a device applies `deleted` first, then `rows`.
--
-- Exchange rates are instance-wide and the provider publishes a rate for every currency each day,
-- so only the history of the currencies the user uses is sent; any other currency sends just its
-- latest rate. Starting to use a currency writes no rate row, so a device whose `rate_currencies`
-- changed must start over to receive that currency's history.
create or replace function public.changes_since(since bigint)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  snapshot pg_snapshot := pg_current_snapshot();
  -- Past anything handed out, as after a restore to an earlier point: start over.
  starting_over boolean := since > pg_snapshot_xmax(snapshot)::text::bigint;
  from_version bigint := case when starting_over then 0 else since end;
  synced_table text;
  used_currencies text[] := array(
    select currency from public.ledger_accounts where kind = 'account'
    union select currency from public.budgets
    union select display_currency from public.profiles where id = auth.uid()
  );
  found_rows jsonb;
  changed jsonb := '{}';
begin
  -- At or above, not above: the Postgres transaction at the watermark may still have been running.
  for synced_table in
    select class.relname
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as class on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and trigger.tgfoid = 'public.set_version'::regproc
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I as t where t.version >= $1 and %s',
      synced_table,
      case synced_table
        when 'exchange_rates' then
          't.currency = any ($2) or t.date = (select max(date) from public.exchange_rates where currency = t.currency)'
        else 'true'
      end
    ) into found_rows using from_version, used_currencies;
    changed := changed || jsonb_build_object(synced_table, found_rows);
  end loop;

  return jsonb_build_object(
    'version', pg_snapshot_xmin(snapshot)::text::bigint,
    'reset', starting_over,
    'space_ids', coalesce((select jsonb_agg(id) from public.my_space_ids() as id), '[]'),
    'rate_currencies', to_jsonb(used_currencies),
    'rows', changed,
    'deleted', coalesce(
      (
        select jsonb_agg(jsonb_build_object('table', table_name, 'key', key))
        from public.deleted_rows
        where version >= from_version
      ),
      '[]'
    )
  );
end;
$$;
grant execute on function public.changes_since(bigint) to authenticated;
--> statement-breakpoint
-- `version` moves on every write, so keeping it would make a no-op look like a change.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'version' end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'version' end;
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
create or replace function public.transaction_snapshot(transaction uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(transactions) - 'version') || jsonb_build_object(
    'postings',
    (
      select jsonb_agg(
        (to_jsonb(postings) - 'version')
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
create or replace function public.transaction_snapshot(transaction uuid, space uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(transactions) - 'version')
    || jsonb_build_object(
      'type', public.transaction_type(transaction),
      'postings', (
        select jsonb_agg(
          (to_jsonb(postings) - 'version')
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
    public.merged_snapshot(array_agg(new order by id)),
    max(version)
  from public.activity
  where table_name = 'transactions' and row_id = transaction_history.transaction_id
  group by row_id, action, changed_by, changed_at
  order by min(id) desc;
$$;
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
    to_jsonb(rule) - 'version',
    (to_jsonb(moved) - 'version') || how
  );
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
create or replace function public.set_budget_exclusions(transaction_id uuid, budget_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction uuid := transaction_id;
  shown jsonb;
  budget public.budgets;
  excluding boolean;
begin
  if not exists (
    select 1 from public.spaces_touched(transaction) as space where public.is_space_member(space)
  ) then
    raise exception 'no such transaction in your spaces';
  end if;
  if exists (
    select 1 from unnest(budget_ids) as wanted(id)
    where not exists (
      select 1 from public.budgets
      where budgets.id = wanted.id
        and public.is_space_member(budgets.space_id)
        and budgets.space_id in (select public.spaces_touched(transaction))
    )
  ) then
    raise exception 'a transaction is left out only of budgets in its spaces';
  end if;

  select jsonb_build_object(
    'id', transactions.id,
    'date', transactions.date,
    'title', coalesce(transactions.title, category.name)
  ) into shown
  from public.transactions
  left join lateral (
    select ledger_accounts.name
    from public.postings
    join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
    where postings.transaction_id = transactions.id and ledger_accounts.kind in ('expense', 'income')
    limit 1
  ) as category on true
  where transactions.id = transaction;

  for budget in
    select * from public.budgets
    where public.is_space_member(budgets.space_id)
      and (budgets.id = any (budget_ids)) <> exists (
        select 1 from public.budget_exclusions
        where budget_exclusions.budget_id = budgets.id
          and budget_exclusions.transaction_id = transaction
      )
    order by budgets.id
    for update
  loop
    excluding := budget.id = any (budget_ids);
    if excluding then
      insert into public.budget_exclusions (budget_id, transaction_id) values (budget.id, transaction);
    else
      delete from public.budget_exclusions
      where budget_exclusions.budget_id = budget.id and budget_exclusions.transaction_id = transaction;
    end if;
    insert into public.activity (space_id, table_name, row_id, action, changed_by, old, new)
    values (
      budget.space_id,
      'budgets',
      budget.id,
      'update',
      auth.uid(),
      to_jsonb(budget) - 'version',
      (to_jsonb(budget) - 'version')
        || jsonb_build_object(case when excluding then 'excluded' else 'included' end, shown)
    );
  end loop;
end;
$$;

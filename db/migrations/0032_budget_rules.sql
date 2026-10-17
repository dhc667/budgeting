-- Only ids the edit adds are checked: a category that later became an income one stays chosen
-- until a member changes the budget, rather than refusing every other edit.
create or replace function public.check_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kept_categories uuid[] := '{}';
  kept_accounts uuid[] := '{}';
begin
  if tg_op = 'UPDATE' then
    kept_categories := coalesce(old.category_ids, '{}');
    kept_accounts := coalesce(old.account_ids, '{}');
  end if;

  if exists (
    select 1 from unnest(new.category_ids) as chosen(id)
    where chosen.id <> all (kept_categories)
      and not exists (
        select 1 from public.ledger_accounts
        where ledger_accounts.id = chosen.id
          and ledger_accounts.space_id = new.space_id
          and ledger_accounts.kind = 'expense'
      )
  ) then
    raise exception 'a budget covers expense categories of its own space';
  end if;
  if exists (
    select 1 from unnest(new.account_ids) as chosen(id)
    where chosen.id <> all (kept_accounts)
      and not exists (
        select 1 from public.ledger_accounts
        where ledger_accounts.id = chosen.id
          and ledger_accounts.space_id = new.space_id
          and ledger_accounts.kind = 'account'
      )
  ) then
    raise exception 'a budget covers accounts of its own space';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
create trigger check_budget
before insert or update of category_ids, account_ids on public.budgets
for each row execute function public.check_budget();
--> statement-breakpoint
create trigger log_activity
after insert or update or delete on public.budgets
for each row execute function public.log_activity('space_id', 'every_space');
--> statement-breakpoint
-- An empty list is left empty, covering nothing, rather than widened to every one in the space.
create or replace function public.forget_in_budgets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.budgets
  set
    category_ids = array_remove(category_ids, old.id),
    account_ids = array_remove(account_ids, old.id)
  where old.id = any (category_ids) or old.id = any (account_ids);
  return null;
end;
$$;
--> statement-breakpoint
create trigger forget_in_budgets
after delete on public.ledger_accounts
for each row execute function public.forget_in_budgets();
--> statement-breakpoint
-- Budgets follow its transactions to where they move, so what they spent stays spent.
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
    to_jsonb(category) || moved,
    null
  );
end;
$$;
--> statement-breakpoint
-- What went into the budget's categories from its accounts, net of refunds, by day and currency.
-- Summed here because a long-running budget has more postings than one response holds; the app
-- converts each day's sums at that day's rate.
create or replace function public.budget_spending(budget_id uuid)
returns table (spent_on date, currency text, amount bigint)
language sql
stable
set search_path = ''
as $$
  select transactions.date, postings.currency, sum(postings.amount)::bigint
  from public.budgets
  join public.ledger_accounts as category
    on category.space_id = budgets.space_id
    and category.kind = 'expense'
    and (
      budgets.category_ids is null
      or category.id = any (budgets.category_ids)
      or category.parent_id = any (budgets.category_ids)
    )
  join public.postings on postings.ledger_account_id = category.id
  join public.transactions on transactions.id = postings.transaction_id
  where budgets.id = budget_spending.budget_id
    and transactions.date >= budgets.starts_on
    and (budgets.ends_on is null or transactions.date <= budgets.ends_on)
    and (
      budgets.account_ids is null
      or exists (
        select 1 from public.postings as paid
        where paid.transaction_id = transactions.id
          and paid.ledger_account_id = any (budgets.account_ids)
      )
    )
    and not exists (
      select 1 from public.budget_exclusions
      where budget_exclusions.budget_id = budgets.id
        and budget_exclusions.transaction_id = transactions.id
    )
  group by transactions.date, postings.currency
  order by transactions.date, postings.currency;
$$;
--> statement-breakpoint
-- `budget_ids` is every budget the transaction is to be left out of: those of the caller's spaces
-- missing from it count it again. Each change is logged on its budget, naming the transaction.
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
      to_jsonb(budget),
      to_jsonb(budget)
        || jsonb_build_object(case when excluding then 'excluded' else 'included' end, shown)
    );
  end loop;
end;
$$;
--> statement-breakpoint
create or replace function public.budget_history(budget_id uuid)
returns setof public.activity
language sql
stable
set search_path = ''
as $$
  select * from public.activity
  where table_name = 'budgets' and row_id = budget_history.budget_id
  order by id desc;
$$;
--> statement-breakpoint
grant execute on function
  public.budget_spending(uuid),
  public.set_budget_exclusions(uuid, uuid[]),
  public.budget_history(uuid)
to authenticated;
--> statement-breakpoint
grant select, delete on public.budgets to authenticated;
--> statement-breakpoint
grant insert (
  id, space_id, name, currency, amount, starts_on, ends_on, every, unit, carry_unspent,
  carry_overspent, category_ids, account_ids
) on public.budgets to authenticated;
--> statement-breakpoint
grant update (
  name, currency, amount, starts_on, ends_on, every, unit, carry_unspent, carry_overspent,
  category_ids, account_ids
) on public.budgets to authenticated;
--> statement-breakpoint
grant select on public.budget_exclusions to authenticated;

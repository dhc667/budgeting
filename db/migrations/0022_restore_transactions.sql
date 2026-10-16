-- Rebuilt from its latest deletion, which left an entry in each space it touched, so a transfer
-- between spaces comes back with both sides. Refusals carry their reason in the error's detail.
create or replace function public.restore_transaction(transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction uuid := transaction_id;
  deletion public.activity[];
  deleted jsonb;
  restored uuid;
begin
  select array_agg(entry order by entry.id) into deletion
  from public.activity as entry
  where entry.table_name = 'transactions'
    and entry.row_id = transaction
    and entry.action = 'delete'
    and entry.changed_at = (
      select max(changed_at) from public.activity
      where table_name = 'transactions' and row_id = transaction and action = 'delete'
    );

  if deletion is null
    or not exists (select 1 from unnest(deletion) as side where public.is_space_member(side.space_id))
  then
    raise exception 'no such deleted transaction in your spaces';
  end if;
  if exists (
    select 1
    from unnest(deletion) as side, jsonb_array_elements(side.old->'postings') as posting
    where posting->>'account_kind' = 'opening_balance'
  ) then
    raise exception 'an opening balance comes back by setting it on its account';
  end if;
  if exists (select 1 from unnest(deletion) as side where not public.is_space_member(side.space_id)) then
    raise exception 'only a member of both spaces can restore a transfer between them'
      using detail = 'other_space';
  end if;
  -- Deleting a space takes its activity along, and the accounts that held its side of the transfer.
  if cardinality(deletion) = 1 and (deletion[1]).old ? 'other_space' then
    raise exception 'an account it used was deleted' using detail = 'account_deleted';
  end if;

  deleted := (deletion[1]).old;
  insert into public.transactions (id, date, title, note, created_by, created_at)
  values (
    transaction,
    (deleted->>'date')::date,
    deleted->>'title',
    deleted->>'note',
    (deleted->>'created_by')::uuid,
    (deleted->>'created_at')::timestamptz
  )
  on conflict (id) do nothing
  returning id into restored;

  if restored is null then
    raise exception 'that transaction exists already' using detail = 'exists';
  end if;
  insert into public.postings (id, transaction_id, ledger_account_id, currency, amount)
  select
    (posting->>'id')::uuid,
    transaction,
    public.restored_ledger_account(posting),
    posting->>'currency',
    (posting->>'amount')::bigint
  from unnest(deletion) as side, jsonb_array_elements(side.old->'postings') as posting;

  perform public.log_transaction_changes(
    transaction, 'restore', '{}', public.snapshots_by_space(transaction)
  );
end;
$$;
--> statement-breakpoint
-- An archived account still takes back what it had. A deleted category's transactions moved to
-- another, so a restored one goes where it would be had it never been deleted.
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
grant execute on function public.restore_transaction(uuid) to authenticated;

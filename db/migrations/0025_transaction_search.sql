create extension if not exists unaccent with schema extensions;
--> statement-breakpoint
-- Unchanged but for search_text, title and note without accents, which searches match against so
-- that "cafe" finds "Café". A newline between them, which a search box can't hold, keeps a search
-- from matching across the two.
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
  extensions.unaccent(concat_ws(E'\n', transactions.title, transactions.note)) as search_text
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
-- Not is_opening_balance(): a function Postgres can't inline would run for every transaction read,
-- where this looks the opening balances up once.
where transactions.id not in (
  select postings.transaction_id
  from public.postings
  join public.ledger_accounts on ledger_accounts.id = postings.ledger_account_id
  where ledger_accounts.kind = 'opening_balance'
);
--> statement-breakpoint
-- The latest transaction of each title, one per category, or per pair of accounts for a transfer,
-- so that picking a title fills in the rest the way it was last time.

-- Stale: more than a week older than the newest rate in the table, not than today, so a week
-- without anyone opening the app doesn't make every rate stale.
create or replace function public.latest_exchange_rates()
returns table (currency text, date date, rate numeric, stale boolean)
language sql
stable
set search_path = ''
as $$
  select latest.currency, latest.date, latest.rate, latest.date < newest.date - 7
  from (
    select distinct on (rates.currency) rates.currency, rates.date, rates.rate
    from public.exchange_rates as rates
    order by rates.currency, rates.date desc
  ) as latest
  cross join (select max(date) as date from public.exchange_rates) as newest;
$$;
--> statement-breakpoint
-- Two clients saving the same day at once is normal, so rates already stored are left as they are.
-- Rows for currencies whose rates the owner loads by hand are skipped without complaint: clients
-- send whole batches.
create or replace function public.save_exchange_rates(rates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_to_recordset(rates) as incoming(date date, currency text, rate numeric)
    where incoming.date > public.latest_today()
  ) then
    raise exception 'an exchange rate can''t be dated in the future';
  end if;

  -- Without the lock, loading a currency by hand could commit between the check below and the
  -- insert, leaving fetched rows beside the loaded ones.
  perform 1 from public.currencies
  where code in (
    select incoming.currency
    from jsonb_to_recordset(rates) as incoming(date date, currency text, rate numeric)
  )
  for share;

  insert into public.exchange_rates (date, currency, rate)
  select incoming.date, incoming.currency, incoming.rate
  from jsonb_to_recordset(rates) as incoming(date date, currency text, rate numeric)
  join public.currencies on currencies.code = incoming.currency
  where not currencies.rates_by_hand
  on conflict do nothing;
end;
$$;
--> statement-breakpoint
create or replace function public.stored_exchange_rate_ranges()
returns table (currency text, first_date date, last_date date)
language sql
stable
set search_path = ''
as $$
  select rates.currency, min(rates.date), max(rates.date)
  from public.exchange_rates as rates
  group by rates.currency;
$$;
--> statement-breakpoint
-- Any client may record one, as with rates; checked_on is the database's, so a wrong one is
-- trusted only until it's due for checking again.
create or replace function public.record_exchange_rate_history_starts(rate_provider text, starts jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.exchange_rate_history_starts (provider, currency, starts_on, checked_on)
  select rate_provider, incoming.currency, incoming.starts_on, current_date
  from jsonb_to_recordset(starts) as incoming(currency text, starts_on date)
  join public.currencies on currencies.code = incoming.currency
  on conflict (provider, currency) do update
  set starts_on = excluded.starts_on, checked_on = excluded.checked_on;
$$;
--> statement-breakpoint
create or replace function public.check_display_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_currency <> 'USD' and not exists (
    select 1 from public.latest_exchange_rates() as latest
    where latest.currency = new.display_currency and not latest.stale
  ) then
    raise exception 'the display currency needs a recent exchange rate'
      using detail = 'no_recent_rate';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
-- On update only: signup's default of USD must work on an instance that has no rates yet.
create trigger check_display_currency
before update of display_currency on public.profiles
for each row
when (new.display_currency is distinct from old.display_currency)
execute function public.check_display_currency();
--> statement-breakpoint
grant select on public.exchange_rates, public.exchange_rate_history_starts to authenticated;
--> statement-breakpoint
grant execute on function
  public.latest_exchange_rates(),
  public.stored_exchange_rate_ranges(),
  public.save_exchange_rates(jsonb),
  public.record_exchange_rate_history_starts(text, jsonb)
to authenticated;

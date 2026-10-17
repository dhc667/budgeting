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
create or replace function public.save_exchange_rates(
  rate_dates date[],
  rate_currencies text[],
  rate_values numeric[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(rate_dates) as rate_date where rate_date > public.latest_today()) then
    raise exception 'an exchange rate can''t be dated in the future';
  end if;

  insert into public.exchange_rates (date, currency, rate)
  select incoming.* from unnest(rate_dates, rate_currencies, rate_values) as incoming(date, currency, rate)
  join public.currencies on currencies.code = incoming.currency
  where not currencies.rates_by_hand
  on conflict do nothing;
end;
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
    raise exception 'the display currency needs a recent exchange rate';
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
grant select on public.exchange_rates to authenticated;
--> statement-breakpoint
grant execute on function
  public.latest_exchange_rates(),
  public.save_exchange_rates(date[], text[], numeric[])
to authenticated;

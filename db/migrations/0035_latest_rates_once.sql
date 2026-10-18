-- A currency's latest rate is looked up once per currency, not once per rate: per rate, the first
-- pull of an instance holding years of rates took seconds.
create or replace function public.changes_since(since bigint, held_currencies text[])
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
  newly_used_currencies text[] := array(
    select unnest(used_currencies) except select unnest(held_currencies)
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
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I as t where %s',
      synced_table,
      case synced_table
        when 'exchange_rates' then
          '(t.version >= $1 and (t.currency = any ($2) or (t.currency, t.date) in (
              select currency.code, latest.date
              from public.currencies as currency
              cross join lateral (
                select rate.date from public.exchange_rates as rate
                where rate.currency = currency.code
                order by rate.date desc
                limit 1
              ) as latest
            )))
            or t.currency = any ($3)'
        else 't.version >= $1'
      end
    ) into found_rows using from_version, used_currencies, newly_used_currencies;
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

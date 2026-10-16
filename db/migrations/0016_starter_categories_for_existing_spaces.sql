-- In their creator's language, English when that's Automatic. A shared space's creator is whoever
-- the activity record says created it.
with creators as (
  select
    spaces.id,
    spaces.created_at,
    coalesce(
      spaces.private_owner,
      (
        select changed_by from public.activity
        where table_name = 'spaces' and row_id = spaces.id and action = 'insert'
      )
    ) as creator
  from public.spaces
)
insert into public.ledger_accounts (space_id, kind, name, icon, color, created_at)
select creators.id, starter.kind, names.name, starter.icon, starter.color, creators.created_at
from creators
left join public.profiles on profiles.id = creators.creator
cross join public.starter_categories as starter
join public.starter_category_names as names
  on names.starter_category_id = starter.id and names.language = coalesce(profiles.language, 'en');

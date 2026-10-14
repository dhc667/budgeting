# Drizzle defines the schema; supabase-js does the runtime queries

The Drizzle schema is the single source of truth for tables and Row Level Security policies, and drizzle-kit generates and applies migrations. The browser can't use Drizzle at runtime, because a static app can't hold a Postgres connection, so the app reads and writes through supabase-js, typed with `supabase gen types` run against the migrated database.

Drizzle has no schema API for triggers or Postgres functions, so those (the posting-balance check, the audit trail, category reassignment, invite redemption) live in hand-written `drizzle-kit generate --custom` migrations, applied by the same `drizzle-kit migrate`.

## Considered options

- **Plain SQL migrations**: rejected because the schema would be spread across files with no typed definition.
- **Drizzle at runtime behind Edge Functions**: rejected because it adds a server tier to an app that is otherwise static.

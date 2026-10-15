# Budgeting

A family budgeting PWA. The app is static and hosted on GitHub Pages; each family runs its own
Supabase project, and phones connect to it by scanning an invite QR code. See `GLOSSARY.md` for the
vocabulary and `docs/adr/` for why it's built this way.

## Setting up your family's instance

You need a free [Supabase](https://supabase.com) account and this repository cloned, with Node (see
`.node-version`) and pnpm. Run every command from the repository's folder.

1. Install the dependencies and sign the Supabase CLI in to your account:

   ```bash
   pnpm install
   pnpm exec supabase login
   ```

2. Create a Supabase project in the region closest to your family, from the dashboard or with
   `pnpm exec supabase projects create`. Keep its database password; step 3 needs it.
3. Copy `.env.instance.example` to `.env.instance` and fill it in. Keep `.env.instance` private:
   its secret key and database URL give full access to your family's data.
   - `pnpm exec supabase projects api-keys --project-ref <ref> --reveal` prints the keys. Without
     `--reveal`, the secret key comes back masked and the instance commands fail with "Invalid API
     key".
   - For `DATABASE_URL`, copy the **Session pooler** string from the dashboard's **Connect** dialog,
     put the database password in it, and add `?sslmode=require` so the connection is encrypted.

4. Create the tables:

   ```bash
   pnpm run instance migrate
   ```

5. Apply the auth settings: email confirmation off (invite codes are the gate, and no email is ever
   sent), the invite check that turns a bad code into a readable message, and an 8-character
   password minimum.

   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase config push
   ```

   Answer **y** to the auth prompt and **n** to the others: the rest of `supabase/config.toml`
   describes local development. This step has to come after `migrate`, because the invite check is
   a function the migrations create.

6. Invite someone, yourself included:

   ```bash
   pnpm run instance invite
   ```

   Scan the QR code with a phone camera. The code works once and expires after 24 hours
   (`--expires <hours>` to change that).

Other commands: `link` prints a QR that connects another device to sign in, without an
invite; `reset-password <email>` gives a user a temporary password. Run `pnpm run instance --help` for
details. Users created from the Supabase dashboard are refused, since they have no invite code.

After pulling a new version, run `migrate` again: the app refuses to open on a database older than
itself.

## Backups

Supabase's free plan keeps no downloadable backups, so this is your family's only protection
against a dropped table or a lost project. Run it regularly:

```bash
pnpm run instance backup
```

It writes `backup-<date>.sql` in the current folder (`-2`, `-3` and so on for further backups the
same day) and never overwrites a file. The backup holds the app's data and everyone's sign-in
records, password hashes included, so keep the files somewhere safe and private. It needs
`pg_dump` and `psql` version 17 or newer, which come with the PostgreSQL client tools: `pg_dump`
refuses a database newer than itself, and Supabase runs PostgreSQL 17.

Free Supabase projects pause after a week without use, and a project left paused long enough is
deleted. Open the app now and then, and keep a recent backup.

### Restoring

1. Create a new Supabase project and repeat the setup steps that live outside the database: the
   keys and `DATABASE_URL` in `.env.instance` (step 3) and the auth settings with the signup hook
   (step 5, `supabase link` and `config push`).
2. Do **not** run `migrate`. A restore needs a fresh project and refuses one that already has
   tables or users.
3. Load the backup:

   ```bash
   pnpm run instance restore backup-<date>.sql
   ```

   The first line of a backup records the schema version it was taken at. The restore migrates a
   fresh project to that version, loads the data in a single transaction, then migrates to the
   current version, so a backup from an older version of the app ends up on the current schema. A
   backup from a newer version is refused: update the app first. If the load fails, the project now
   has a schema but no data and a retry is refused as not fresh, so create another project.

If the CLI can't be used, a backup is still plain SQL data. Check out the app version whose
migrations match the number on the backup's first line, run `pnpm run instance migrate` on a fresh
project, then load it with `psql`:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --command "DO \$\$ BEGIN EXECUTE (SELECT 'TRUNCATE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') FROM pg_tables WHERE schemaname = 'public'); END \$\$" \
  --file backup-<date>.sql "<DATABASE_URL>"
```

Devices keep their connection to the old project, so scan a new `invite` or `link` QR on each one.

## Development

Local development runs a Supabase stack in Docker.

```bash
pnpm install
pnpm db:start   # starts Supabase, writes .env.instance.local, applies migrations
pnpm dev
pnpm run instance invite --env .env.instance.local   # open the printed link to sign up
```

The `--env` file decides which instance a command acts on: `.env.instance.local` is the local
stack, and without `--env` it is your family's real instance in `.env.instance`. Changes to
`supabase/config.toml` reach the local stack after `pnpm db:stop && pnpm db:start`.

Schema changes go in `db/schema.ts`; then run `pnpm db:generate` to write the migration and
`pnpm db:types` to refresh `src/supabase/database.types.ts`. Triggers and functions go in custom
migrations (`pnpm db:generate --custom --name <name>`), and so do the grants that let the app reach a
new table or function: nothing in `public` is reachable without one. Never edit or squash a
migration once it is on `main`, and regenerate yours after rebasing onto new ones.

Checks:

```bash
pnpm check              # format, lint, typecheck, knip, unit tests; changes nothing
pnpm fix                # formats and applies lint autofixes; review the diff
pnpm test:integration   # needs pnpm db:start
```

`pnpm install` sets up a pre-commit hook that runs `pnpm check` on a snapshot of exactly what is
staged (kept as a worktree in `.git/staged-snapshot`), so a passing hook means the commit passes,
whatever else is in your working tree. It never edits files; run `pnpm fix` yourself.

Changes reach `main` through pull requests, which must pass `pnpm check`, the build and the
integration tests against a fresh local Supabase. Every push to `main` runs the same checks and, if
they pass, deploys to GitHub Pages.

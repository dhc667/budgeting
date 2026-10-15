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

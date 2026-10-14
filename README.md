# Budgeting

A family budgeting PWA. The app is static and hosted on GitHub Pages; each family runs its own
Supabase project, and phones connect to it by scanning an invite QR code. See `GLOSSARY.md` for the
vocabulary and `docs/adr/` for why it's built this way.

## Setting up your family's instance

You need a free [Supabase](https://supabase.com) project and this repository checked out, with
Node (see `.node-version`) and pnpm.

1. Create a Supabase project.
2. In **Authentication > Sign In / Providers > Email**, turn off **Confirm email**. Invite codes are
   the gate, and no email is ever sent.
3. Copy `.env.owner.example` to `.env.owner` and fill it in from the project's settings. Keep
   `.env.owner` private: its secret key and database URL give full access to your family's data.
4. Create the tables:

   ```bash
   pnpm --dir /home/dhc/Work/Personal/budgeting run owner migrate
   ```

5. In **Authentication > Hooks**, add a **Before User Created** hook of type **Postgres** that calls
   `public.check_invite_code`. This turns a bad invite into a readable message; signups without a
   valid code are refused either way.
6. Invite someone, yourself included:

   ```bash
   pnpm --dir /home/dhc/Work/Personal/budgeting run owner invite
   ```

   Scan the QR code with a phone camera. The code works once and expires after 24 hours
   (`--expires <hours>` to change that).

Other owner commands: `link` prints a QR that connects another device to sign in, without an
invite; `reset-password <email>` gives a user a temporary password. Run `pnpm run owner --help` for
details. Users created from the Supabase dashboard are refused, since they have no invite code.

After pulling a new version, run `migrate` again: the app refuses to open on a database older than
itself.

## Development

Local development runs a Supabase stack in Docker.

```bash
pnpm install
pnpm db:start   # starts Supabase, writes .env.owner.local, applies migrations
pnpm dev
pnpm run owner invite --env .env.owner.local   # open the printed link to sign up
```

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

Pull requests run `pnpm check` and the integration tests against a fresh local Supabase. Every push
to `main` runs the same checks and, if they pass, deploys to GitHub Pages.

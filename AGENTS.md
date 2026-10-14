## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Checks

Run `pnpm check` before calling work done, and `pnpm test:integration` (with `pnpm db:start`) when touching the database or the app's screens. `pnpm fix` formats and applies lint autofixes. The pre-commit hook runs `pnpm check` on the staged snapshot and never edits files.

## Migrations

- Never edit, reorder or squash a migration once it is on `main`: families' databases have applied it, and the migrator never looks at it again.
- A new migration must come after every migration on `main`. After rebasing onto a `main` that gained migrations, delete yours and regenerate it; the build refuses a journal that is out of order.
- New tables and functions in `public` are reachable by the app only through explicit grants in a custom migration, on top of RLS.

## Commits

End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and no other attribution lines.

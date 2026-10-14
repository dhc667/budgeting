#!/usr/bin/env bash
# Runs `pnpm check` on exactly what is staged, so a pass means the commit itself passes: unstaged
# edits and untracked files never reach the checks. The snapshot is a persistent worktree, so files
# that didn't change keep their timestamps and the incremental typecheck stays warm.
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
snapshot="$(git rev-parse --path-format=absolute --git-common-dir)/staged-snapshot"

# Uses the hook's GIT_INDEX_FILE, which is the index being committed (also with `commit -a` or paths).
staged_tree=$(git write-tree)
staged_commit=$(git commit-tree "$staged_tree" -m "staged snapshot")

# The snapshot borrows the working tree's node_modules, which was installed from the working tree's
# manifests; those must be the ones being committed.
if ! git -C "$repo" diff --quiet "$staged_commit" -- package.json pnpm-lock.yaml pnpm-workspace.yaml; then
  echo "package.json, pnpm-lock.yaml or pnpm-workspace.yaml differ from what is being committed, so"
  echo "the checks would run against the wrong dependencies. Stage or stash those changes first."
  exit 1
fi
if ! (cd "$repo" && pnpm_config_verify_deps_before_run=error pnpm exec true); then
  echo "node_modules doesn't match the manifests being committed. Run \`pnpm install\` first."
  exit 1
fi

# The snapshot is a separate worktree with its own index; the hook's variables would point it at ours.
unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE

git -C "$repo" worktree prune
if [[ ! -e "$snapshot/.git" ]]; then
  git -C "$repo" worktree add --quiet --detach "$snapshot" "$staged_commit"
else
  git -C "$snapshot" checkout --quiet --force --detach "$staged_commit"
fi
git -C "$snapshot" clean --quiet --force -d
ln -sfn "$repo/node_modules" "$snapshot/node_modules"

cd "$snapshot"
# Dependencies were verified in the working tree above. Here pnpm would see a different directory
# and, by default, reinstall, pointing the shared node_modules at the snapshot.
export pnpm_config_verify_deps_before_run=false
if ! pnpm --silent check; then
  echo
  echo "Checks failed on the staged changes. \`pnpm fix\` fixes formatting and autofixable lint."
  exit 1
fi

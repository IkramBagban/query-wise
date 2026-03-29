<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
follow best practices of next.js
<!-- END:nextjs-agent-rules -->

FOLLOW /docs/ASSIGNMENT.md strictly and given spec.

### Git Safety and Atomic Commit Rules

- Delete unused or obsolete files when your own changes make them irrelevant (refactors, feature removals, etc.).
- Revert files only when the change is yours or explicitly requested.
- Before attempting to delete a file to resolve a local type/lint failure, stop and ask the user for approval.
- Never delete or revert another agent's in-progress work just to silence an error.
- Never edit `.env` or any environment variable files; only the user may change them.
- Coordinate with other agents before removing their in-progress edits.
- Moving/renaming and restoring files is allowed when it does not discard another agent's work.
- Never run destructive git operations unless there is explicit written instruction in this conversation.
- Destructive operations include `git reset --hard`, `rm`, `git checkout`/`git restore` to an older commit, and similar rollback commands.
- Never use `git restore` (or similar commands) to revert files you did not author; coordinate instead.
- Always check `git status` before any commit.
- Keep commits atomic and isolated: commit only the files you touched and pass each path explicitly.
- For tracked files, use: `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`.
- For new files, use: `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`.
- Quote any git paths containing brackets or parentheses so the shell does not treat them as globs or subshells.
- When running rebase, avoid opening editors: export `GIT_EDITOR=:` and `GIT_SEQUENCE_EDITOR=:` (or pass `--no-edit`).
- Never amend commits unless there is explicit written approval in the task thread.
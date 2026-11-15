# Agent Workflow Rules

## 1. No Automatic Local Commits or Remote Pushes
- **Never auto-commit locally**: Do not execute `git commit` automatically. All local commits must be performed manually by the developer unless explicitly requested.
- **Never auto-push remotely**: Do not execute `git push` to any remote (`origin`, `myfork`, or others). All pushes must be performed manually by the developer.
- When changes and verifications are complete, report the modified files and provide a suggested conventional commit message for the developer to run manually.

## 2. Conventional Direct Commit Messages
- Use standard conventional prefixes directly describing the exact changes made:
  - `feat: <description>`
  - `fix: <description>`
  - `docs: <description>`
  - `refactor: <description>`
  - `chore: <description>`
- Strictly no emojis in commit messages, source code, or comments.

## 3. Clean Code Hygiene
- Concise single-line comments only.
- Strictly zero decorative emojis across all source code, comments, and commit messages.

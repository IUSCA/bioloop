# Agent-driven git hook checks

## Purpose

Use this document when an agent (or human) must **run the same checks git hooks enforce**, fix failures, and **repeat until everything passes**—without relying on chat memory for the exact commands.

## Where hooks live

Custom hooks are shell scripts under:

```text
.githooks/pre-commit/
```

| Script | Behavior |
|--------|----------|
| `no-commit-to-main.sh` | Fails if the current branch is `main`. |
| `lint.sh` | Runs **cspell** on staged added/modified files; then runs **ESLint** (via `node_modules/.bin/eslint`) on staged `ui/` and `api/` files matching `vue`, `js`, `jsx`, `cjs`, `mjs`. Exits early if nothing is staged. |

These run on **`git commit`** only if the repository’s Git config points `core.hooksPath` at `.githooks` (or equivalent). If hooks are not installed, run the checks below manually.

## Mandatory linting for agents (UI and API)

**Authoritative lint for agents** is **`npm run lint`** in each service, using that service’s `package.json`:

```bash
# From repository root
(cd ui && npm run lint)
(cd api && npm run lint)
```

Do **not** substitute ad-hoc `eslint` / `npx eslint` for full verification unless you are matching a specific hook failure (the pre-commit script uses ESLint on staged paths only; `npm run lint` is the project’s full lint + auto-fix workflow per service conventions).

**Workers:** no separate lint step is required for agents unless a hook or failure involves worker files (the current `lint.sh` does not run Python/worker linters).

## Spell check

The hook runs **cspell** on staged files. To reproduce broadly:

```bash
npx cspell --no-progress .
```

For staged-only behavior, mirror the hook: pass the staged paths (see `lint.sh`). Project config: `cspell.json`; more context in `docs/tooling/spellcheck.md`.

## Recommended agent loop

1. **Lint (required):** `npm run lint` in `ui/` and `api/`.
2. **Spell (if touching prose/comments/config cspell covers):** run cspell on changed files or the repo as appropriate.
3. **Branch (before commit):** ensure not committing directly to `main` if that rule applies.
4. Read tool output, apply fixes, **repeat from step 1** until all commands exit with status 0.

If `git commit` still fails after that, read the hook script output and fix the specific check it reported.

## Relationship to other docs

- General agent workflow: `.ai/AI_PROTOCOL.md`
- Production restrictions (e.g. no git write unless permitted): `.ai/PRODUCTION_ENVIRONMENT.md` and `.cursorrules`

---

## Document provenance

- **Repository branch when this file was last revised:** `e2e-suite`
- Anyone relying on this doc should confirm their own branch with `git rev-parse --abbrev-ref HEAD` (update the line above when you change this file).

**Last updated:** 2026-03-20

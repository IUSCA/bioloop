---
name: code-review
description: >
  Perform thorough, opinionated code reviews on staged Git changes for projects using JavaScript,
  Express, PostgreSQL, Vue 3, and Tailwind CSS. Use this skill whenever the user asks to "review
  my code", "check my staged changes", "review my diff", "do a PR review", "look at what I've
  changed", or any similar request involving reviewing code before committing or submitting a pull
  request. Also trigger when the user pastes a diff or asks for feedback on a specific file change.
  This skill reads staged content via `git diff --cached`, optionally reads full file context, and
  produces structured, actionable feedback organized by severity.
---

# Code Review Skill

You are an expert code reviewer for a full-stack JavaScript project. Your stack is:

- **Backend**: Node.js, Express.js with **Prisma.js ORM** (no raw SQL queries)
- **Database**: PostgreSQL (via Prisma Client)
- **Frontend**: Vue 3 (Composition API with `<script setup>` required)
- **Styling**: Tailwind CSS
- **Language**: JavaScript (ES modules with module-alias)

---

## Step 1 — Gather the Staged Diff

Run the following command to get staged changes:

```bash
git diff --cached
```

If nothing is staged, also try:

```bash
git diff HEAD
```

If there is still nothing, ask the user to paste their diff or tell you which files to review.

---

## Step 2 — Identify Files and Decide on Full-File Context

From the diff, extract the list of changed files. For each file, decide whether you need full context:

**Always fetch full file** for:
- Files with logic changes that reference functions/variables defined elsewhere in the file
- Vue SFCs (`.vue`) where the diff only touches `<script>` but you need `<template>` context (or vice versa)
- Express route files where middleware chains or exported routers provide important context
- Database migration files or SQL files — always read the full migration
- Any file where the diff is >30% of the file (meaning a lot has changed and context helps)

**Diff-only is sufficient** for:
- Pure style changes (Tailwind class additions, CSS tweaks)
- New standalone files (the diff IS the file)
- Config changes (`.env.example`, `vite.config.js`, `package.json`)
- Trivial renames or string changes

To read a full file:
```bash
cat <filepath>
```

---

## Step 3 — Review by Domain

Apply the review criteria from the relevant reference file(s) for the changed files. Read each reference file that applies:

| Files Changed | Reference File |
|---|---|
| `*.vue`, components, composables | `references/vue3-tailwind.md` |
| `routes/`, `services/`, `middleware/`, Express files | `references/express-backend.md` |
| `prisma/schema.prisma`, migrations, DB query code | `references/postgres.md` |
| `package.json`, `vite.config.*`, `.env*`, CI files | `references/general-js.md` |
| Any JS/TS logic (shared util, helpers, services) | `references/general-js.md` |

You may need to consult multiple reference files for a single PR (e.g., a feature that touches Vue + Express + SQL).

---

## Step 4 — Produce the Review

Structure your output as follows:

### Header
```
## Code Review — <branch or file summary>
<one sentence description of what the change does>
```

### Findings

Group findings into three severity tiers. Only include sections that have findings — omit empty tiers.

```
### 🔴 Critical (must fix before merging)
Issues that introduce bugs, security vulnerabilities, data loss risk, or broken functionality.

### 🟡 Warnings (should fix)
Code smells, performance issues, missing error handling, accessibility gaps, inconsistent patterns.

### 🔵 Suggestions (nice to have)
Style improvements, refactor opportunities, better naming, minor DX enhancements.
```

Each finding should follow this format:
```
**[File: line range]** Short title
> Explanation of the problem and why it matters.
> Suggested fix (show code when it helps).
```

### Summary
```
### Summary
- X critical · Y warnings · Z suggestions
- Overall: [Approve / Approve with comments / Request changes]
- <1-2 sentences on the overall quality and intent of the change>
```

---

## Tone and Style

- Be direct but not harsh. Assume the author is competent.
- Explain *why* something is a problem, not just *that* it is.
- When suggesting a fix, show a short code snippet rather than just describing it.
- Don't nitpick things that are purely stylistic preference without a good reason.
- If the change is small and clean, say so. Don't pad the review.

---

## Edge Cases

- **No staged files**: Tell the user and ask if they want to review a specific file or branch diff.
- **Binary files / lock files**: Skip `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, image files. Mention them briefly as "not reviewed."
- **Prisma migrations**: Most are auto-generated from `schema.prisma` and are generally safe. Focus review on schema changes in `prisma/schema.prisma` for intent, and flag any custom SQL blocks.
- **Generated code**: OpenAPI specs, Prisma Client (in `node_modules`), type definitions — skip detailed review.
- **Tests**: Review test files using the same criteria, but also check: are the right things being tested? Are edge cases covered? Is the test isolated and not mocking required behavior?

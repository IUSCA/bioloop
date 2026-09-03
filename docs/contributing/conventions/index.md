---
title: Conventions
order: 5
---

# Stack Conventions

Per-stack rules that code in this repository is expected to follow, and that code
review checks against.

- [General JavaScript](./general-javascript.md) — correctness, async pitfalls, module conventions
- [Express Backend](./express-backend.md) — thin routes, service layer, middleware ordering
- [PostgreSQL and Prisma](./postgres-prisma.md) — query patterns, migrations, raw SQL safety
- [Vue 3 and Tailwind](./vue3-tailwind.md) — `<script setup>`, auto-imports, styling

These live here rather than under `.github/` deliberately. They are project
conventions, not GitHub configuration, so any developer and any AI agent can read
them regardless of which tooling they use. Tool-specific configuration links to
these pages instead of duplicating them:

- [`.github/skills/code-review/SKILL.md`](https://github.com/IUSCA/bioloop/blob/main/.github/skills/code-review/SKILL.md) reads them when reviewing a diff
- [`.github/copilot-instructions.md`](https://github.com/IUSCA/bioloop/blob/main/.github/copilot-instructions.md) points at them and at the [UI coding standards](../ui-coding-standards.md)

When adding a new convention, put it here and link to it from the tool config.

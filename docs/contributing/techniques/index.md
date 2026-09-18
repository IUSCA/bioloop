---
title: Techniques
---

# Techniques

Operational know-how for working in this repository: the exact commands, the traps, and the
reasoning behind them. Each page is the long form of the agent skill with the same name, at
`.claude/skills/<name>/SKILL.md`. The skill keeps what an agent needs at once. The page holds
the background, the worked examples, and the full tables.

- [API tests](./api-tests.md) — running and writing the Jest suites under `api/tests`
- [Authorization engine](./authorization-engine.md) — how `api/src/authorization` and `api/src/state` behave in practice
- [Dev servers](./dev-servers.md) — the seeded cast, the database, and process details for automated sessions
- [End-to-end tests](./e2e-tests.md) — how the Playwright suite in `e2e/` builds its world and asserts refusals
- [Prisma schema changes](./prisma-schema-changes.md) — hand-written migrations, defaults, views, and seeds
- [v1 and v2 coexistence](./v1-v2-coexistence.md) — telling the legacy and v2 halves apart, and keeping them apart
- [v2 UI changes](./v2-ui-changes.md) — verifying UI claims in the running app, and editing many `.vue` files safely
- [Workers](./workers-dev.md) — running the Python workers locally under pm2

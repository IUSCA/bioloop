---
title: API
order: 1
---

# API

- [Introduction](./introduction.md)
- [Core](./core/) — configuration, validation, error handling, lifecycle, cluster, cron
- [Data](./data/) — Prisma, audit logs, optimistic locking
- [Security](./security/) — authentication, authorization, signup
- [Performance](./performance/) — instrumentation and Node.js metrics
- [Integrations](./integrations/) — Swagger / OpenAPI

## express-validator API dump

Request validation uses [express-validator](https://express-validator.github.io/docs/).
A plain-text dump of its `ValidationChain` API is vendored at
[`docs/reference/api/express-validator/`](https://github.com/IUSCA/bioloop/tree/main/docs/reference/api/express-validator)
so that a chain method's behaviour can be checked from inside the repo. It is a snapshot,
not authoritative — see [Request Validation](./core/validation.md) for how the project
uses it.

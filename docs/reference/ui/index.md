---
title: UI
order: 2
---

# UI

- [Overview](./overview.md) — project layout, routing, auth, and conventions
- [Auth Explained](./auth-explained.md)
- [Utility Components](./util-components.md) — in-house reusable components
- [Components](./components/key-value-editor.md) — per-component documentation

## Vuestic API dumps

The UI builds on [Vuestic](https://vuestic.dev/). Plain-text API dumps for the
components we lean on most are kept in the repository at
[`docs/reference/ui/vuestic/`](https://github.com/IUSCA/bioloop/tree/main/docs/reference/ui/vuestic)
so that both developers and AI agents can consult a component's props, slots, and
events without leaving the repo: `va-input`, `va-pagination`, and `va-switch`.

They are vendored snapshots, not authoritative — check [vuestic.dev](https://vuestic.dev/)
when a detail matters.

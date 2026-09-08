---
title: Design
order: 5
---

# Design Records

::: warning Not a description of the running system
Pages in this section record **intent**, not shipped behavior. Some are being
built right now, some are only sketches, and some describe things that will
never exist. For how the system actually works, see [Reference](/reference/).
:::

Every page here carries a `status` and an `implemented` marker in its
frontmatter, and repeats them in a banner at the top.

| `status` | Meaning |
|---|---|
| `active` | Being designed or built right now. Expect churn. |
| `accepted` | Decided and built. Kept for the reasoning, not as a how-to. |
| `superseded` | Replaced by a newer record, which it links to. |
| `idea` | Nobody has committed to this. May never be built. |
| `abandoned` | Considered and deliberately rejected. |

| `implemented` | Meaning |
|---|---|
| `none` | No code exists. |
| `partial` | Some of it has shipped; the document may describe more than the code does. |
| `shipped` | The code matches this document. |

## Active work

- [Hierarchical groups, collections, and access control](./groups/design.md) — `active`, partially shipped
- [Access presets](./groups/access-presets.md) — `active`, partially shipped
- [Group use cases](./groups/use-cases.md) — `active`
- [Group invitations](./groups/invitations.md) — `active`, not started
- [UI information architecture](./groups/ui-information-architecture.md) — `active`, partially shipped
- [Trust and communication](./groups/trust-and-communication.md) — `active`, not started
- [Domain glossary](./groups/glossary.md)
- [Groups implementation status](./groups/implementation-status.md) — code map and gap register for the design records above
- [Groups design review](./groups/design-review.md) — an independent review that argues with the records above. Nothing in it has been decided.

## Ideas

Nothing in [ideas](./ideas/) has been committed to.

## Working with this section

A design record graduates in one of three directions:

1. **It ships.** Set `status: accepted` and `implemented: shipped`, then write a
   *separate* page under [Reference](/reference/) describing the resulting
   behavior. Do not turn the design record into the reference page — the
   reasoning and the description have different readers and different lifespans.
2. **It is replaced.** Set `status: superseded` and point `superseded_by` at the
   replacement. Delete it outright if it holds no reasoning worth keeping; git
   history is enough for the rest.
3. **It is dropped.** Set `status: abandoned` and add a sentence saying why. This
   is the most valuable state of all, and the easiest one to skip.

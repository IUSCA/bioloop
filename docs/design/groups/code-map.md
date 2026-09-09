---
title: Code Map
order: 4
status: reference
last_verified: 2026-09-09
---

::: warning Where the code is, not what it does
This page maps each concept in the [groups design](./design.md) onto the code that
implements it. It exists so nobody has to re-read the repository to answer "where is this?".

For **how the system works**, read [Design](./design.md). For **why it is shaped that way**,
read [Decisions](./decisions.md). For **what users need and what is still missing**, read
[Use Cases](./use-cases.md).

It is a snapshot. Re-verify against `api/prisma/schema.prisma`, `api/src/authorization/`, and
`api/src/services/` before relying on any line here.
:::

# Groups — Code Map

## Code map

| Design concept | Schema | API surface | Service | UI |
|---|---|---|---|---|
| Group + hierarchy | `group`, `group_closure` | `routes/groups.js` | `services/groups.js` | `pages/v2/groups/`, `components/v2/groups/` |
| Membership + roles | `group_user` (validity columns), `GROUP_MEMBER_ROLE`, view `active_group_user` | `/groups/:id/members`, `/admins/:userId` | `services/groups.js` | `GroupMembersTab.vue` |
| Membership transitivity | view `effective_user_groups` over `active_group_user` | — | `hydrators/user.js` → `effective_group_ids` | — |
| Oversight visibility | view `effective_user_oversight_groups` | — | `hydrators/user.js` → `oversight_group_ids` | — |
| Collections | `collection`, `collection_dataset` (validity columns), view `active_collection_dataset` | `routes/collections.js` | `services/collections.js` | `pages/v2/collections/` |
| Grants | `grant`, `grant_access_type`, view `valid_grants` | `routes/grants.js` | `services/grants/` | `components/v2/grants/` |
| Grant presets | `grant_preset`, `grant_preset_item` | `/grants/presets` | seeded from `src/constants.js` | `useGrantPresets.js` |
| Access requests | `access_request`, `access_request_item` | `routes/access_requests.js` | `services/access_requests/` | `pages/v2/access-requests/` |
| Audit | `authorization_audit` (monthly partitions) | `routes/audit.js` | `services/audit.js`, `authorization/builtin/audit/` | `pages/v2/audit-logs.vue` |
| ABAC engine | — | `authorize()` middleware | `authorization/core/`, `authorization/builtin/policies/` | capability flags on responses |
| System principals (`Public`, `Authenticated Users`) | seeded rows + DB rules, in the 2026-03-02 and `20260908020000_public_principal` migrations | both selectable as grant subjects | `services/grants/helpers.js` | `SubjectSelector.vue`, `GroupIcon.vue` |
| Access type implication | `grant_access_type_implication`, seeded from `constants.js` | closure built once at startup, read at both grant-check sites | `services/grants/accessTypeClosure.js`, `services/grants/helpers.js` | — |
| Restriction layer | `restriction`, `restriction_type`, `effective_restriction` view | checked before every policy, filters capabilities | `authorization/builtin/restrictions.js`, `services/restrictions.js` | archive and unarchive dialogs |
| Platform admin | — | one engine check ahead of every action policy | `authorization/index.js`, `authorization/core/middlewares.js` | `PLATFORM ADMIN` caller-role badge |
| Owning-group grant | seeded `grant` row per resource, `SYSTEM_BOOTSTRAP` | written with the resource, backfilled for older rows | `services/grants/issue.js`, `services/collections.js`, `services/datasets_v2/create.js` | listed in the Access tab like any grant |
| Attribution | `dataset_funding`, `dataset_affiliation` | none yet | `services/datasets_v2/attribution.js` | none yet |
| Consent codes | `dataset_use_condition` | accepted by `POST /v2/datasets` as `use_conditions` | `services/datasets_v2/useConditions.js` | none |
| Dataset creation | `dataset.owner_group_id`, `dataset.create_method` | `POST /v2/datasets`, `POST /v2/datasets/bulk` | `services/datasets_v2/create.js` | none yet |
| Scanned ingestion | `registration.ingestion` config, `create_method: 'SCAN'` | `POST /v2/datasets/bulk`, one authorization check per distinct group | `workers/workers/services/registration_v2.py`, `workers/workers/scripts/watch_v2.py` | — |
| Ownership transfer | `authority_transfer` **(table only)** | none | none | none |
| Invitations | `group_invitation`, `INVITATION_STATUS`, partial unique index on `(group_id, invited_email) WHERE status = 'PENDING'` | `/groups/:id/invitations`, `POST /auth/invite/check` and `/apply` | `services/invitations/` | `pages/invite.vue`, `GroupInvitationsTab.vue`, `AddGroupMemberModal.vue` |
| Invitation email | — | — | `notification/types.js` `TYPES.INVITE`, `notification/templates/invite.mjml.hbs`, `services/invitations/notify.js` | — |
| Lifecycle hooks | — | — | `services/hooks/` — a generic `USER_CREATED` registry `createUser` runs, wired in `services/hooks/subscribers.js` | — |

Key entry points:

- Policy definitions: [api/src/authorization/builtin/policies/](https://github.com/IUSCA/bioloop/tree/main/api/src/authorization/builtin/policies) — one file per resource type.
- Effective-access SQL: [api/src/services/grants/helpers.js](https://github.com/IUSCA/bioloop/blob/main/api/src/services/grants/helpers.js) — the `subjects ∪ resources` CTE pattern that unions direct user grants, group grants via closure, collection grants, and both system principals.
- Views and constraints: [the 2026-03-02 migration](https://github.com/IUSCA/bioloop/blob/main/api/prisma/migrations/20260302211516_hierarchical_groups_collections_and_data_access/migration.sql) — `effective_user_groups`, `effective_user_oversight_groups`, `valid_grants`, the `grant_no_overlap` GiST exclusion constraint, and the system-principal protection rules.

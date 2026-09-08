---
title: Decisions
order: 10
status: active
last_verified: 2026-09-08
---

::: tip A decision record
Nine questions raised by the [design review](./design-review.md) and collected in the
[use cases](./use-cases.md) were settled on 2026-09-08. This page records what was decided
and why. It supersedes the open-question wording in those pages.
:::

# Groups — Decisions

## Context

One person has asked for this work: a research-center head who wants group-based data
sharing on top of Bioloop, without having specified what they want in detail. The plan is
to ship a small first release and learn from real use.

That plan puts the risk in the foundation rather than in the feature set. A wrong feature
gets deleted. A wrong data model gets migrated, and a capability that was foreclosed never
arrives at all. Every decision below was taken on that basis: build the minimum, but do not
foreclose what the anticipated use cases will need.

---

## 1. Membership and collection history are preserved

**Decision.** `group_user` and `collection_dataset` gain validity columns, and rows are
closed rather than deleted.

Removing a member was a `DELETE`, and `group_user` carried `assigned_at` and `assigned_by`
with no `removed_at`. Removing a dataset from a collection was the same. Effective access
has three inputs, and two of them were being destroyed.

The consequence was that "who could read this dataset on 1 March?" had no query behind it.
Grants survive, so one third of the answer survived. This is the only decision here where
delay is not recoverable: every removal that happened before the change is gone, and no
later migration reconstructs it.

**Also decided:** `group_user` gains `valid_until` at the same time, and
`effective_user_groups` filters expired memberships out. Nothing sets it yet. It is
included because membership expiry sits on the hot authorization path, which is the
expensive place to retrofit, and because it makes the visiting-collaborator case a service
change rather than a migration.

## 2. Every dataset has an owning group

**Decision.** `dataset.owner_group_id` becomes `NOT NULL`. Datasets that have no owning
group are moved into a seeded, archived system group before the constraint is applied.

A nullable owning group means a dataset that no group governs, which falls outside the
ownership-based authorization path entirely. The problem grows with every dataset created.

The quarantine group is a deliberate exception to the project's preference for refusing
rather than defaulting, and the exception is limited to the migration. A migration cannot
ask a human what each row should be, and the alternative — blocking it until every row is
assigned by hand — stops the constraint landing at all. A live creation call can ask, so
creating a dataset without an owning group is refused rather than quarantined. Otherwise
the list grows on its own and nobody is accountable for draining it.

The group is archived and has no members, so only platform admins reach it, and its
contents are a list somebody works through rather than a silent default that gets
forgotten.

## 3. A public principal exists, and `Everyone` is renamed

**Decision.** Add a second system principal for people who are not logged in. Rename the
existing principal from `Everyone` to `Authenticated Users`, keeping its UUID.

`Everyone` currently means every authenticated user. Once a public principal exists, a
principal named `Everyone` that excludes the public is a trap, and it appears in the grant
subject picker where an admin reads it literally. The UUID does not change, so existing
grants and audit records keep resolving.

**Scope for this pass:** the principal exists, is protected from modification the same way
`Authenticated Users` is, is selectable as a grant subject, and the effective-access SQL
honours it. Every route still requires authentication. Serving pages to people who are not
logged in is a separate piece of work, because it needs an unauthenticated path through the
middleware, rate limiting, and a decision about what metadata is safe to expose.

The reason for doing the foundation half now is that retrofitting a second principal into
every zero-default query later is the expensive move. Adding the row is not.

## 4. Roles stay an enum

**Decision.** `GROUP_MEMBER_ROLE` remains a database enum. Membership and governance
authority are not modelled as grants.

The alternative was to make groups a resource type and express membership and admin
authority as grant rows, which would make a new role a seed entry, let membership expire, and let ownership transfer and join requests reuse the access-request machinery.
It was rejected as too large a change for the first release.

The cost is that a third role — a steward, a reviewer, a delegated approver — needs an enum
migration plus an edit in every policy file. Decision 1 removes the other half of the cost,
because validity columns give membership an expiry without the row-based model.

## 5. Collections stay single-owner

**Decision.** A collection may only hold datasets owned by its own group. This does not
change.

The alternative was to let a collection span groups, so it could be a cross-lab release, a
grant-wide bundle, or a center catalogue. That requires either a co-signature from each
owning group at grant time or a rule that a collection grant confers access only to the
datasets whose owner authorized it. Both are intricate, and the project prefers dropping a
feature over intricate code.

**What replaces it.** A separate concept, added later, that describes a set of datasets
without being an authorization container. It has no grants, confers no access, and may span
groups freely, because nothing follows from membership in it. Naming and design are
deferred until something needs it.

**Consequence to record:** the argument in design.md that collections are "symmetric to
groups" advertises a capability the system does not have, and the one-grant-instead-of-nine
example describes a case a single-owner collection cannot reach. That argument should be
corrected rather than kept.

## 6. Restrictions compose by AND; grants stay additive

**Decision.** Add a restriction layer evaluated before grants. A restriction is a row
attached to a resource or a group that blocks an action. It never cancels a grant and never
references one.

```
allowed = no restriction blocks this  AND  some grant permits it
```

Negative grants were rejected. Subtraction breaks the property that makes the model
explainable: one grant is one fact, and access is their union. With subtraction, evaluation
order matters, two admins can produce a state neither intended, and answering "why can I not
read this?" needs the full ordered list rather than one row.

The AND layer has the opposite properties. Order does not matter, because AND commutes.
Adding a restriction can only narrow access, so it cannot surprise somebody with access they
did not have. Both Synapse and Terra converged on this shape independently, as Access
Requirements and as Authorization Domains, and neither built negative permissions.

**Scope for this pass:** the table, the evaluation hook, and exactly one restriction type,
`ARCHIVED`. This is a net deletion of design surface. Archiving is currently about thirty
forbidden actions written out in prose, of which three are enforced; under one rule, all of
them hold.

Three properties are settled now because they sit in the evaluation path:

- **The hook goes in with one type.** A policy written against a pure union assumes access
  only grows. Adding the AND later means revisiting every one.
- **Propagation.** A restriction on a group applies to its descendants and to the resources
  it governs. Implemented for `ARCHIVED`, inherited by every later type.
- **Whether a restriction can be lifted is a property of the type, not the row.** `ARCHIVED` is liftable by a
  platform admin. A future agreement-based restriction should not be liftable at all, only
  satisfiable, which is the point Terra makes by never allowing an authorization domain to
  be removed.

**Known tension.** Archiving blocks mutation by anyone; a data use agreement blocks reading
by one person until they have signed. One is a blanket prohibition on writes, the other a
per-subject condition on reads. One table with a type that declares which actions it blocks
covers both, but this is the seam to re-examine when the second restriction type arrives
rather than to design for speculatively now.

## 7. Access types imply one another

**Decision.** Access types carry a partial order, held in a seeded table, and evaluation
closes over it.

```
DOWNLOAD   → READ_DATA → LIST_FILES → VIEW_METADATA
VIEW_SENSITIVE_METADATA → VIEW_METADATA
```

Nothing previously stopped a grant of `DATASET:DOWNLOAD` without
`DATASET:VIEW_METADATA`, which describes a user who may download a dataset they cannot see.
Presets hid this at issue time, but a hand-issued grant sidestepped them, and editing a
preset never repaired grants already issued. A preset is a convention; an order is an
invariant.

It also makes an existing hack honest. `read_data` was implemented as
`userHasGrant('DATASET:LIST_FILES')` inside a policy file, with no `DATASET:READ_DATA` type
seeded — an implication written by hand where nobody would find it.

Three constraints:

- **The order lives in the table, not in code,** so adding an access type never touches the
  engine.
- **The closure is computed once at startup and cached.** The set is small and static, so a
  check costs a set lookup rather than a recursive query.
- **A test asserts the graph is acyclic** and that every seeded access type appears in it.

**Consequence.** Revoking `VIEW_METADATA` from somebody holding `DOWNLOAD` does nothing.
That is more truthful than the previous silent incoherence, and the access explanation gains
one hop: "you can view metadata because you hold download, which implies it."

**Consequence for presets.** Presets stop being load-bearing. They were the only thing
keeping grant sets coherent, and most now collapse to a single access type, so an approval
creates one grant row instead of four.

**Kept strictly separate.** The order only widens what a grant satisfies. Restrictions only
narrow. Mixing them would cost the one-sentence explanation that decisions 6 and 7 both
exist to protect.

## 8. Governance is what "owning group" means

**Decision.** A dataset's owning group decides access and nothing else. Attribution — who to
credit, which grant funded the work — is a separate relationship, designed later.

The glossary says a dataset may be associated with more than one project, lab, or grant. The
design gives every dataset exactly one owning group. Both are true, because they describe
different relationships.

**The requirement this creates now** is negative: `owner_group_id` must never be widened to
carry attribution as well. Separating the two afterwards is the expensive move, and keeping
them separate costs nothing today.

## 9. Consent codes are captured, not enforced

**Decision.** Record machine-readable data use codes on datasets at registration. Nothing
checks them.

Controlled access to human biomedical data has an interoperability stack: GA4GH Passports
for identity and permissions, the Data Use Ontology for the conditions attached to a
dataset, and REMS for the request workflow. Whether Bioloop ever exchanges access decisions
with another institution is undecided, and it does not need deciding yet.

One part cannot wait. The conditions a donor consented to are recorded on a consent form at
collection time, near the people who ran the study, and that information decays as staff
turn over and studies close. Capturing it at ingest is a metadata field. Reconstructing it
later means going through institutional review paperwork study by study.

This is worth doing regardless of GA4GH, because "what did the donor agree to?" is a
question that gets asked about data already held.

**Also decided, at no cost:** do not write code that assumes an approving authority is a
Bioloop user. Grants already snapshot `issuing_authority_id`, which is the right shape. Under
Passports an approval may arrive as a signed claim from elsewhere. Nothing needs building for
this; it only needs not precluding.

**Already correct:** access requests are workflow artifacts and grants are the durable fact.
That is the same split GA4GH makes between REMS and a visa.

---

## What was not decided

**Ownership transfer, reparenting, invitations, and identity federation** remain deferred.
Decision 4 keeps membership as an enum-bearing row rather than a grant, so each of these
stays its own piece of work rather than collapsing into the access-request machinery.

**Serving unauthenticated requests** is deferred by decision 3. The principal exists; the
route path does not.

**The second restriction type** is deferred by decision 6. Only `ARCHIVED` ships.

**Attribution and funding** are deferred by decision 8, constrained only by not overloading
`owner_group_id`.

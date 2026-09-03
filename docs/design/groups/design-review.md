---
title: Design Review
order: 9
status: reference
last_verified: 2026-09-03
---

::: warning An independent review, not a design record
This page argues with the other records in this directory. It was written on
2026-09-03 by reading [design.md](./design.md), [use-cases.md](./use-cases.md),
[access-presets.md](./access-presets.md), [invitations.md](./invitations.md),
[trust-and-communication.md](./trust-and-communication.md), and
[implementation-status.md](./implementation-status.md) against the schema and the
shipped code. Nothing here has been decided. Treat every finding as a question to
answer, not a change to make.
:::

# Groups Design Review

## Verdict

**The core is right, and it should stay.** Grants are durable rows. Hierarchy uses a
closure table. Access starts at nothing, and the query layer enforces that rather than
the UI. Subjects and resources are polymorphic. Audit records are written in the same
transaction as the change they describe. That foundation is sound.

**Four decisions around that core are wrong.** Each one is cheap to change today,
because nothing on this branch has shipped. Each one gets more expensive with every
feature built on top of it.

**The biggest risk is not a design flaw.** Two authorization models run side by side in
the same API, and the authorization work is far ahead of what any user has asked for.
Both are described at the end of this page.

## How to read a finding

Every finding below has the same four parts.

- **The claim** — what the design records say today, with a link.
- **The evidence** — what the schema and the code actually do.
- **Elsewhere** — how a mature system solves the same problem.
- **The change** — what to do, and what it costs.

---

## 1. Governance authority is not a grant, so it cannot be extended

**The claim.** [Grants Are Only For Consumption Actions](./design.md#critical-constraint-grants-are-only-for-consumption-actions)
splits authorization into two planes. Grants say who may *use* data. Ownership plus the
group admin role says who may *control* access. The stated reason is that administrative
delegation "would explode complexity".

**The evidence.** The complexity arrived anyway, on the other side of the split. The
term `isPlatformAdmin` appears in policy definitions 72 times: 26 in
[dataset.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/authorization/builtin/policies/dataset.js),
22 in [group.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/authorization/builtin/policies/group.js),
18 in [collection.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/authorization/builtin/policies/collection.js),
and 6 more elsewhere. Every new action has to remember it. Two known holes are exactly
that mistake, and both are recorded under
[Enforcement holes](./implementation-status.md#enforcement-holes) and
[Deviations](./implementation-status.md#deviations): `GET /audit/records` carries no
authorization at all, and the unarchive route binds to the `archive` policy.

The same rule is also written twice in two languages. `isDatasetOwningGroupAdmin`
evaluates it in JavaScript for a single resource. `ownerGroupIdsOfResourcesAccessibleByUserQuery`
in [helpers.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/services/grants/helpers.js)
evaluates it in SQL for listings. Two copies of one rule will drift.

The deeper cost is that governance authority is not a row. It cannot expire, and it
cannot be delegated, requested, or explained. Several needs already have nowhere to go.
Use case 18 in [use-cases.md](./use-cases.md#_2-2-membership-management) names a
*steward* role, but `GROUP_MEMBER_ROLE` holds only `MEMBER` and `ADMIN`. A third role
means an enum migration plus an edit in every policy file. Ownership transfer needs its
own `authority_transfer` table, which has
[zero lines of code behind it](./implementation-status.md#not-started). Invitations need
a separate 743-line design. A user cannot ask to join a group, even though a user can
ask for access to a dataset.

**Elsewhere.** Google's Zanzibar has exactly one primitive, the relation tuple
`object#relation@subject`. Admin authority is a relation. Group membership is a relation.
Hierarchy is a relation. All the complexity sits in one schema instead of in every policy.

**The change.** Add `GROUP` to `RESOURCE_TYPE`, then model membership and admin authority
as grants: `GROUP:MEMBER`, `GROUP:ADMIN`, and whatever finer capabilities follow. Several
open items then disappear rather than getting built.

- `group_user` is replaced by grants, and `effective_user_groups` reads from `valid_grants`.
- Membership can expire, which covers the visiting collaborator in use case 43.
- Membership history survives, because grants are never deleted. See finding 7.
- "Request to join a group" becomes an ordinary access request.
- [Invitations](./invitations.md) shrink to one job: bind an email to a subject that does
  not exist yet.
- `authority_transfer` becomes a dual-consent access request, and the table can go.
- Roles stop being an enum, so a steward role costs a seed row.

The cost is real and should be stated. The hot authorization path gains a join. A
bootstrap rule is needed for who administers the root group. Platform admin still needs
to short-circuit the engine rather than appear as a term in every policy.

**Decide this before building [invitations](./invitations.md) or ownership transfer,**
because both collapse into it.

---

## 2. Nothing in the model can say "no"

**The claim.** Access is a union of grants, and it is monotonic. No grant means no
access. [Zero-Default Access](./design.md#zero-default-access-for-non-privileged-users)
and [Consumption Actions](./design.md#a-consumption-actions-data-access) both describe
evaluation as a list of ways to say yes.

**The evidence.** The requirements already need a way to say no, and the design has no
primitive for it. [Use cases 45, 46, and 47](./use-cases.md#_3-3-policy-enforcement) ask
for mandatory training, for blocking access despite group membership, and for a
platform-wide freeze. Use case 39 asks for emergency override. The consumption evaluation
order in design.md opens with "Platform overrides (incident freeze)" and then never
models it.

Archiving is the clearest case. [What Archiving Prohibits](./design.md#what-archiving-prohibits)
is a hand-written list of about thirty forbidden actions. Three of them are enforced. The
rest sit open in [Enforcement holes](./implementation-status.md#enforcement-holes). A
list of thirty prohibitions is the branching, special-case shape that the design set out
to avoid.

**Elsewhere.** Two research platforms solved this with a second layer that composes by
AND rather than OR.

- Synapse keeps **Access Requirements** separate from its ACLs. A requirement is a
  condition, such as a terms-of-use click-through or committee approval. It gates
  download regardless of the ACL, and it is inherited down the entity tree.
- Terra uses **Authorization Domains**. A workspace is bound to a set of groups, and a
  user needs workspace access *and* membership of every group in that set. The binding is
  set at creation, and it can never be removed.

Outside research computing, AWS service control policies and permission boundaries play
the same role. They set a ceiling that no grant can exceed.

**The change.** Add one restriction concept that attaches to a resource or a group and is
evaluated before grants. Ship a single kind of restriction first, and make it archiving.
Thirty prose prohibitions collapse into one rule: no mutation is allowed when an archived
group governs the resource. Training and data use agreements
([use cases 45 and 46](./use-cases.md#_3-3-policy-enforcement)), embargo, export control,
and incident freeze then each cost a row rather than a design cycle. Today they are
listed as extensible in
[Extensibility and Future Considerations](./design.md#extensibility-and-future-considerations),
but the extension point does not exist.

---

## 3. Access does not follow data provenance

**The claim.** [Ownership vs Access](./design.md#ownership-vs-access) gives every dataset
exactly one owning group, and grants are issued per resource. Provenance is treated as
metadata. `view_source_datasets` and `view_derived_datasets` are ordinary grant-gated
actions in the dataset policies.

**The evidence.** `dataset_hierarchy` records which dataset was derived from which, and
the platform exists to run pipelines that produce derived datasets. Nothing connects that
table to authorization. A derived dataset receives a fresh `owner_group_id` and fresh
grants. **Nothing stops a derivative of restricted source data from being granted to
`Everyone`.** No design record mentions the problem, and no gap in
[implementation-status.md](./implementation-status.md#gaps) covers it.

**Elsewhere.** Terra made authorization domains permanent, and it made every clone
inherit them, specifically because restricted data leaked through copies. Synapse
inherits access requirements down the entity tree for the same reason.

**The change.** Decide what a derived dataset inherits from its sources. The simplest
honest rule is that restrictions travel and grants do not. That rule needs finding 2
first, so treat this as the first real customer for the restriction primitive. This is
the most domain-specific hole on this page, and it is the one a user is most likely to
be harmed by.

---

## 4. Collections cannot cross group boundaries

**The claim.** [Collections](./design.md#collections) are described as "first-class
authorization containers, symmetric to groups". Groups contain users, collections contain
datasets. [The Expressive Power of Indirection](./design.md#the-expressive-power-of-indirection)
builds its whole argument on that symmetry, and shows one grant replacing nine.

**The evidence.** The symmetry does not hold, in three ways.

- A collection may only hold datasets owned by its own group.
  [Collection Membership Control](./design.md#collection-membership-control) states the
  rule, and [collections.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/services/collections.js)
  enforces it in SQL when datasets are added. So a collection can never be a cross-lab
  release, a grant-wide bundle, a centre catalogue, or a cohort.
- Groups nest and collections do not. There is no collection closure table.
- Collections are assembled by hand. [Use case 50](./use-cases.md#_4-1-scale-and-automation)
  asks for "all datasets in Center X are accessible to Core Y unless marked restricted",
  and no rule-based membership exists.

The one-grant-instead-of-nine argument therefore describes a case the system cannot
reach. The fan-out that matters in practice covers datasets from several labs.

**The change.** Two honest options exist, and the choice is a real trade-off.

1. **Move the invariant to grant time.** Let a collection hold datasets from many groups.
   A grant on the collection then confers access only to the datasets whose owning group
   authorized it, or it requires a co-signature from each owning group. This keeps the
   invariant that no group may share data it does not own.
2. **Keep collections same-owner and say so plainly.** Add the non-authoritative saved
   sets already listed in [Gaps](./implementation-status.md#gaps) for the cross-group
   case. Then remove the indirection argument from design.md, because it advertises a
   capability the system does not have.

Option 2 is the smaller change, and the project prefers dropping a feature over intricate
code. Option 1 is the one that makes collections worth having.

---

## 5. The no-overlap rule does not do what it claims

**The claim.** [No Overlapping Grants](./design.md#critical-constraint-no-overlapping-grants)
forbids two active grants on the same subject, resource, and access type with overlapping
validity. The stated benefits are a clean mental model, deterministic explanations, and
simple revocation. One grant is meant to equal one permission fact.

**The evidence.** The invariant is already false for effective access, and it was false
before presets arrived. Take a user U who belongs to group G. `Grant(U, D, read)` and
`Grant(G, D, read)` are both active and overlapping. The exclusion constraint does not
fire, because `subject_id` differs. Add a collection grant and the `Everyone` principal,
and four concurrent paths to one permission is normal.

The SQL already handles this correctly. `userDatasetsQuery` in
[helpers.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/services/grants/helpers.js)
unions the subject paths and selects distinct access types. **The system's real semantics
is the union of contributing grants.** The constraint forbids overlap at one indirection
path and permits it everywhere else.

The cost of keeping it is large and easy to trace. Supersession exists only because of it,
and supersession is described across a full section of
[access-presets.md](./access-presets.md#_2-8-overlapping-grants-are-resolved-by-supersession-not-rejection):
two cases, a `SUPERSEDED` revocation type, a skipped-grant audit event, and an approval
that intentionally creates nothing. Three of the eight risks in
[trust-and-communication.md](./trust-and-communication.md#where-trust-erodes) follow from
it, and two extra notification events are now owed because of it.

**The change.** Drop the exclusion constraint. Define effective access as the union of
active grants, with the latest `valid_until` winning. Supersession disappears. The
approved item that creates nothing disappears. The explanation becomes "you can read this
through grants #17 and #42", which is more truthful than naming one grant.

Revocation does not get harder. An admin already has to revoke across subject paths today,
because a user grant, a group grant, and a collection grant can all confer the same
access. The three revocation surfaces described in
[access-presets.md](./access-presets.md#_2-7-access-requests-are-workflow-artifacts-only-grants-are-revoked)
are unchanged.

---

## 6. Access types claim to be orthogonal, and the code already disagrees

**The claim.** [Grants are atomic](./design.md#grants-are-atomic) states that `download`
does not imply `read`, and that all access types are orthogonal. Presets exist to hide
the resulting bookkeeping.

**The evidence.** The access types are not orthogonal, and the code says so. In
[dataset.js](https://github.com/IUSCA/bioloop/blob/abac/api/src/authorization/builtin/policies/dataset.js),
`read_data` is implemented as `userHasGrant('DATASET:LIST_FILES')`. That is an implication
written by hand inside a policy, and it is recorded as
[deviation 3](./implementation-status.md#deviations). Nothing prevents a grant of
`DATASET:DOWNLOAD` without `DATASET:VIEW_METADATA`, which describes a user who may
download a dataset they cannot see.

**Elsewhere.** Synapse documents that DOWNLOAD requires READ. GitHub, AWS, and Zanzibar
all define permissions with implication rather than as a flat set.

**The change.** Give access types a partial order, and let evaluation close over it. A
grant of `DOWNLOAD` then satisfies a check for `VIEW_METADATA` without a second row.
[Grant presets](./design.md#grant-presets) become a naming convenience over that order
rather than the only thing keeping grant sets coherent.

---

## 7. Membership history and collection history are deleted

**The claim.** Grants are never deleted, and
[Explainability and Effective Access](./design.md#explainability-and-effective-access)
calls explainability a hard invariant rather than a UI feature.

**The evidence.** Effective access has three inputs, and two of them are hard-deleted.
`group_user` records `assigned_at` and `assigned_by`, and it has no `removed_at`.
Removing a member is a `DELETE`. `collection_dataset` records `added_at` and `added_by`,
and it has no `removed_at`. Removing a dataset is a `DELETE`.

So the question "who could read this dataset on 1 March?" cannot be answered by a query.
The audit table holds the events, and no code replays them.
[Use cases 34, 35, and 52](./use-cases.md#_2-5-auditing-compliance) ask for access
history, for reports to an IRB or a funder, and for historical access preserved across
dataset splits. None of the three is satisfiable today.

The design also contradicts itself here.
[What Archiving Preserves](./design.md#archiving-groups) freezes membership on an
archived group, and gives the reason that unfreezing it "would violate auditability".
Ordinary membership removal destroys the same record on any active group.

**The change.** Give `group_user` and `collection_dataset` the validity shape that
`grant` already has, and stop deleting rows. This is a small migration now. It becomes a
data reconstruction problem later.

---

## 8. Oversight is a privilege nobody granted

**The claim.** [Oversight Visibility](./design.md#oversight-visibility) gives an admin of
any ancestor group read-only visibility over every descendant.
[Reparenting Safety](./design.md#reparenting-safety) explains the purpose: reorganizing
the tree must not move governance authority.

**The evidence.** The design states elsewhere that access exists only when a grant exists.
Oversight is the exception. It is not a row, it cannot be revoked, it does not expire, it
grows automatically as the tree grows, and the overseen group is never told it exists.
[Risk 4 in trust-and-communication.md](./trust-and-communication.md#where-trust-erodes)
already records the human half of this: the overseer sees problems and cannot act, and
the overseen group cannot see who is watching.

The premise is also worth questioning. Reparenting is the scenario oversight is designed
to keep safe, and reparenting has been
[deferred for want of a use case](./implementation-status.md#not-started). A significant
part of the design defends against a reorganization nobody has asked for.

**Elsewhere.** Two coherent positions exist, and the design picked neither cleanly.
Synapse's benefactor chain and GCP's folder hierarchy give parents genuine inherited
authority. Zanzibar-style systems give parents nothing until a relation says otherwise.

**The change.** Pick the second position, because it matches the rest of the design.
Oversight becomes a grantable, revocable, expiring capability on a group. It falls out
for free once groups are resources, so decide finding 1 first.

---

## Questions about the requirements themselves

The findings above assume the requirements are right. Several are not.

**[use-cases.md](./use-cases.md) is a wish list, not a requirements document.** It holds
56 numbered items covering single sign-on provisioning, identity merging, IRB reporting,
export control, and event-driven propagation to downstream systems. Nothing is
prioritized. No item names the person who asked for it. No item has an acceptance
criterion. Sections 3.2 and 4 read as a survey of what enterprise identity products offer.
A document in that shape will keep producing design surface indefinitely. The document
that would settle direction does not exist: who are the first three users, and what five
things do they need this quarter?

**One core assumption has no mechanism behind it.**
[Core assumptions](./use-cases.md#_0-core-assumptions-explicit-so-the-use-cases-make-sense)
says permissions flow transitively "unless explicitly broken". Nothing in the design can
break them. Either build finding 2, or delete the assumption.

**The member-access contradiction is decidable from the model.**
[Deviation 1](./implementation-status.md#deviations) records that design.md says owning
group members can read without a grant in two places, and says the opposite in two others.
The code gives structural access to admins only. If grants are the only source of
consumption rights, the answer is that members get no structural read. Instead, dataset
creation should seed a real grant to the owning group. The default then becomes a visible,
explainable, revocable row, which is the same trick that
[the `Everyone` principal](./design.md#system-principal-everyone) already uses.

**`Everyone` means every authenticated user.** There is no anonymous principal. A research
portal usually ends up wanting public dataset pages, DOIs, and metadata that a search
engine can index. Dataverse, Zenodo, and dbGaP all do. Adding a second system principal is
cheap now. Retrofitting one into every zero-default query is not.

**The glossary and the design disagree about ownership.**
[The glossary](./glossary.md#organizational-entities) says a dataset "can be associated
with more than one project, lab, or grant". [design.md](./design.md#ownership-vs-access)
gives every dataset exactly one owning group. Affiliation and funding attribution have
no model in the schema. They have nowhere to live except the `metadata` column.
[Use case 13](./use-cases.md#_1-3-using-data) asks researchers to cite ownership
correctly, and the data to do that is not there.

**A standard already exists for part of this.** Controlled access to human biomedical data
has an interoperability stack: GA4GH Passports and visas for identity and permissions, the
Data Use Ontology for machine-readable consent codes, and REMS for the request workflow. If
Bioloop will ever exchange access decisions with another institution, the access request
model should be checked against Passports before it hardens. If it will not, that is a
reasonable decision, and it belongs in writing.

---

## The risk that outranks every design flaw

**Two authorization models run at the same time.** The `/v2/datasets` routes go through
the ABAC engine. The `/datasets` and `/projects` routes still mount the older RBAC
`accessControl()` middleware, and `project`, `project_user`, and `project_dataset` remain
in the schema. No document describes how projects become groups and collections.

While both stand, [use cases 11 and 56](./use-cases.md#_1-3-using-data) are false, because
the portal and the API do not agree. Every feature has to be built twice or gated.
[Gaps](./implementation-status.md#gaps) records the legacy routes as one line and calls
them not urgent. This review disagrees. It is the single largest threat to the work
shipping at all.

**The second risk is proportion.** The authorization core runs to roughly 8,300 lines of
API code with about twenty service test files. The most concrete customer need on the
backlog is an ingest schema for whole-slide imaging: 231 images from 77 donors. That work
does not touch authorization. Dataset creation, notifications, and dataset actions are the
features a user would notice, and none of them has started.

---

## What to settle before writing more code

Five changes are cheap on an unshipped branch, and each removes work rather than adding it.

1. **Drop the no-overlap exclusion constraint** and define effective access as a union.
   This deletes supersession, two trust risks, and two notification events. See finding 5.
2. **Stop deleting `group_user` and `collection_dataset` rows.** Give them validity
   columns. This makes explainability true rather than aspirational. See finding 7.
3. **Make platform admin a short-circuit in the engine.** This removes 72 policy terms and
   the class of hole that `GET /audit/records` belongs to. See finding 1.
4. **Seed an explicit owning-group grant when a resource is created.** This settles
   [deviation 1](./implementation-status.md#deviations) in the direction the model already
   points.
5. **Introduce one restriction primitive, and express archiving through it.** See
   finding 2.

Then answer the question that governs everything after it: **are groups resources?** If
they are, do that work before [invitations](./invitations.md) and before ownership
transfer, because both collapse into it. If they are not, write down why, because every
future feature will raise the question again.

Separately, decide how projects migrate to groups. That decision gates the consistency
promise in the use cases, and it doubles the cost of several epics while it stays open.

Then stop working on authorization. Build ingestion until a real user asks for something
the model cannot express.

---

## Sources

- [An Introduction to Google Zanzibar and Relationship-Based Authorization Control](https://authzed.com/learn/google-zanzibar)
- [Synapse access control](https://python-docs.synapse.org/en/latest/explanations/access_control/)
- [How to set up and use a Terra Authorization Domain](https://support.terra.bio/hc/en-us/articles/8527464803739-How-to-set-up-and-use-an-Authorization-Domain)
- [GA4GH Passport standard for digital identity and access permissions](https://www.cell.com/cell-genomics/fulltext/S2666-979X(21)00037-9)

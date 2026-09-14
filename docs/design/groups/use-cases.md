---
title: Group Use Cases
order: 3
status: active
implemented: partial
last_verified: 2026-09-08
---

::: warning Design record — active
Anticipated user needs for the [groups design](./design.md), sorted by what the first
release must contain and by what the design must not foreclose. The questions this page
raised were settled on 2026-09-08 — see [Decisions](./decisions.md). What the design
describes and the code does not is in [What is not built](#what-is-not-built) below. For
where the code lives, read [Code Map](./code-map.md).
:::

# Group Use Cases

## Why this page exists

One person has asked for this work: a research-center head who wants group-based data
sharing on top of Bioloop. They have not said what they want in detail, and they are
unlikely to, because nobody knows what they need from an access model until they have used
one. Better requirements will come from watching a real cohort use a real system.

So the plan is to ship a small first release and learn from it. The risk in that plan is
not building the wrong feature, because a wrong feature can be deleted. The risk is
building the wrong foundation, because a wrong foundation means a migration, a rewrite, or
a capability that can never be added.

**Every item on this page therefore answers two separate questions.** Does it ship in the
first release? And if it does not, does building it later change what already exists? Those
two answers are independent, and the dangerous items are the ones that answer "no" to the
first and "yes" to the second.

---

## How to read this page

**Numbers are permanent identifiers, not an order.** Item 43 stays item 43 forever, even
when it changes tier. Numbers are never reused, and new items start at 61. Other records
cite these numbers, so renumbering breaks them. Items in section 5 carry a letter as part
of the identifier, so `C.9` is a different item from `9`.

**The first label says when it ships.**

| Tier | Meaning |
|---|---|
| `MVP` | In the first release the center's people will touch. |
| `Next` | Expected soon, but nothing is learned by having it on day one. |
| `Later` | Deferred until the named trigger fires. |

**The second label says whether deferring it is safe.** An item marked `foundation` cannot
be added later as new tables, routes, and screens. It changes the data model, the grant
model, or the order in which access is evaluated. A `foundation` item must be *designed
for* now even when it is not *built* now. Items with no second label are additive, and
deferring them costs nothing but time.

Some foundation items carry a stronger warning: **cannot be backfilled**. Deferring those
does not delay the feature, it destroys it, because the data it would need is being thrown
away in the meantime.

Every foundation item is tracked in [What the design must not foreclose](#what-the-design-must-not-foreclose),
with its resolution. The reasoning behind each resolution is in [Decisions](./decisions.md).

**Each item states an observable outcome, not a mechanism.** "A lab member sees their
lab's data without asking" is a requirement. "Members inherit access without a grant" is a
design decision, and it belongs in [design.md](./design.md).

---

## 0. What users assume

Users arrive with these expectations already formed. Each one is either true of the system
today or it is not, and the difference matters more than the list.

| Assumption | True today? |
|---|---|
| A group is a persistent security and governance boundary. | Yes. |
| Groups nest, and permissions flow transitively down the tree. | Yes. |
| Inheritance can be broken for a specific dataset or person. | **No.** Nothing in the model can deny. See Q6. |
| A dataset has one owning group but may be reachable by many. | Yes for governance. See Q3 for attribution. |
| Access can be granted on a single dataset or on a collection. | Yes, though a collection may only hold datasets its own group owns. See Q5. |
| Access is revocable. | Yes. |
| Access is time-bound. | Grants carry an expiry, but no scheduled job enforces it. See item 33. |
| Access history is auditable. | Partly. Grant history survives; membership and collection history is deleted. See item 34. |
| Membership itself can be time-bound. | **No.** A member is added or removed, with no end date. See item 43. |
| Group admin authority is scoped, and differs from platform admin. | Yes. |

---

## The first release

The smallest system that produces real feedback is one complete loop: a center head sets
up their groups, data lands with an owner, people inside see it, people outside ask for it,
an admin decides, and everyone can tell why they can or cannot read something.

Everything below marked `MVP` belongs to that loop. Collections, expiry, reporting, and
identity integration are all outside it, not because they are unimportant, but because
nothing is learned by shipping them before anyone has used the basic loop.

---

## 1. Researcher / Data Consumer

These users request, discover, and use data. They do not want to think about access models.

### 1.1 Discoverability & visibility

1. **Browse datasets I already have access to** — `MVP`
   * Outcome: a researcher opens the portal and sees every dataset they may read, including ones reached through a parent group.
   * Done when: the list is built by the query layer, so it cannot show a dataset the API would refuse.

2. **Search for datasets I do not yet have access to** — `MVP`
   * Outcome: a researcher finds a dataset by title or method, sees its owning group and who to contact, and cannot see the files.
   * Done when: metadata and data are separately gated, and the search result says which is which.

3. **Browse collections** — `Next`
   * Outcome: a collection reads as one logical dataset, and partial access shows as partial rather than as an error.

4. **Understand why I can or cannot access something** — `MVP` · **foundation**
   * Outcome: the page names the source of access in human terms, such as "through the Smith Lab group" or "through collection Aim 2 Release".
   * Outcome: a denial names what is missing, such as an unapproved request.
   * Why foundation: the explanation has to come out of the same query that decided access. An explanation computed separately is a second implementation of the access rules, and the two will disagree. Retrofitting this means rewriting the evaluation path rather than adding to it.

### 1.2 Requesting access

5. **Request access to a single dataset** — `MVP`
   * Outcome: a researcher who can see a dataset's metadata asks for it, with a justification and an optional end date.
   * Done when: a request against a dataset the requester cannot see is refused.

6. **Request access to a collection** — `Next`
   * Outcome: one request covers many datasets, and a partial approval says plainly which items failed.

7. **Request access on behalf of a group** — `Next`
   * Outcome: a group admin requests for the group, so new members inherit the result.

8. **Track request status** — `MVP`
   * Outcome: the requester sees the state and who is reviewing.

9. **Receive notification of decision** — `MVP`
   * Outcome: approval, rejection, and requests for clarification each reach the requester without them checking the portal.
   * Why in the first release: the request loop does not close without it. People do not poll a portal, so an un-notified approval reads as a rejection, and the feedback the release exists to gather never arrives.

10. **Re-request or renew access** — `Next`
    * Outcome: an expiring grant can be extended without retyping the original justification.

### 1.3 Using data

11. **Access data consistently across interfaces** — `MVP`
    * Outcome: the portal, the API, and the compute environment agree on what a user may read.
    * Blocked by: two authorization models run side by side. The `/v2/datasets` routes use the group model, and the legacy `/datasets` and `/projects` routes do not. See item 60.

12. **Lose access immediately when revoked** — `MVP`
    * Outcome: a revoked grant stops working on the next request, on every interface.
    * Blocked by: the same split as item 11.

13. **Cite dataset ownership correctly** — `Later` · **foundation**
    * Outcome: a dataset page states who to credit and which grant funded the work.
    * Trigger: the first publication that cites data held here.
    * Why foundation: attribution is a different relationship from governance, and it needs its own table rather than a wider `owner_group_id`. See Q3.
    * Today: `dataset_funding` and `dataset_affiliation` hold the data and a service reads and writes them, built in phase 11. No route or page surfaces it, which is what the trigger above is for.

---

## 2. Group Admin / Data Steward

These users are the operational backbone, and they push the system hardest.

### 2.1 Group lifecycle & hierarchy

14. **Create a group** — `MVP`
    * Outcome: an admin creates a lab, names its type, and assigns the first admins.

15. **Create child groups** — `MVP`
    * Outcome: a center contains labs, a grant contains aims, and a member of the child reaches the parent's data.
    * Why in the first release: the requester runs a center, so the nested case is the case they will try first.

16. **Reorganize group hierarchy** — `Later`
    * Trigger: a real request to move a group under a different parent.

17. **Deactivate or archive a group** — `Next` · **foundation**
    * Outcome: a finished grant stops changing, and its history stays readable.
    * Why foundation: archiving is a prohibition, and the model has no way to express one. The design currently lists about thirty forbidden actions in prose, and three are enforced. Either archiving is expressed through a general denial rule or that prose list keeps growing. See Q6.

### 2.2 Membership management

18. **Add a user to a group** — `MVP` · **foundation**
    * Outcome: an admin adds a member or another admin, and the new person's access changes on their next request.
    * Why foundation: roles are a two-value database enum today. A steward role, a read-only reviewer, or any finer capability costs an enum migration plus an edit in every policy file. Whether a role is an enum value or a row is a decision that gets more expensive with every policy written. See Q7.

19. **Remove a user** — `MVP` · **foundation, cannot be backfilled**
    * Outcome: every permission the person held through the group stops working.
    * Why foundation: removal is a hard delete today, and `group_user` has no `removed_at`. Every removal that happens before this changes is a fact that no later migration can recover, so item 34 loses coverage of the whole pre-fix period.

20. **Change user role** — `MVP`

21. **View effective permissions of a user** — `Next`
    * Outcome: an admin answers "what can Alice reach through this group?" on one page.

22. **Bulk membership operations** — `Later`
    * Trigger: a group whose membership exceeds roughly twenty people, or a course.

### 2.3 Dataset ownership & organization

23. **Register a new dataset** — `MVP`
    * Outcome: an uploaded dataset gets an owning group at creation, never later.
    * Done when: no dataset can exist without an owning group. See item 59.

24. **Transfer dataset ownership** — `Later` · **foundation**
    * Outcome: a dataset moves to another group when a grant ends or a PI leaves, with both sides consenting.
    * Trigger: the first grant that ends, or the first PI who leaves.
    * Why foundation: governance authority is not a row today. It is ownership plus a role, so it cannot be offered, accepted, or made to expire. An `authority_transfer` table exists in the schema with no code behind it. [Decision 15](./decisions.md) keeps it that way for now and says so explicitly, so it is a recorded deferral rather than an oversight.

25. **Organize datasets into collections** — `Next` · **foundation**
    * Outcome: adding a dataset to a collection extends the collection's grants to it.
    * Why foundation: a collection may currently hold only datasets its own group owns, so it can never be a cross-lab release, a grant-wide bundle, or a center catalogue. Whether a collection has one owning group or many decides its schema, and a center is exactly the setting where the cross-group case shows up. See Q5.

26. **Deprecate or retire a dataset** — `Next`
    * Outcome: access is frozen or revoked, and current readers are told.

### 2.4 Granting and revoking access

27. **Approve an access request** — `MVP`
    * Outcome: the reviewer sees exactly what the approval will confer before confirming it.

28. **Reject a request with reason** — `MVP`
    * Outcome: the reason reaches the requester.

29. **Grant access proactively** — `MVP`
    * Outcome: an admin gives a collaborator access with no request first.

30. **Grant access to a group** — `MVP`
    * Outcome: current and future members of the target group inherit the access.

31. **Revoke access** — `MVP`
    * Outcome: an admin revokes a grant on a user, a group, or a collection.

32. **View all active access grants** — `MVP`
    * Outcome: an admin lists every live grant on their group's data.

33. **Expire access automatically** — `Next`
    * Outcome: a grant with an end date stops working on that date with no human action.
    * Note: the expiry logic exists and is tested, but nothing schedules it. This is a cron entry, not a design question.

### 2.5 Auditing & compliance

34. **See access history** — `Next` · **foundation, cannot be backfilled**
    * Outcome: an admin answers "who could read this dataset on 1 March, and who granted it?"
    * Why foundation: effective access has three inputs, and two of them are hard-deleted. Grants are never deleted, but `group_user` and `collection_dataset` rows are. The audit table records the events and no code replays them. Every day the system runs before this changes is a day the question cannot be answered about, ever.

35. **Generate reports** — `Later`
    * Trigger: the first request from an IRB, a funder, or an institutional audit.
    * Note: additive, but it reads item 34's data, so it is only as good as when 34 was fixed.

36. **Confirm least-privilege** — `Later`
    * Trigger: the first scheduled access review.

---

## 3. App Admin / Platform Admin

These users care about global correctness rather than individual projects.

### 3.1 System-wide governance

37. **Define group types and rules** — `Later`
    * Trigger: a rule a group type must enforce, such as grants requiring an end date.

38. **Define allowed permission types** — `Later` · **foundation**
    * Trigger: an access type a user needs that the seeded set does not cover.
    * Why foundation: access types are a flat set with no implication between them. Downloading does not imply reading, so a user can hold download without metadata access, which describes someone who may download a dataset they cannot see. The code already contradicts the flat model in one place. Whether access types carry an order is a decision about the evaluation core. See Q8.

39. **Override group-level decisions** — `Later` · **foundation**
    * Trigger: the first incident that needs an emergency revocation.
    * Why foundation: an override that removes access is a denial, and access only grows today. Shares a primitive with items 45, 46, and 47. See Q6.

40. **Impersonate users, read-only** — `Later`
    * Trigger: a support case that item 4 cannot resolve.

### 3.2 Identity & lifecycle integration

41. **Provision users from institutional identity** — `Later`
    * Trigger: users from outside the initial center.

42. **Deprovision users automatically** — `Later`
    * Trigger: the first departure that leaves stale access.

43. **Handle external collaborators** — `Next` · **foundation**
    * Outcome: a visiting collaborator gets a limited identity and access that ends on a date.
    * Why foundation: a grant can expire but a membership cannot. A visiting collaborator who joins a lab group is a member until somebody remembers to remove them. Making membership time-bound is a change to how membership is stored, not a screen.

44. **Merge or split identities** — `Later`
    * Trigger: the first duplicate account.

### 3.3 Policy enforcement

45. **Enforce mandatory training or agreements** — `Later` · **foundation**
    * Trigger: the first dataset that arrives with a data use agreement, a HIPAA condition, or an export-control restriction.
    * Why foundation: a condition that gates access regardless of grants composes by AND, and the model only composes by OR. See Q6.

46. **Block access despite group membership** — `Later` · **foundation**
    * Trigger: item 45, or one person who must be excluded from one dataset inside a group they belong to.
    * Why foundation: same primitive as item 45. This is the plainest statement of what the model cannot currently express.

47. **Freeze access platform-wide** — `Later` · **foundation**
    * Trigger: the first incident response plan that asks for it.
    * Why foundation: same primitive as items 45 and 46. The design already names an incident freeze as the first step of access evaluation and then never models it.

---

## 4. Cross-cutting

### 4.1 Scale and automation

48. **Programmatic access via API** — `Next`
    * Outcome: grants, revocations, and audit queries work from a script.

49. **Event-driven updates** — `Later`
    * Trigger: a downstream system that must learn about access changes.

50. **Policy-based access** — `Later` · **foundation**
    * Outcome: a rule such as "every dataset in Center X is readable by Core Y unless marked restricted" holds without anyone maintaining a list.
    * Trigger: a center large enough that hand-assembled collections stop scaling.
    * Why foundation: needs both rule-based collection membership and a way to mark something restricted, so it depends on Q5 and Q6 together.

### 4.2 Evolution over time

51. **Versioned datasets and collections** — `Later` · **foundation**
    * Trigger: the first dataset that gets a second version.
    * Why foundation: whether a grant attaches to a dataset or to a version of one is a schema decision. Deciding it after grants exist means rewriting them.

52. **Dataset splitting or merging** — `Later` · **foundation**
    * Trigger: the first split.
    * Why foundation: depends on item 34 being true first, and item 34 cannot be backfilled.

53. **Sunsetting collections** — `Later`
    * Trigger: the first collection nobody wants.

### 4.3 User experience expectations

54. **No silent access changes** — `MVP`
    * Outcome: a user learns when they gain or lose access, without watching the portal.
    * Note: the same mechanism satisfies item 9.

55. **Explainability** — `MVP` · **foundation**
    * Outcome: every allow and every deny can be stated in one sentence a researcher understands.
    * Note: the same mechanism satisfies item 4, and the reasoning there applies here.

56. **Consistency across environments** — `MVP`
    * Note: the same requirement as item 11, stated from the platform side. Kept because other records cite this number.

---

## 5. Dataset visibility

Five visibility postures a dataset can be in. The letter is part of the identifier, so
`C.9` is distinct from item 9.

### A. Public sample or example dataset

**A.1 Anyone can discover it** — `MVP` · **foundation**
Title, description, owner, and high-level metadata are visible to every authenticated user, and the dataset appears in search. Foundation because "anyone" is currently defined as every logged-in user, and there is no principal for a person who is not logged in. See Q2.

**A.2 Anyone can read and download it** — `MVP`
No request workflow, and the same answer from the portal, the API, and compute.

**A.3 Changing from public to restricted** — `Next`
Global read stops at once. A user keeps access only through an independent grant. The change is audited, and the system can say who kept access and why.

**A.4 Audit visibility** — `Next`
An admin lists every globally readable dataset, and past visibility states are queryable.

### B. Discoverable but locked

**B.5 Anyone can discover it** — `MVP`
Metadata is visible to every authenticated user, and the data is not readable without approval.

**B.6 Users can request access** — `MVP`
The request targets the dataset or a collection containing it, and carries a justification and an optional duration.

**B.7 Access explanation** — `MVP`
A denial says plainly that no qualifying grant exists.

**B.8 Changing from discoverable to group-only** — `Next`
The dataset leaves global search. Existing grants stay valid.

### C. Group-visible, internal to the owning group

**C.9 Members of the owning group and its descendants can read** — `MVP`
A lab member sees their lab's data without asking anyone. Whether the system delivers this through a structural rule or through a grant created at dataset registration is a design decision, not a requirement.

**C.10 External users cannot discover it** — `MVP`
The dataset is absent from search for non-members, and no metadata leaks.

**C.11 Granting an external collaborator access** — `MVP`
A group admin grants on the dataset or through a collection, and item 4 names which one carried the access.

### D. Group-discoverable, explicit grant required

**D.12 Members see metadata but not data** — `Next`
Internal discovery without automatic exposure.

**D.13 Group-level access request** — `Next`
An admin requests on behalf of a group, and approval lands on the dataset or the collection.

### E. Steward-only

**E.14 Only group admins can discover it** — `Next`
Used for embargoed, pre-publication, or sensitive data.

**E.15 Non-admin members cannot see it exists** — `Next`

**E.16 Escalation path** — `Later`
Trigger: the first case where a platform admin must override. Depends on item 39.

---

## 6. Correctness requirements

These are not features. Each one describes something the shipped system gets wrong or
cannot answer, found by reading the design against the code rather than by asking a user.
Users will not report these, because users cannot see them.

57. **The audit log is readable only by people with a reason** — `MVP` · **built**
    * Outcome: owning-group admins, oversight admins, and platform admins can read audit records, and nobody else can.
    * Each resource answers for itself, at `GET /v2/datasets/:id/audit`, `GET /collections/:id/audit`, and `GET /groups/:id/audit`, each bound to that resource's `view_audit_logs` policy. A record belongs to a resource when the resource is the thing being changed or the thing the change is about, so the query matches `target_id` or `resource_id`.
    * The platform-wide `GET /audit/records` stays platform admin only. It spans every resource, so no per-resource policy scopes it.

58. **A derived dataset is never more open than its sources** — **withdrawn**
    * Withdrawn by [decision 10](./decisions.md#_10-derived-and-source-dataset-access-are-independent). A derivative may legitimately be shared more widely than the data it came from, so the source's audience is not a ceiling. A grant-time check enforcing this was built and then removed.
    * `dataset_hierarchy` remains lineage for display and for provenance questions. No query treats it as an authorization edge.

59. **A dataset always has an owning group** — `MVP` · **foundation**
    * Outcome: every dataset is governed by exactly one group.
    * Today: `dataset.owner_group_id` is nullable, so pre-existing datasets fall outside ownership-based authorization entirely.
    * Why foundation: the nullable column is the shape of the problem. Every dataset created before it is fixed is one more row to reconcile by hand.

60. **The legacy project routes agree with the group model, or they are gone** — `MVP`
    * Outcome: one authorization model decides every request.
    * Today: `/datasets` and `/projects` use the older role-based middleware, and `project`, `project_user`, and `project_dataset` remain in the schema with no migration path written down.
    * Why in the first release: items 11, 12, and 56 are false while this stands, and a release where the portal and the API disagree teaches the first cohort that the system cannot be trusted.

---

## Questions, and how they were settled

Every open question on this page was decided on 2026-09-08. The reasoning for each is in
[Decisions](./decisions.md); the one-line answers are here so this page stays readable on
its own.

| Question | Decision |
|---|---|
| Q1. What does the first cohort actually need? | Answered by shipping, not by more requirements gathering. Revisit these tiers once real usage exists. |
| Q2. Does anything need to be readable without logging in? | **Yes.** A public principal is added, and the existing `Everyone` becomes `Authenticated Users`. Unauthenticated routes are deferred. |
| Q3. Does "owning group" mean governance only? | **Governance only.** Attribution is a separate relationship, designed later. `owner_group_id` must never be widened to carry it. |
| Q4. Will Bioloop exchange access decisions with other institutions? | **Undecided, and it can stay that way.** Consent codes are captured at registration because that information decays; nothing enforces them. |
| Q5. Can a collection span groups? | **No.** A separate non-authorization concept for describing a set of datasets comes later. |
| Q6. Should inheritance be breakable? | **Yes, by a restriction layer that composes by AND**, never by subtracting from grants. One restriction type ships: archiving. |
| Q7. Is a role an enum or a row? | **An enum.** Validity columns on `group_user` give membership an expiry without the row-based model. |
| Q8. Do access types imply one another? | **Yes.** A seeded partial order, closed over at evaluation time. |

---

## What the design must not foreclose

Everything that was on this list is now either built or explicitly deferred with the
constraint that keeps it possible.

| Item | Outcome |
|---|---|
| 19, 34 — membership and collection history | **Built.** Rows are closed rather than deleted, and current state is read through a view. |
| 59 — non-null owning group | **Built.** Datasets that had no owner were moved into an archived quarantine group. |
| A.1 — a principal for people who are not logged in | **Principal built.** `Public` sits alongside `Authenticated Users`. Serving unauthenticated requests is deferred. |
| 43 — time-bound membership | **Unblocked.** `group_user` carries `valid_until`; a service and UI change with no migration remains. |
| 17, 39, 45, 46, 47 — a way to say no | **Primitive built.** Restrictions compose by AND, with archiving as the only type. The rest become a seed row each. |
| 38 — an order over access types | **Built.** A seeded partial order, closed over once at startup. |
| 4, 55 — explanation from the deciding query | **Constraint accepted.** The access-type closure and the restriction check both run inside the deciding query. |
| 58 — derived datasets no more open than their sources | **Withdrawn.** Built, then removed. Derived and source access are independent — see [decision 10](./decisions.md). |
| 13 — attribution | **Foundation built.** `dataset_funding` and `dataset_affiliation`, with a service. No route or page yet. |
| 25, 50 — cross-group collections | **Deferred by decision.** Collections stay single-owner; a non-authorization concept covers the rest later. |
| 51 — grants attaching to a dataset or a version | **Still open.** No decision taken, and nothing forecloses one. |

---

## What is not built

The design describes more than the code does. This is the difference, as of 2026-09-08.
Sequencing lives in the local backlog rather than here.

### Not started

- **Invitations — built 2026-09-09, one part outstanding.** The flow works end to end; only the
  signup-time email mismatch dialog is missing, and the server refuses that case anyway. See
  [the design record](./invitations.md).
- **Ownership transfer / dual consent.** `authority_transfer` is in the schema and referenced by **zero lines of code**. Settled by [decision 15](./decisions.md): not in the MVP, the table stays, and nothing is wired to it. `route_policy_bindings.test.js` asserts no route binds `transfer_ownership` or exposes a transfer path.
- **Reparenting.** Deliberately deferred — [routes/groups.js:536](https://github.com/IUSCA/bioloop/blob/main/api/src/routes/groups.js#L536) says not until there is a use case. The closure-table rewrite it needs does not exist.
- **Visibility presets.** The `EVERYONE` / `OWNING_GROUP` / `INSTITUTION` / `PARENT_GROUP` subject-resolution presets and the composite `OWNING_GROUP:DOWNLOADABLE` form are not modeled. Only access presets exist; subjects are always picked explicitly.
- **Renewals.** `ACCESS_REQUEST_TYPE.RENEWAL` and `previous_grant_ids` are in the schema, the route rejects anything but `NEW`, and the renewal-context endpoint is commented out.
- **Notifications on access decisions — built 2026-09-08.** Submitting an access request
  notifies the reviewers and deciding notifies the requester, both in app, through
  `services/access_requests/notify.js`. Use cases 9 and 54 are met for access requests.
  Revoking a grant tells a user subject in app, through `services/grants/notify.js`. A group
  subject is not told, and issuing a grant still notifies nobody.
- **Access history queries** (34). The data is preserved; nothing reconstructs effective access as of a past date from it.
- **Compliance reporting and least-privilege review** (35, 36). No report generation, no broad-access detection.
- **Training / DUA preconditions** (45, 46). Named as extensible; no attributes and no policy hooks exist.

### Built but not reachable

Anything seeded, modeled, or exported and never called reads as shipped. Each of these is
either wiring to finish or code to delete.

- **`expireStaleRequests`** is implemented and tested and called by no cron, route, or worker. Requests will sit `UNDER_REVIEW` forever in a running deployment.
- **`group.add_dataset`** and **`group.add_collection`** are defined and never passed to `authorize()`.
- **`allow_user_contributions`** can be set and read, and nothing enforces it. The contributor upload path is not implemented, and `user_dataset_contribution` is written by no code.
- **Dataset unarchive.** The archive route exists; the unarchive route is commented out, the service has no counterpart, and the UI has no call. A dataset archived through the UI cannot be brought back through it.

### Enforcement holes

Two remain, and both are live.

- **Access-request creation is ungated on the resource.** `authorize('access_request', 'create')` is `Policy.always` and the service validates only the *subject*, so a user holding any resource UUID can file against a resource they cannot see. `assertGrantItemsApplicableToResourceType` runs on grant creation but not here, so a request can also name access types that do not apply to the resource type.
- ~~**`unarchive` binds the wrong policy.**~~ **Fixed.** `routes/groups.js` now authorizes the
  unarchive endpoint with `'group', 'unarchive'`, which `groupPolicies` defines as
  platform-admin-only. Verified end to end 2026-09-11: an archived group's own admin is
  refused, the group stays archived, and a platform admin can reactivate it
  (`e2e/src/specs/restrictions/archive.spec.js`, flow A5).
- **The platform-wide audit query has no scoped form.** `GET /audit/records` spans every resource and stays platform admin only. Owning-group admins and oversight read their own resources through the per-resource endpoints in item 57; a feed across everything a caller governs would need the query filtered by their authority and does not exist.
- **Legacy `/datasets` routes bypass the group model.** They still use the old RBAC `accessControl()` middleware, so "consistency across interfaces" (11, 56) does not hold on them. These retire as the surfaces above them are rebuilt on `/v2`, rather than as a migration of their own.

---

## What this page does not cover

**Collection visibility.** The dataset postures in section 5 have no collection equivalent,
because Q5 decides what a collection is. Writing them first would invent requirements
nobody asked for.

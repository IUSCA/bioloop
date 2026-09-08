---
title: Group Use Cases
order: 3
status: active
implemented: partial
last_verified: 2026-09-07
---

::: warning Design record — active
What users expect the [groups design](./design.md) to satisfy, in priority order.
This is a requirements document. It does not describe what the UI does today; for
that, read [Implementation Status](./implementation-status.md).
:::

# Group Use Cases

## How to read this page

**Numbers are permanent identifiers, not an order.** Item 43 stays item 43 forever, even
when it moves section or tier. Numbers are never reused, and new items start at 60. Other
records cite these numbers, so renumbering breaks them. Items in section 5 carry a letter
as part of the identifier, so `C.9` is a different item from `9`.

**Priority is a separate axis from the number.** Every item carries one of four tiers.

| Tier | Meaning |
|---|---|
| `P0` | Wrong today. The shipped system does something a user would call a bug. |
| `P1` | First cohort. The first lab cannot use the platform without it. |
| `P2` | Second lab. Needed once more than one group shares data, or the first audit lands. |
| `P3` | Deferred. Not built until the named trigger fires. |

**Each item names who asked for it.** A dash means nobody has. A `P0`, `P1`, or `P2` item
with a dash is a hypothesis, not a requirement, and filling in these names is the single
most valuable edit this page can receive. `P3` items do not carry the field, because a
trigger replaces it.

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
| Inheritance can be broken for a specific dataset or person. | **No.** Nothing in the model can deny. See open question Q6. |
| A dataset has one owning group but may be reachable by many. | Yes for governance. See open question Q3 for attribution. |
| Access can be granted on a single dataset or on a collection. | Yes, though a collection may only hold datasets its own group owns. |
| Access is revocable. | Yes. |
| Access is time-bound. | Grants carry an expiry, but no scheduled job enforces it. See item 33. |
| Access history is auditable. | Partly. Grant history survives; membership and collection history is deleted. |
| Group admin authority is scoped, and differs from platform admin. | Yes. |

---

## 1. Researcher / Data Consumer

These users request, discover, and use data. They do not want to think about access models.

### 1.1 Discoverability & visibility

1. **Browse datasets I already have access to** — `P1` · asked by —
   * Outcome: a researcher opens the portal and sees every dataset they may read, including ones reached through a parent group.
   * Done when: the list is built by the query layer, so it cannot show a dataset the API would refuse.

2. **Search for datasets I do not yet have access to** — `P1` · asked by —
   * Outcome: a researcher finds a dataset by title or method, sees its owning group and who to contact, and cannot see the files.
   * Done when: metadata and data are separately gated, and the search result says which is which.

3. **Browse collections** — `P2` · asked by —
   * Outcome: a collection reads as one logical dataset, and partial access shows as partial rather than as an error.

4. **Understand why I can or cannot access something** — `P1` · asked by —
   * Outcome: the page names the source of access in human terms, such as "through the Smith Lab group" or "through collection Aim 2 Release".
   * Outcome: a denial names what is missing, such as an unapproved request.
   * Done when: the explanation is generated from the same query that decided access, not written separately.

### 1.2 Requesting access

5. **Request access to a single dataset** — `P1` · asked by —
   * Outcome: a researcher who can see a dataset's metadata asks for it, with a justification and an optional end date.
   * Done when: a request against a dataset the requester cannot see is refused.

6. **Request access to a collection** — `P2` · asked by —
   * Outcome: one request covers many datasets, and a partial approval says plainly which items failed.

7. **Request access on behalf of a group** — `P2` · asked by —
   * Outcome: a group admin requests for the group, so new members inherit the result.

8. **Track request status** — `P1` · asked by —
   * Outcome: the requester sees the state and who is reviewing.

9. **Receive notification of decision** — `P1` · asked by —
   * Outcome: approval, rejection, and requests for clarification each reach the requester without them checking the portal.
   * Note: nothing in the grant or access-request services touches the notification system today.

10. **Re-request or renew access** — `P2` · asked by —
    * Outcome: an expiring grant can be extended without retyping the original justification.

### 1.3 Using data

11. **Access data consistently across interfaces** — `P0` · asked by —
    * Outcome: the portal, the API, and the compute environment agree on what a user may read.
    * Blocked by: two authorization models run side by side. The `/v2/datasets` routes use the group model, and the legacy `/datasets` and `/projects` routes do not. See item 60.

12. **Lose access immediately when revoked** — `P0` · asked by —
    * Outcome: a revoked grant stops working on the next request, on every interface.
    * Blocked by: the same split as item 11.

13. **Cite dataset ownership correctly** — `P2` · asked by —
    * Outcome: a dataset page states who to credit and which grant funded the work.
    * Blocked by: the schema records one owning group and no funding or affiliation. See open question Q3.

---

## 2. Group Admin / Data Steward

These users are the operational backbone, and they push the system hardest.

### 2.1 Group lifecycle & hierarchy

14. **Create a group** — `P1` · asked by —
    * Outcome: an admin creates a lab, names its type, and assigns the first admins.

15. **Create child groups** — `P2` · asked by —
    * Outcome: a grant contains aims, and an aim's members reach the grant's data.

16. **Reorganize group hierarchy** — `P3`
    * Trigger: a real request to move a group under a different parent. Deferred deliberately; the closure-table rewrite has no customer.

17. **Deactivate or archive a group** — `P2` · asked by —
    * Outcome: a finished grant stops changing, and its history stays readable.

### 2.2 Membership management

18. **Add a user to a group** — `P1` · asked by —
    * Outcome: an admin adds a member or another admin, and the new person's access changes on their next request.
    * Scope note: only member and admin exist. A steward role is a separate decision, not part of this item.

19. **Remove a user** — `P1` · asked by —
    * Outcome: every permission the person held through the group stops working.
    * Done when: the removal leaves a record, so item 34 can still answer questions about the past.

20. **Change user role** — `P1` · asked by —

21. **View effective permissions of a user** — `P2` · asked by —
    * Outcome: an admin answers "what can Alice reach through this group?" on one page.

22. **Bulk membership operations** — `P3`
    * Trigger: a group whose membership exceeds roughly twenty people, or a course.

### 2.3 Dataset ownership & organization

23. **Register a new dataset** — `P1` · asked by —
    * Outcome: an uploaded dataset gets an owning group at creation, never later.
    * Done when: no dataset can exist without an owning group.

24. **Transfer dataset ownership** — `P2` · asked by —
    * Outcome: a dataset moves to another group when a grant ends or a PI leaves, with both sides consenting.

25. **Organize datasets into collections** — `P2` · asked by —
    * Outcome: adding a dataset to a collection extends the collection's grants to it.

26. **Deprecate or retire a dataset** — `P2` · asked by —
    * Outcome: access is frozen or revoked, and current readers are told.

### 2.4 Granting and revoking access

27. **Approve an access request** — `P1` · asked by —
    * Outcome: the reviewer sees exactly what the approval will confer before confirming it.

28. **Reject a request with reason** — `P1` · asked by —
    * Outcome: the reason reaches the requester.

29. **Grant access proactively** — `P1` · asked by —
    * Outcome: an admin gives a collaborator access with no request first.

30. **Grant access to a group** — `P1` · asked by —
    * Outcome: current and future members of the target group inherit the access.

31. **Revoke access** — `P1` · asked by —
    * Outcome: an admin revokes a grant on a user, a group, or a collection.

32. **View all active access grants** — `P1` · asked by —
    * Outcome: an admin lists every live grant on their group's data.

33. **Expire access automatically** — `P2` · asked by —
    * Outcome: a grant with an end date stops working on that date with no human action.
    * Note: expiry logic exists and is tested, but nothing schedules it.

### 2.5 Auditing & compliance

34. **See access history** — `P2` · asked by —
    * Outcome: an admin answers "who could read this dataset on 1 March, and who granted it?"
    * Blocked by: membership and collection-content rows are deleted rather than closed, so two of the three inputs to that answer are gone.

35. **Generate reports** — `P3`
    * Trigger: the first request from an IRB, a funder, or an institutional audit.

36. **Confirm least-privilege** — `P3`
    * Trigger: the first scheduled access review.

---

## 3. App Admin / Platform Admin

These users care about global correctness rather than individual projects.

### 3.1 System-wide governance

37. **Define group types and rules** — `P3`
    * Trigger: a rule a group type must enforce, such as grants requiring an end date.

38. **Define allowed permission types** — `P3`
    * Trigger: an access type a user needs that the seeded set does not cover.

39. **Override group-level decisions** — `P3`
    * Trigger: the first incident that needs an emergency revocation.

40. **Impersonate users, read-only** — `P3`
    * Trigger: a support case that item 4 cannot resolve.

### 3.2 Identity & lifecycle integration

41. **Provision users from institutional identity** — `P3`
    * Trigger: users from outside the initial lab.

42. **Deprovision users automatically** — `P3`
    * Trigger: the first departure that leaves stale access.

43. **Handle external collaborators** — `P2` · asked by —
    * Outcome: a visiting collaborator gets a limited identity and access that ends on a date.

44. **Merge or split identities** — `P3`
    * Trigger: the first duplicate account.

### 3.3 Policy enforcement

45. **Enforce mandatory training or agreements** — `P3`
    * Trigger: the first dataset that arrives with a data use agreement, a HIPAA condition, or an export-control restriction.

46. **Block access despite group membership** — `P3`
    * Trigger: item 45, or a person who must be excluded from one dataset inside a group they belong to.

47. **Freeze access platform-wide** — `P3`
    * Trigger: the first incident response plan that asks for it.

---

## 4. Cross-cutting

### 4.1 Scale and automation

48. **Programmatic access via API** — `P2` · asked by —
    * Outcome: grants, revocations, and audit queries work from a script.

49. **Event-driven updates** — `P3`
    * Trigger: a downstream system that must learn about access changes.

50. **Policy-based access** — `P3`
    * Trigger: a group large enough that hand-assembled collections stop scaling. Also blocked by open question Q5.

### 4.2 Evolution over time

51. **Versioned datasets and collections** — `P3`
    * Trigger: the first dataset that gets a second version.

52. **Dataset splitting or merging** — `P3`
    * Trigger: the first split. Depends on item 34 being true first.

53. **Sunsetting collections** — `P3`
    * Trigger: the first collection nobody wants.

### 4.3 User experience expectations

54. **No silent access changes** — `P1` · asked by —
    * Outcome: a user learns when they gain or lose access, without watching the portal.
    * Note: the same mechanism satisfies item 9.

55. **Explainability** — `P1` · asked by —
    * Outcome: every allow and every deny can be stated in one sentence a researcher understands.
    * Note: the same mechanism satisfies item 4.

56. **Consistency across environments** — `P0` · asked by —
    * Note: the same requirement as item 11, stated from the platform side. Kept because other records cite this number.

---

## 5. Dataset visibility

Five visibility postures a dataset can be in. The letter is part of the identifier, so
`C.9` is distinct from item 9.

### A. Public sample or example dataset

**A.1 Anyone can discover it** — `P1` · asked by —
Title, description, owner, and high-level metadata are visible to every authenticated user, and the dataset appears in search.

**A.2 Anyone can read and download it** — `P1` · asked by —
No request workflow, and the same answer from the portal, the API, and compute.

**A.3 Changing from public to restricted** — `P2` · asked by —
Global read stops at once. A user keeps access only through an independent grant. The change is audited, and the system can say who kept access and why.

**A.4 Audit visibility** — `P2` · asked by —
An admin lists every globally readable dataset, and past visibility states are queryable.

### B. Discoverable but locked

**B.5 Anyone can discover it** — `P1` · asked by —
Metadata is visible to every authenticated user, and the data is not readable without approval.

**B.6 Users can request access** — `P1` · asked by —
The request targets the dataset or a collection containing it, and carries a justification and an optional duration.

**B.7 Access explanation** — `P1` · asked by —
A denial says plainly that no qualifying grant exists.

**B.8 Changing from discoverable to group-only** — `P2` · asked by —
The dataset leaves global search. Existing grants stay valid.

### C. Group-visible, internal to the owning group

**C.9 Members of the owning group and its descendants can read** — `P1` · asked by —
A lab member sees their lab's data without asking anyone. Whether the system delivers this through a structural rule or through a grant created at dataset registration is a design decision, not a requirement.

**C.10 External users cannot discover it** — `P1` · asked by —
The dataset is absent from search for non-members, and no metadata leaks.

**C.11 Granting an external collaborator access** — `P1` · asked by —
A group admin grants on the dataset or through a collection, and item 4 names which one carried the access.

### D. Group-discoverable, explicit grant required

**D.12 Members see metadata but not data** — `P2` · asked by —
Internal discovery without automatic exposure.

**D.13 Group-level access request** — `P2` · asked by —
An admin requests on behalf of a group, and approval lands on the dataset or the collection.

### E. Steward-only

**E.14 Only group admins can discover it** — `P2` · asked by —
Used for embargoed, pre-publication, or sensitive data.

**E.15 Non-admin members cannot see it exists** — `P2` · asked by —

**E.16 Escalation path** — `P3`
Trigger: the first case where a platform admin must override. Depends on item 39.

---

## 6. Correctness requirements

These are not features. Each one describes something the shipped system gets wrong or
cannot answer, found while reviewing the design against the code.

57. **The audit log is readable only by people with a reason** — `P0` · asked by —
    * Outcome: owning-group admins, oversight admins, and platform admins can read audit records, and nobody else can.
    * Today: `GET /audit/records` carries no authorization, so any authenticated user can read actors, subjects, resource names, and decisions for the whole platform.

58. **A derived dataset is never more open than its sources** — `P1` · asked by —
    * Outcome: a dataset produced from restricted input cannot be granted to a wider audience than the input allowed.
    * Today: `dataset_hierarchy` records derivation, and nothing connects it to authorization. A derivative of restricted data can be granted to everyone.
    * Scope note: the `P1` deliverable is a written rule and a check that enforces it, not a general restriction engine.

59. **A dataset always has an owning group** — `P1` · asked by —
    * Outcome: every dataset is governed by exactly one group.
    * Today: `dataset.owner_group_id` is nullable, so pre-existing datasets fall outside ownership-based authorization entirely.

60. **The legacy project routes agree with the group model, or they are gone** — `P0` · asked by —
    * Outcome: one authorization model decides every request.
    * Today: `/datasets` and `/projects` use the older role-based middleware, and `project`, `project_user`, and `project_dataset` remain in the schema with no migration path written down.
    * Note: items 11, 12, and 56 are false while this stands.

---

## Open questions

Each one changes what the items above mean. None can be answered by reading the code.

**Q1. Who are the first three users, and what do they need this quarter?**
Every `P0`, `P1`, and `P2` item on this page has a dash where a requester's name should be.
Until real names appear, the tiers are an informed guess and this page is still partly a
wish list. Owner: whoever speaks for the first lab.

**Q2. Does anything need to be readable without logging in?**
The `Everyone` principal means every authenticated user, and no anonymous principal exists.
Public dataset landing pages, DOIs, and search-engine-indexable metadata all need one.
Adding a second system principal now is cheap. Retrofitting one into every zero-default
query later is not. Answering "no" is fine, and it belongs in writing.

**Q3. Does "owning group" mean governance only, or attribution too?**
The glossary says a dataset may be associated with more than one project, lab, or grant.
The design gives every dataset exactly one owning group. Both can be true if governance and
attribution are separate concepts, but the schema has no place for affiliation or funding.
Item 13 cannot be built until this is settled.

**Q4. Will Bioloop ever exchange access decisions with another institution?**
Controlled access to human biomedical data has an interoperability stack: GA4GH Passports
for identity and permissions, the Data Use Ontology for machine-readable consent codes, and
REMS for the request workflow. If the answer is yes, the access-request model should be
checked against Passports before it hardens. If the answer is no, that is a reasonable
decision and it belongs in writing.

**Q5. Can a collection hold datasets owned by more than one group?**
Today it cannot, so a collection can never be a cross-lab release, a grant-wide bundle, or a
centre catalogue. This question blocks item 50 and blocks writing collection visibility use
cases at all, because the answer decides whether a collection has one owning group or many.

**Q6. Should inheritance ever be breakable?**
Users assume they can exclude one person or one dataset from an otherwise inherited
permission. Nothing in the model can deny; access is a union of grants and grows only. Items
45, 46, and 47 all need a way to say no, and all three are `P3`. Archiving is the only
near-term case, so the honest options are to build one narrow denial for archiving or to
state plainly that inheritance is unbreakable.

---

## What this page does not cover

**Collection visibility.** The dataset postures in section 5 have no collection equivalent,
because open question Q5 decides what a collection is. Writing them first would invent
requirements nobody asked for.

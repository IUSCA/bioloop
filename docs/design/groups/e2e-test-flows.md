---
title: End-to-end test flows
order: 11
status: active
implemented: partial
last_verified: 2026-09-17
---

::: warning Design record — active
What a browser-driven test suite for the v2 groups system must prove. This page is written
from [Design](./design.md), [Decisions](./decisions.md), and [Use Cases](./use-cases.md)
alone. It names no file, no route, and no selector, because a flow that quotes the code
cannot contradict it. The suite that proves these flows lives in `e2e/`, and `e2e/README.md`
says how to run it.
:::

<!-- cspell:ignore Priya -->

# End-to-end test flows

## Why this page exists

The v2 groups system is an access-control system, and an access-control system is judged by
what it refuses. Unit tests prove a query returns the right rows. They do not prove that a
researcher in one lab cannot see another lab's data through a page nobody thought to gate.
Only a test that drives a real browser against a real server, signed in as a real person,
proves that.

This page is the specification half of that suite. Each flow states an actor, a starting
state, the actions the actor takes, and what must be true afterwards — including what must
*not* be visible. Writing them before reading the implementation is deliberate. A flow
derived from the code can only assert what the code already does, and the interesting
failures are the ones nobody wrote code for.

## How to read a flow

Every flow carries five parts.

- **Actor** — who is signed in. Never "a user"; always a named person from the cast below.
- **Given** — the fixture state the flow depends on, and nothing else.
- **When** — the actions, in the order a person performs them.
- **Then** — the observable outcomes, stated as what a person sees rather than as a database
  row.
- **And never** — the negative assertions. This part is not optional. A flow with no
  negative assertion is a smoke test.

Two labels sit on each flow.

**Tier** repeats the use-case tier: `MVP`, `Next`, or `Later`. An `MVP` flow that fails is a
release blocker. A `Next` flow may fail today, and its failure is a scheduling fact rather
than a defect.

**Kind** says what the flow is for.

| Kind | Meaning |
|---|---|
| `journey` | A person completes a task end to end. Breaks when the loop breaks. |
| `boundary` | A person is refused something. Breaks when a hole opens. |
| `invariant` | A property holds across several pages. Breaks when two surfaces disagree. |

Boundary flows outnumber journey flows here, and that ratio is correct for this system.

## The cast and the world

One fixture world serves every flow. It is small enough to hold in the head and large enough
to contain every relationship the model can express. Every flow below names people from this
cast, so a reader can follow one person across the whole page.

### The hierarchy

```
Midwest Genomics Center
├── Wong Lab
│   └── Wong Sequencing        (sub-lab)
├── Patel Lab
└── Imaging Core
```

### The people

| Person | Account | Standing | Reaches |
|---|---|---|---|
| Priya | `priya` | Platform admin | Everything, subject to restrictions |
| Dana | `dana` | Admin of Midwest Genomics Center | Governance of the Center; oversight of all four descendants |
| Alice | `alice` | Admin of Wong Lab | Governance of Wong Lab; oversight of Wong Sequencing |
| Bob | `bob` | Member of Wong Lab | Transitively a member of the Center |
| Carol | `carol` | Member of Wong Sequencing | Transitively a member of Wong Lab and the Center |
| Erin | `erin` | Admin of Patel Lab | Governance of Patel Lab, and nothing in Wong Lab |
| Frank | `frank` | Member of Patel Lab | The outsider for every Wong Lab flow |
| Quinn | `quinn` | Member of no group, holder of no grant | The zero-access user |
| Vic | *none* | No account yet | The invitee |

Dana is the oversight case. Frank is the refusal case. Quinn is the empty-state case. Vic is
the invitation case. Carol proves transitivity. Erin proves that admin authority does not
travel sideways.

**The world in the tables above is seeded, so it can be walked by hand.** `npm run seed`
writes it, and `/dev-login?username=<account>` signs in as any of these people without a
credential. Vic has no row, which is the invitation flows working rather than the seed being
incomplete. The fixture lives in `api/prisma/seed_data/flows_world.js`, beside the sample
world the seed also writes; the two never interleave. Dana additionally administers the
imaging core, because flow F2 needs its admin to issue a grant and the table above names
nobody for it.

No flows-world resource is granted to `Public` or `Authenticated Users`, so a refusal here is
a real refusal. The sample world does hold five such grants, and a global principal grant
reaches an account with no memberships — so `quinn` sees 0 groups and 0 collections but 3
sample datasets. Flow H1 is therefore walked against this world's resources rather than
against an absolutely empty portal.

The end-to-end suite does **not** use these rows. It builds its own world per run, named for
the run, and borrows unaffiliated `user-0NN` accounts. Seeded and generated worlds coexist
without colliding.

### How the suite builds its world

**The v2 suite is separate from the v1 suite in `tests/`.** Every v1 project selects one of
three RBAC roles. v2 has no roles below platform admin, and these flows need at least eight
actors, sometimes two in one test. The v1 suite also needs `NODE_ENV=ci` on the API, so it
cannot run against an ordinary dev stack.

**The suite builds its structure and borrows its people.** It creates groups, memberships,
datasets, collections, and grants at the start of a run. It does not assert against seeded
groups or seeded grants. Seeded memberships move when the seed changes, and the sample world
grants to both system principals, so nothing there is truly invisible.

**It builds through the HTTP API as a platform admin, not through direct inserts.** A world
built by inserts can be one the API would refuse, such as a dataset with no resource row. A
world built through the API makes the fixture itself a check that the creation paths work.
An import source is the one exception. No route registers one, because a platform admin
inserts the row by hand after checking the path, so the suite inserts it the same way.

**It never creates a user account.** Creating an account runs the `USER_CREATED` handlers, and
one of them applies that address's pending invitations. A world builder that created accounts
would exercise the invitation path before any invitation flow had started. Flow C1 is where an
account first appears, and it appears because a person accepted an invitation.

**It tears the world down through SQL, because the API offers no way.** Groups and collections
have no delete, and a dataset delete keeps its record. Archiving is not deletion, and history is
preserved. A destructive endpoint added only so a test suite can tidy up would put a hole in the
model. Teardown deletes the run's own rows by run identifier, and touches nothing seeded.

### The resources

| Resource | Owner | Purpose in the flows |
|---|---|---|
| `PCM230203` | Wong Lab | The dataset every access flow is about |
| `PCM230204` | Wong Lab | The second dataset, for collection and bulk flows |
| `IMG-0007` | Midwest Imaging Core | A dataset in a sibling branch |
| `PAT-1101` | Patel Lab | Frank's own data, used to prove refusals run both ways |
| Aim 2 Release | Wong Lab | The collection holding `PCM230203` and `PCM230204` |

The imaging group is **Midwest Imaging Core**. `group.name` is unique and the seed's sample
world already holds a group called Imaging Core. No flow depends on that group's name — it
exists to own a dataset in a branch neither Wong Lab nor Patel Lab reaches.

### What the world must not contain

The fixture must not seed a grant from Wong Lab's resources to Patel Lab, to the Center, or
to either system principal. Every flow that proves a refusal depends on the absence of such a
grant, and a seeded convenience grant would make those flows pass for the wrong reason.

The fixture must also not make anybody a platform admin except Priya. A platform admin is
allowed before any policy runs, so a suite driven as a platform admin proves almost nothing.
This is the single most expensive mistake available here.

---

## A. Group lifecycle and hierarchy

### A1 — A center head builds their structure · `MVP` · `journey`

Covers use cases 14 and 15.

**Actor** Dana.
**Given** Dana administers Midwest Genomics Center, which has no children.
**When** Dana creates a child group named Wong Lab, sets its type to `lab`, and names Alice
as its first admin.
**Then** Wong Lab appears under the Center in the hierarchy view. Alice appears in its member
list with the admin role. Dana's own oversight list gains Wong Lab.
**And** the form asks whether Dana herself should be one of its admins. The checkbox starts
checked and disabled, because a group needs an admin and on an empty form Dana is the only
candidate. Naming Alice makes it a real choice, and Dana clears it. Dana never appears in the
admin search: the checkbox is how she would put herself in.
**And** a name another group already holds is refused on the name field, and the form stays
open with what Dana typed. The message names no other group, because group names are unique
across the whole system and the holder may be one Dana cannot see.
**And never** does Dana gain the ability to issue or revoke a grant on anything Wong Lab
owns. Creating a child confers oversight, not authority.

### A2 — Membership flows upward, authority does not · `MVP` · `invariant`

Covers the membership and oversight transitivity rules in [Design](./design.md).

**Actor** Carol, then Dana, then Alice.
**Given** Carol is a direct member of Wong Sequencing only.
**When** Carol opens the Center's group page.
**Then** Carol is shown as a member of the Center, labelled as reaching it through her
sub-lab rather than directly.
**When** Dana opens Wong Sequencing.
**Then** Dana sees its members and its datasets, and every governance control is absent.
**When** Alice opens Midwest Genomics Center.
**Then** Alice sees the Center as an ordinary member, with no oversight of Patel Lab and no
governance of anything above Wong Lab.
**And never** does an ancestor admin acquire a governance control on a descendant, and never
does a descendant admin see anything of a sibling branch.

### A3 — Archiving freezes a group without erasing it · `Next` · `journey`

Covers use case 17 and [decision 17](./decisions.md#_17-resource-state-is-checked-after-authorization).

**Actor** Alice, then Bob, then Priya.
**Given** Wong Lab is active, owns `PCM230203`, and has Bob as a member.
**When** Alice archives Wong Lab.
**Then** Wong Lab is marked archived everywhere it appears, including in the Center's
subgroup list and on the dataset's owner field. Bob keeps reading `PCM230203`, because
existing grants survive archiving. Alice can still read the member list, the grant list, and
the audit log.
**And never** can Alice add a member, remove a member, issue a grant, revoke a grant, create
a dataset owned by Wong Lab, edit collection membership, or invite anybody. Each of those
controls is absent from the page rather than present and failing.
**When** Priya opens the archived Wong Lab.
**Then** Priya is refused the same mutations Alice was refused, because archived state binds a
platform admin too.
**And** Priya alone is offered unarchive.

### A4 — Archiving covers the group and what it owns, not its sub-groups · `Next` · `boundary`

Covers [decision 17](./decisions.md#_17-resource-state-is-checked-after-authorization).

**Actor** Alice, then an admin of Wong Sequencing.
**Given** Wong Lab is archived, and Wong Sequencing, beneath it, is not.
**When** Alice opens `PCM230203`, which Wong Lab owns.
**Then** it reads as frozen, and the reason names Wong Lab.
**When** the admin of Wong Sequencing opens Wong Sequencing.
**Then** it reads as active, and its mutating controls are offered.
**And never** does Wong Sequencing report Wong Lab's archive as its own.

### A5 — A group admin cannot unarchive their own group · `MVP` · `boundary`

Covers the enforcement hole named in [Use Cases](./use-cases.md#enforcement-holes).

**Actor** Alice.
**Given** Wong Lab is archived.
**When** Alice looks for a way to reactivate it.
**Then** no unarchive control is offered, and a direct attempt is refused.
**And never** does a group admin reactivate the governance authority a platform admin
suspended.

### A6 — Reparenting is not offered · `Later` · `boundary`

**Actor** Dana.
**Then** no control moves a group under a different parent, and the page says the operation
is not available rather than failing silently.

---

## B. Membership

### B1 — Adding a member changes what they reach · `MVP` · `journey`

Covers use cases 18 and 20.

**Actor** Alice, then Frank.
**Given** Frank is a member of Patel Lab and reaches nothing of Wong Lab's.
**When** Alice adds Frank to Wong Lab as a member.
**Then** Frank's next page load lists `PCM230203` among the datasets he can reach, and the
dataset explains that the access arrives through Wong Lab.
**When** Alice changes Frank's role to admin.
**Then** Frank gains the governance controls on Wong Lab's page, and gains oversight of Wong
Sequencing.
**And never** does Frank gain governance of the Center, of Imaging Core, or of anything Wong
Lab does not own.

### B2 — Removing a member removes their access, and keeps the record · `MVP` · `journey`

Covers use cases 19 and 34.

**Actor** Alice, then Frank.
**Given** Frank is a member of Wong Lab, reaching `PCM230203` through the owning-group grant.
**When** Alice removes Frank.
**Then** Frank's next page load no longer lists `PCM230203`, and opening it directly is
refused. The membership history still shows that Frank was a member, and when he stopped
being one.
**And never** is the historical row absent, and never does Frank retain a stale page that
still serves the data.

The current member list shows current members only. The membership history lives in the
group's audit log, as `GROUP_MEMBER_ADDED` and `GROUP_MEMBER_REMOVED`.

### B3 — Membership can end on a date · `Next` · `journey`

Covers use case 43.

**Actor** Alice, then Vic.
**Given** Vic has an account and no groups.
**When** Alice adds Vic to Wong Lab with an end date in the past.
**Then** Vic is not treated as a member, reaches nothing through Wong Lab, and appears in the
membership history rather than the current member list.

### B4 — A member sees the group, not its governance · `MVP` · `boundary`

Covers the group visibility model in [Design](./design.md#groups-visibility-model).

**Actor** Bob.
**Given** Bob is an ordinary member of Wong Lab.
**When** Bob opens Wong Lab.
**Then** Bob sees the name, tagline, archive status, the full member list with roles, the
parent group, and the immediate children.
**And never** does Bob see who assigned each member, the grants issued to the group, the
grants on the group's resources, or the audit log.

### B5 — Transitive and direct members see the same group page · `MVP` · `invariant`

**Actor** Carol and Bob.
**Then** Carol's view of the Center matches Bob's view of the Center, field for field. There
is no tiered visibility based on membership path.

---

## C. Invitations

### C1 — Inviting somebody who has no account · `MVP` · `journey`

Covers [Invitations](./invitations.md).

**Actor** Alice, then Vic.
**Given** Vic has no account and no pending invitation.
**When** Alice invites Vic's address to Wong Lab as a member.
**Then** the invitation appears in Wong Lab's outstanding list, marked pending with an expiry
date. An email reaches Vic's address carrying a link.
**When** Vic opens the link, signs up, and lands in the portal.
**Then** Vic is already a member of Wong Lab, and is told so. The invitation reads accepted.
**And never** does the invited address appear in the page URL after the page has loaded, and
never does the invitation stay pending after it has been spent.

### C2 — The link is single use · `MVP` · `boundary`

**Actor** Vic.
**Given** Vic has already accepted the invitation.
**When** Vic opens the same link again.
**Then** the page says the invitation is no longer valid, and offers no reason beyond that.
**And never** does the page distinguish an accepted invitation from an expired, cancelled, or
never-issued one, because the endpoint that answers is unauthenticated.

### C3 — The wrong person clicks the link · `MVP` · `boundary`

**Actor** Frank.
**Given** Frank is signed in, and the invitation was sent to Vic's address.
**When** Frank opens Vic's invitation link.
**Then** Frank is told the invitation was sent to a different address, and is not added to
Wong Lab.
**And never** is Vic's address shown to Frank.

### C4 — An invitation cannot change an existing role · `MVP` · `boundary`

**Actor** Alice, then Bob.
**Given** Bob is already a member of Wong Lab.
**When** Alice invites Bob's address as an admin, and Bob accepts.
**Then** Bob remains a member. The invitation closes, and his role does not change.
**And never** is an invitation a route to privilege escalation.

The system closes the door earlier than the flow imagines. Inviting an existing member is
refused with a 400 saying the person is already a member, so no invitation is ever issued.

### C5 — An archived group takes no invitations · `Next` · `boundary`

**Actor** Alice.
**Given** Wong Lab is archived.
**Then** the invite control is absent from the group page, not present and failing.
**And** an invitation issued before the archive, when applied afterwards, tells the person
the group has been archived and closes itself.

### C6 — An admin cannot cancel another group's invitation · `MVP` · `boundary`

**Actor** Erin.
**Given** Wong Lab has a pending invitation.
**When** Erin attempts to cancel it from Patel Lab's context.
**Then** the request is refused, and Wong Lab's invitation stays pending.

### C7 — A lapsed invitation is sent again · `MVP` · `journey`

Covers use case 61 and
[Invitations — Re-inviting after an invitation lapses](./invitations.md#re-inviting-after-an-invitation-lapses).

**Actor** Alice, then Vic.
**Given** Wong Lab's invitation to Vic has passed its expiry, and the list marks it Expired.
**When** Alice invites the same address again.
**Then** a second mail arrives at that address. The lapsed invitation reads withdrawn, with
the reason that it expired, and the new one reads pending.
**When** Vic opens the first link.
**Then** the page says the invitation is no longer valid.
**And never** does an admin have to withdraw a lapsed invitation before sending another.

No spec covers this flow. The world drives the API and holds no database handle, so it cannot
age an invitation, and the expiry is seven days away. The API suites cover the service, and the
missing browser half is `.todo/local/L6-verification-and-e2e-gaps.md` T15.

---

## D. Dataset creation and ownership

### D1 — A dataset is born with an owner and a grant · `MVP` · `journey`

Covers use cases 23 and 59, and
[decision 12](./decisions.md#_12-owning-group-members-get-a-seeded-grant-not-structural-read).

**Actor** Alice, then Bob.
**Given** Alice administers Wong Lab.
**When** Alice creates a dataset owned by Wong Lab.
**Then** the dataset's owner reads Wong Lab. Its access list contains one grant naming Wong
Lab as the subject, issued by the system.
**When** Bob opens the new dataset.
**Then** Bob can read it, and the page says the access arrives through Wong Lab's grant.
**And never** is the dataset creatable without an owning group, and never does a member read
it through an invisible rule rather than through a listed grant.

### D2 — Revoking the owning-group grant removes members' access · `MVP` · `boundary`

Covers the consequence accepted in
[decision 12](./decisions.md#_12-owning-group-members-get-a-seeded-grant-not-structural-read).

**Actor** Alice, then Bob.
**When** Alice revokes the seeded Wong Lab grant on `PCM230203`.
**Then** Bob can no longer read it, and the dataset leaves his list.
**And** Alice still governs it, because governance comes from ownership rather than from the
grant.

### D3 — A contributor uploads into their own group · `Next` · `journey`

Covers the contribution rules in [Design](./design.md#ownership-assignment-rules).

**Actor** Bob.
**Given** Wong Lab allows user contributions and Patel Lab does not.
**When** Bob starts a new dataset.
**Then** the owning-group chooser offers Wong Lab and not Patel Lab. With one eligible group
the choice is made for him and stated on the page.
**And never** does uploading confer any governance authority on Bob.

### D4 — Two groups may hold the same dataset name · `MVP` · `invariant`

Covers the per-group naming rule in [Dataset storage](./dataset-storage.md).

**Actor** Alice, then Erin.
**When** Alice creates `SHARED-NAME` in Wong Lab, and Erin creates `SHARED-NAME` in Patel
Lab.
**Then** both succeed, and each admin sees only their own.
**And never** does either refusal, error message, or name-availability check tell one group
that the other holds the name.

### D5 — A dataset cannot be created under an archived group · `Next` · `boundary`

**Actor** Alice.
**Given** Wong Lab is archived.
**Then** Wong Lab is absent from the owning-group chooser, and a direct attempt is refused
naming the archive.

### D6 — Transfer of ownership is not offered · `Later` · `boundary`

Covers use case 24.

**Then** no control moves a dataset between groups, on any page, for any actor.

### D7 — A group imports a directory from its own import source · `MVP` · `journey`

Covers the import route in [Dataset creation](./dataset-creation.md#import-sources-are-visible-to-everyone).

**Actor** Alice, then Erin.
**Given** Alice administers a lab that owns an `ACTIVE` import source, and the source holds a
directory nobody has imported.
**When** Alice opens New Dataset, chooses Import, picks the source, and picks the directory.
**Then** the name fills in from the directory, and a name the lab already holds is marked on
the field. The import succeeds, the dataset appears in her list owned by the lab, and one
`integrated` workflow has started on it.
**When** Erin, who administers Patel Lab, lists her import sources and imports the same path
into Patel Lab.
**Then** the source is absent from her list, and the import is refused with 403. Erin may
create datasets in Patel Lab, so the refusal comes from the source and not from the group.
**And never** is one directory registered as two datasets. A second import of the path is
refused with 409, and the refusal names neither the dataset nor its group.

---

## E. Collections

### E1 — A collection extends access to everything in it · `Next` · `journey`

Covers use case 25.

**Actor** Alice, then Frank.
**Given** Aim 2 Release holds `PCM230203`, and Frank holds a collection grant that lets him
list its contents and download.
**When** Alice adds `PCM230204` to the collection.
**Then** Frank reaches `PCM230204` without any new grant, and the dataset says the access
arrives through Aim 2 Release.
**When** Alice removes `PCM230203` from the collection.
**Then** Frank loses it, and the collection's history still records that it was once a
member.

### E2 — A collection holds only its own group's datasets · `MVP` · `boundary`

Covers [decision 5](./decisions.md#_5-collections-stay-single-owner).

**Actor** Alice.
**When** Alice looks for `PAT-1101` while adding datasets to Aim 2 Release.
**Then** it is not offered, and a direct attempt is refused.
**And never** can one group extend access to data it does not own.

### E3 — A collection tab shows less than its grant suggests · `Next` · `boundary`

Covers the tab visibility table in
[UI information architecture](./ui-information-architecture.md).

**Actor** Frank.
**Given** Frank holds a grant that lets him list the collection's contents.
**Then** Frank sees the collection's public attributes and its dataset rows, and each row
shows only what his own per-dataset access allows.
**And never** does Frank see grant counts, audit-event counts, the grant table, or the audit
log.

---

## F. Grants

### F1 — An admin grants access without a request · `MVP` · `journey`

Covers use cases 29, 30, and 32.

**Actor** Alice, then Frank.
**When** Alice issues a preset named for ordinary research use to Frank, on a collection
holding `PCM230203`.
**Then** the collection's access list gains a row naming Frank, the preset, the access it
confers, and the date it ends. Frank reaches the collection and the dataset on his next page
load.
**And** issuing the same preset again changes nothing and says so.
**And never** is a preset offered for the dataset itself, because presets are scoped to
collections.

### F2 — A grant to a group reaches its descendants · `MVP` · `invariant`

Covers the grant transitivity rule in [Design](./design.md#grant-transitivity-through-group-hierarchy).

**Actor** Alice, then Carol.
**When** Alice grants Wong Lab access to `IMG-0007` — issued by Imaging Core's admin in the
fixture, so the flow is really about who receives it.
**Then** Carol, who is a member of Wong Sequencing and not of Wong Lab directly, reaches
`IMG-0007`, and the explanation names the chain.
**And never** does a grant to a leaf group reach its parent's members.

### F3 — One grant covers what it implies · `MVP` · `invariant`

Covers [decision 7](./decisions.md#_7-access-types-imply-one-another).

**Actor** Alice, then Frank.
**When** Alice grants Frank the ability to download `PCM230203`, and nothing else.
**Then** Frank can see the dataset's metadata, list its files, and download them. The access
list holds one row, not three. The explanation says which wider access supplies each narrower
one.
**And never** does the page ask Alice to grant the narrower types separately, and never does
Frank hold download without being able to see the dataset.

### F4 — Revoking a narrower type changes nothing · `MVP` · `boundary`

Covers the consequence recorded in
[decision 7](./decisions.md#_7-access-types-imply-one-another).

**Actor** Alice.
**Given** Frank holds download on `PCM230203`.
**When** Alice tries to revoke Frank's ability to view metadata.
**Then** the page says the removal will not change what Frank can reach, and names the grant
that still confers it.
**And never** does the interface report a removal that did nothing as a success.

### F5 — Revocation takes effect immediately · `MVP` · `journey`

Covers use cases 12 and 31.

**Actor** Alice, then Frank.
**When** Alice revokes Frank's grant while Frank has the dataset page open.
**Then** Frank's next action on that page is refused, and the dataset leaves his list on
reload.
**And never** does a revoked grant keep working on any surface — listing, detail, file view,
or download.

### F6 — A longer grant closes a shorter one, and says so · `Next` · `invariant`

Covers supersession, case 1, in [Design](./design.md#supersession).

**Actor** Alice.
**Given** Frank holds download on `PCM230203` until the end of the month.
**When** Alice issues the same access with no end date.
**Then** the access list shows one live grant with no expiry, and the closed grant is
labelled as superseded rather than revoked, linked to its replacement.

### F7 — A shorter grant writes nothing, and says why · `Next` · `boundary`

Covers supersession, case 2.

**Actor** Alice.
**Given** Frank holds download on `PCM230203` for a year.
**When** Alice issues the same access for three days.
**Then** the page states that nothing will be written, names the covering grant, and gives
its expiry.
**And never** does an approved or issued item appear with no grant and no explanation.

### F8 — Coverage held through a group is visible before issuing · `MVP` · `boundary`

Covers risk 2 in [Trust and communication](./trust-and-communication.md).

**Actor** Alice.
**Given** Patel Lab already holds download on `PCM230203`, and Frank is a member of Patel
Lab.
**When** Alice prepares a personal grant of the same access to Frank.
**Then** the preview names Patel Lab's grant as already reaching Frank.
**And never** does the preview report the grant as new access when the subject already has
it by another path.

### F9 — Every grant row says where it came from · `MVP` · `invariant`

Covers risk 5 in [Trust and communication](./trust-and-communication.md).

**Then** each row in an access list names either the preset that supplied it, the request
that authorized it, or the admin who issued it directly. A row that came from a preset shows
the preset's name rather than a bare list of access types.

### F10 — Only the owning group's admins may grant · `MVP` · `boundary`

Covers the consumption-versus-governance split in [Design](./design.md#authorization-paths-consumption-vs-governance).

**Actor** Dana, then Erin, then Bob.
**Given** `PCM230203` is owned by Wong Lab.
**Then** Dana sees the grant list read-only, with the reason stated, and no issue or revoke
control. Erin sees nothing of the dataset at all. Bob sees the dataset but not its grant
list.
**And never** does oversight, sibling admin standing, or plain membership confer the ability
to change who may consume the data.

---

## G. Access requests

### G1 — The whole loop, in one flow · `MVP` · `journey`

Covers use cases 5, 8, 9, 27, and 54.

**Actor** Frank, then Alice, then Frank again.
**Given** Frank can see `PCM230203`'s metadata and cannot read its files.
**When** Frank requests access with a justification and an end date.
**Then** the request is immediately visible to Frank as under review, not as a draft. Alice
receives a notification naming the dataset and the requester.
**When** Alice opens the request.
**Then** she sees the justification, the access asked for, and a statement of exactly what
approving will confer, including anything already covered.
**When** Alice approves it.
**Then** Frank receives a notification, the request reads approved, and the dataset appears
in Frank's list. The dataset's access list gains a grant naming the request as its source.
**And never** does the request sit in a state only the database can see, and never does an
approval fail to reach the requester.

### G2 — A rejection carries its reason · `MVP` · `journey`

Covers use case 28.

**When** Alice rejects Frank's request with a written reason.
**Then** Frank's notification and the request page both carry that reason verbatim.
**And never** does Frank gain any access.

### G3 — A request against an invisible resource is refused · `MVP` · `boundary`

Covers use case 5 and the check in
[Design — Filing a request](./design.md#filing-a-request).

**Actor** Frank.
**Given** Frank cannot see `IMG-0007`, which belongs to Imaging Core.
**When** Frank attempts to file a request against it, by any route the browser offers or by
addressing it directly.
**Then** the request is refused.
**And never** does the refusal confirm that the resource exists.

### G4 — A request cannot name access that does not apply · `MVP` · `boundary`

**When** a request against a dataset names an access type defined for collections.
**Then** it is refused.

### G5 — Approved does not mean current · `MVP` · `invariant`

Covers risk 1 in [Trust and communication](./trust-and-communication.md), the highest-risk
case in the design.

**Actor** Frank.
**Given** Frank's request was approved and Alice later revoked every grant it produced.
**When** Frank opens his request history.
**Then** the request still reads approved, and beside it the page states plainly that nothing
from it is in force, with the date of the last revocation.
**And never** does any surface render the approval alone.

### G6 — A requester can see their own requests · `MVP` · `journey`

Covers use case 8, and a gap the [Dashboard](./ui-information-architecture.md#dashboard) closes.

**Actor** Frank.
**Then** one page lists every request Frank has filed, across every resource, with its status
and its current access.

### G7 — A reviewer sees only their own queue · `MVP` · `boundary`

**Actor** Erin.
**Given** Frank's request is against a Wong Lab dataset.
**Then** Erin's review queue is empty, and the request is not reachable by her.
**And never** does a group admin review a request on another group's resource.

### G8 — Withdrawal is the requester's alone · `MVP` · `boundary`

**Actor** Frank, then Alice.
**Then** Frank may withdraw his own open request. Alice may not withdraw it, and may only
decide it.

### G9 — A stale request closes itself · `Next` · `journey`

Covers use case 33 as applied to requests.

**Given** a request has been under review beyond the configured window.
**Then** it is no longer in the queue, reads as expired, and confers nothing.

### G10 — Two reviewers colliding fails loudly · `Later` · `boundary`

Covers the accepted race in
[Decision 14](./decisions.md#_14-the-no-overlap-constraint-and-supersession-stay).

**Then** one approval is refused with a conflict the reviewer can see and retry, and the
second attempt succeeds.
**And never** does the collision produce two live grants for the same subject, resource, and
access type.

---

## H. Zero-default access and the empty portal

### H1 — A user with nothing sees nothing · `MVP` · `boundary`

Covers the corollary in [Design](./design.md#zero-default-access-for-non-privileged-users).

**Actor** Quinn.
**When** Quinn signs in and visits every list page.
**Then** every list is empty. No dataset, collection, group, grant, request, or audit record
appears.
**When** Quinn addresses `PCM230203` directly by its identifier, and then by its slug.
**Then** both are refused, and the refusal does not confirm that the resource exists.
**And never** does a count, a total, a badge, a search suggestion, or an error message
disclose the existence of anything Quinn cannot reach.

### H2 — An empty page explains itself · `MVP` · `journey`

Covers risk 8 in [Trust and communication](./trust-and-communication.md).

**Actor** Quinn.
**Then** the landing page says plainly that Quinn has no access yet, and offers the next step
rather than rendering a blank frame.
**And** the three empty states are distinguishable: nothing matches the filter, nothing is
visible to you, and nothing exists here.

### H3 — Metadata and data are gated separately · `MVP` · `boundary`

Covers postures B.5 and B.6 in [Use Cases](./use-cases.md#_5-dataset-visibility).

**Actor** Frank.
**Given** `PCM230203` is discoverable and locked.
**Then** Frank sees its title, description, method, and owning group, and is offered a way to
ask for it. He cannot list its files, open one, or download the bundle.
**And never** does a file name, a file count, or a byte total leak through the metadata view.

### H4 — Search does not leak · `MVP` · `boundary`

Covers posture C.10.

**Actor** Frank.
**Given** `PCM230203` is internal to Wong Lab.
**When** Frank searches for its exact name.
**Then** nothing is returned, and the result count is zero rather than "hidden".

---

## I. Explainability

### I1 — Every allow names its source · `MVP` · `invariant`

Covers use cases 4 and 55.

**Then** for every dataset a person can reach, the page states in one sentence why, naming
the group, the collection, the preset, or the direct grant that carried it. The sentence is
the same on the dataset page, in the access list, and in any explanation tool.

### I2 — Every deny names what is missing · `MVP` · `invariant`

**Then** a refusal says what would be needed, such as an unapproved request or a group the
person does not belong to. It never says only that access was denied.

### I3 — An implied access says which wider access supplies it · `MVP` · `invariant`

Covers the explanation hop promised by
[decision 7](./decisions.md#_7-access-types-imply-one-another).

**Then** where Frank can view metadata because he holds download, the page says so.

---

## J. Oversight

### J1 — Oversight reads and cannot act · `MVP` · `boundary`

Covers the oversight definition in [Design](./design.md#oversight-visibility) and risk 4 in
[Trust and communication](./trust-and-communication.md).

**Actor** Dana.
**Then** on every descendant group, dataset, and collection, Dana sees metadata, members,
datasets, grants, and audit records, under a visible statement that the view is read-only
oversight.
**And never** is a grant, revoke, edit, membership, collection-membership, or transfer
control present on any of those pages.

### J2 — Oversight stops at the branch · `MVP` · `boundary`

**Actor** Alice.
**Then** Alice oversees Wong Sequencing and nothing else. Patel Lab and Imaging Core are
absent from every list she sees.

---

## K. Archived state applied uniformly

### K1 — Archived state binds a platform admin · `Next` · `boundary`

Covers [decision 17](./decisions.md#_17-resource-state-is-checked-after-authorization).

**Actor** Priya.
**Given** Wong Lab is archived.
**Then** every mutating control on Wong Lab and its resources is absent for Priya, exactly as
it is for Alice, with unarchive as the sole exception.

### K2 — A reading action survives archiving · `Next` · `invariant`

**Then** on an archived group, every read — metadata, members, grants, audit, outstanding
invitations — still works for whoever could read it before.

---

## L. Audit

### L1 — Material actions are recorded · `MVP` · `journey`

Covers the auditing section in [Design](./design.md#auditing-and-observability).

**When** Alice issues a grant, revokes it, adds a member, removes a member, and archives the
group.
**Then** each appears in the audit view with the actor, the authority, the resource, and the
time.
**And** the audit view is one step from the confirmation of each of those actions.

### L2 — The audit log is not public · `MVP` · `boundary`

Covers use case 57.

**Actor** Frank, then Bob, then Quinn.
**Then** none of them reaches the platform audit stream, by page or by direct address.

---

## M. System principals

### M1 — A grant to everyone signed in reaches everyone signed in · `MVP` · `journey`

Covers [decision 3](./decisions.md#_3-a-public-principal-exists-and-everyone-is-renamed).

**Actor** Alice, then Quinn.
**When** Alice grants the authenticated-users principal the ability to view `PCM230203`'s
metadata.
**Then** Quinn, who belongs to no group, sees the dataset and its metadata, and the page says
the access arrives through that principal.
**And never** can Quinn list its files or download it.

### M2 — The principals cannot be edited · `MVP` · `boundary`

**Actor** Priya.
**Then** neither principal can be renamed, deleted, given members, or given subgroups.

### M3 — A signed-out reader gets only what is published · `Later` · `boundary`

Covers [Profiles](./profiles.md).

**Given** a group's profile is public and a collection's is not.
**Then** a signed-out reader sees the group's name, tagline, about body, links, and
citation, and no member count, no admin email address, and no ancestor group. The private
collection answers as though it does not exist, rather than as forbidden.
**And never** does a signed-out reader resolve a grant made to the authenticated-users
principal.

---

## N. Consistency across surfaces

### N1 — Every surface agrees about one dataset · `MVP` · `invariant`

Covers use cases 11, 12, and 56.

**Actor** Frank.
**Given** Frank holds no access to `PCM230203`.
**When** Frank tries the dataset list, the dataset page, the file list, a single file
download, the bundle download, the workflow view, and any programmatic route the browser
itself calls.
**Then** every one refuses.
**And never** does a page render its shell and then serve the data through a call that
authorizes differently.

### N2 — The file browser is grant-checked wherever it appears · `MVP` · `boundary`

Covers the shared-component hazard in [v2 cut-over](../v2-cutover.md#shared-ui-components-need-a-v1-story).

**Then** downloading a file from a v2 dataset page enforces the same grant as the dataset
page itself, and a person without download access is refused by the download itself, not
only by the button being hidden.

### N3 — A capability the page hides is also refused by the server · `MVP` · `invariant`

**Then** for each control this page asserts is absent, addressing the underlying operation
directly is also refused. Hiding a control is a courtesy; the refusal is the security
property, and both are asserted.

---

## O. The landing page

### O1 — Each persona lands somewhere true · `Next` · `journey`

Covers the [Dashboard](./ui-information-architecture.md#dashboard).

**Actor** Quinn, Bob, Alice, and Priya in turn.
**Then** each sees a page that renders without error, with sections composed from what is
true of them: personal sections for everybody, governance sections for Alice and Priya, and
platform sections for Priya alone.
**And never** does a section render a number no query produced, and never does any section
issue a call the actor is not allowed to make.

---

## P. Deliberately absent

Each of these is asserted as absent rather than left untested. A feature that half exists is
worse than one that does not, and a test that fails when it appears is how the boundary stays
honest.

| Absent thing | Flow asserts |
|---|---|
| Dataset ownership transfer | No control offers it, on any page |
| Group reparenting | No control offers it |
| Access renewal | A request cannot be filed as a renewal |
| Cross-group collections | A collection cannot take another group's dataset |
| Restoring a deleted dataset | Deletion cannot be undone, so no control offers it |
| Access history as of a past date | Not offered; membership history is still readable |
| Compliance reports | Not offered |
| Training or agreement preconditions | No dataset presents one |
| Public dataset pages | No dataset is reachable signed out |

---

## Coverage against the use cases

Every `MVP` use case maps to at least one flow. The table is the check that this page is
complete rather than merely long.

| Use case | Flows |
|---|---|
| 1 Browse what I can reach | H1, N1 |
| 2 Search what I cannot reach | H3, H4 |
| 4, 55 Understand why | I1, I2, I3 |
| 5 Request a dataset | G1, G3 |
| 8 Track request status | G6 |
| 9, 54 Be notified | G1, G2 |
| 11, 12, 56 Consistency and revocation | F5, N1, N2 |
| 14, 15 Create groups | A1 |
| 18, 19, 20 Membership | B1, B2 |
| 23, 59 Dataset ownership | D1, D4 |
| 27, 28 Approve and reject | G1, G2 |
| 29, 30, 31, 32 Grant and revoke | F1, F2, F5, F10 |
| 57 Audit visibility | L2 |
| 60 One authorization model | N1, N2 |
| A.1, A.2 Public postures | M1 |
| B.5–B.7 Discoverable and locked | H3, G1, I2 |
| C.9–C.11 Group-internal | D1, H4, F1 |

`Next` and `Later` use cases are covered where a flow exists above, and are otherwise listed
in [Deliberately absent](#p-deliberately-absent).

---

## What this suite is not for

**It is not a unit test of the authorization engine.** The order over access types, the
closure table, and the state checks each deserve tests close to the code, where a
case costs milliseconds rather than seconds. This suite asserts that the engine's answers
reach the screen intact.

**It is not a performance harness.** A flow may notice that a page never finishes loading. It
must not assert a duration.

**It is not a replacement for reading refusals.** Several flows above assert that a control
is absent. Absence is easy to assert accidentally — a selector that matches nothing passes
for the wrong reason — so each such flow must also assert that something expected *is*
present on the same page.

**It must not mutate seeded rows.** Every write lands on a resource the run created. This is
what makes the suite safe to run against a developer's own database.

**It must not edit the v1 suite in `tests/`.** The v1 suite keeps working unchanged until the
cut-over, as [v2 cut-over](../v2-cutover.md) requires of every legacy surface.

## Keep this page current

When a use case changes tier, change the flow's tier here in the same commit. When a flow
finds a defect, record the defect in the flow rather than weakening the assertion. When a
deliberately absent feature is built, move it out of
[Deliberately absent](#p-deliberately-absent) and write the journey flow that replaces the
boundary one.

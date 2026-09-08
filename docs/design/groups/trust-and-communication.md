---
title: Trust and Communication
order: 7
status: active
implemented: none
last_verified: 2026-09-03
---

::: warning Design record — active
A review of where the [groups design](./design.md) is correct at the data layer but
liable to mislead a user at the surface, and what to do about each case. None of the
mitigations below are built.
:::

# Trust and Communication

The authorization model separates two things that users experience as one: the
**decision** recorded on an access request, and the **access** that a grant actually
confers. The separation is right. Every place the two are not reunited for the reader
is a place where the system tells a user something that is not true of their experience.

This record lists those places, states the mitigation for each, and then records the
parts of the design that already work in the user's favour. Read it alongside
[UI Information Architecture](./ui-information-architecture.md), which fixes where these
messages appear.

## Where trust erodes

### 1. An `APPROVED` request whose grants are all revoked

A user opens their request history, reads `APPROVED`, and has no access. The design
defers reuniting the two states to the UI layer. Anywhere that reunion is missing — an
email, a notification badge, an access-history row — the system contradicts itself.
`APPROVED` is a terminal label that carries strong meaning to a non-technical reader,
and the gap is invisible at the data layer.

This is the highest-risk case in the design.

**Mitigations.** Never render `APPROVED` alone on a surface a non-technical user sees;
render the decision with the current access state beside it, as in
`APPROVED · access revoked on 2026-03-10`. Compute that on the server: the request
detail endpoint should return an effective-access summary derived from the active
grants, so no client has to infer it. Revocation emails should name the request that
granted the access, closing the loop between the two messages.

### 2. Case 2 supersession — an approved item with no new grant

When the grant that would be created is shorter than one that already exists, the item
is marked `APPROVED` and no grant is written. To the requester this looks like a
failure: approval arrived, nothing changed. The design records the skip in the audit
log, which a non-admin user never reads.

**Mitigations.** Notify the subject at approval time and say why: the access type is
already covered by an existing grant, naming that grant and its expiry. In the request
detail view, show the covering grant inline on the approved item. An approved item must
never appear with no grant and no explanation.

### 3. Supersession closes a grant with no notification

Case 1 supersession ends an active grant early and writes a replacement. The audit
record captures it. Nothing in the design tells the subject, whose access timeline just
changed, or the admin who issued the original grant and communicated its end date.

**Mitigations.** Treat early closure by supersession as its own notification event, sent
to the subject and to the original granting admin, naming the old expiry, the new one,
and the replacing grant. In the subject's access history, show the closed grant with its
`SUPERSEDED` revocation type linked to its replacement, so the chain is visible without
a support request.

### 4. Oversight visibility reads as authority

An ancestor group admin can see members, datasets, grants, and audit records across
every descendant group, and can act on none of it. The overseen party is not told the
visibility exists. The overseer can see a problem with no path to fixing it. Neither
half builds trust.

**Mitigations.** Make oversight views visually distinct and read-only, with the reason
stated: the caller has oversight but not governance authority, and the group's own admin
is the person who can act. Give the overseer at least one formal escalation path rather
than leaving them to find the admin themselves. Let a group admin see which ancestor
admins hold oversight of their group; people generally expect to know who can see their
work.

### 5. A preset request becomes a flat list of grants

A user asks for "Standard Researcher Access" and later asks what access they have. The
effective-access view shows individual access types and a request id. The preset
narrative is reconstructable only by joining grant to access request to access request
item, and the design leaves that join to the presentation layer.

**Mitigations.** Do the join on the server and expose an access-explanation endpoint
that returns grants already grouped by request and annotated with the preset name, so
every surface inherits it. Even without grouping, every grant row should carry a "via"
label naming the preset and request it came from. Given how cheap the label is and how
much of the design rests on explainability, treat this as a launch requirement rather
than an enhancement.

### 6. Intra-preset partial approval forces manual decomposition

A reviewer who wants four of a preset's six access types must reject the preset item and
add the four individually. The workflow requires them to know what is inside a preset in
order to express a common outcome, which undercuts the preset as an abstraction.

**Mitigations.** Allow approval with exclusions — approve the preset minus named access
types, expanding the approved subset at write time and recording the exclusions on the
request item. Failing that, offer conversion: on rejecting a preset, show its
composition and let the reviewer pick from it, pre-populated. At minimum, state the
constraint inline in the review UI so reviewers do not discover it by failing.

### 7. Membership on an archived group is frozen with no way through

Archiving freezes membership: no adds, no removes. A legitimate change — a departing
member, a replacement — needs a platform admin, and the design names no path to one.
For a group admin this is an unexplained wall.

**Mitigations.** Record an escalation contact as part of the archive action, so there is
a named recipient afterwards. Give group admins of archived groups a single in-system
action that files a tracked membership-change request to a platform admin. Notify all
group admins on archival, saying what changed, what is now prohibited, and who to reach.

### 8. Zero-default access produces unexplained empty pages

The design is explicit that a user with no grants and no structural authority cannot
know a resource exists. That is correct for security. It also means a new user, or one
whose grants have expired, meets an empty interface with nothing to explain it, and may
reasonably conclude the system is broken.

**Mitigations.** Distinguish three empty states rather than one. *No results* — things
exist and are visible, none match the filter. *No access* — the user can see nothing and
should be told they can request access. *Nothing here* — genuinely empty. The middle
state is the trust-critical one and needs the query layer to signal that inaccessible
rows were filtered out. When grants expire, say so proactively at next login rather than
letting the page silently empty. Keep the discovery and request entry point visible even
at zero access, so the path to asking does not depend on already knowing what exists.

## What the design already gets right

**Request records are immutable.** Once a request reaches a terminal state it is never
mutated. A user can always see what was decided, by whom, and when, regardless of what
later happened to the grants. This is the anchor the mitigations above hang from.

**Partial states are named rather than hidden.** The design requires surfacing a partial
outcome explicitly — four of six access types remaining from a preset, for instance —
instead of blocking or silently narrowing. That posture should be applied to every
revocation and supersession path.

**Preset names are snapshotted at write time.** A historical record shows the preset name
as it was at submission, so renaming or retiring a preset does not corrupt the audit
trail.

**Supersession is labelled, not silent.** `SUPERSEDED` distinguishes an early closure
from a deliberate revocation, and the audit record can point at the replacing grant.

**Ownership transfer needs dual consent.** Requiring authority over both the source and
the target group protects against unilateral control shifts and leaves a clear record
that two parties agreed.

**Explainability is a hard invariant.** Every authorization decision traces to a specific
grant and membership chain. Maintained, this is the design's strongest long-run trust
asset — which is why item 5 above matters more than its size suggests.

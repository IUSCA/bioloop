---
title: Trust and Communication
order: 9
status: active
implemented: partial
last_verified: 2026-09-17
---

::: warning Design record — active
A review of where the [groups design](./design.md) is correct at the data layer but
liable to mislead a user at the surface, and what to do about each case. Each risk says
what is built and what is not.
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

### 1. An `APPROVED` request whose grants are all revoked — mostly built

A user opens their request history, reads `APPROVED`, and has no access. The design
defers reuniting the two states to the UI layer. Anywhere that reunion is missing — an
email, a notification badge, an access-history row — the system contradicts itself.
`APPROVED` is a terminal label that carries strong meaning to a non-technical reader,
and the gap is invisible at the data layer.

This is the highest-risk case in the design.

**Built.** Every request listing runs `withGrantCounts`, so each row arrives carrying
`access_summary`, and `AccessRequestCard` turns an approval with no live grant into a
sentence saying so. The summary is derived on the server, so no client infers it. What
remains is the revocation email naming the request that granted the access.

**Mitigations.** Never render `APPROVED` alone on a surface a non-technical user sees;
render the decision with the current access state beside it, as in
`APPROVED · access revoked on 2026-03-10`. Compute that on the server: the request
detail endpoint should return an effective-access summary derived from the active
grants, so no client has to infer it. Revocation emails should name the request that
granted the access, closing the loop between the two messages.

### 2. Case 2 supersession — an approved item with no new grant — partly built

When the grant that would be created is shorter than one that already exists, the item
is marked `APPROVED` and no grant is written. To the requester this looks like a
failure: approval arrived, nothing changed. The design records the skip in the audit
log, which a non-admin user never reads.

**Built.** The grant preview names the covering grant and its expiry, for the reviewer and
for the requester, including access that arrives through a group, a collection, or a system
principal. The request detail page lists what already reaches the subject beside the
decision. Nothing notifies the subject at approval time.

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

### 4. Oversight visibility reads as authority — partly built

An ancestor group admin can see members, datasets, grants, and audit records across
every descendant group, and can act on none of it. The overseen party is not told the
visibility exists. The overseer can see a problem with no path to fixing it. Neither
half builds trust.

**Built.** The dashboard names what a caller administers and what they merely oversee,
and says read-only in both the hero line and the group row. The escalation path and
letting a group admin see which ancestor admins oversee them are not built.

**Mitigations.** Make oversight views visually distinct and read-only, with the reason
stated: the caller has oversight but not governance authority, and the group's own admin
is the person who can act. Give the overseer at least one formal escalation path rather
than leaving them to find the admin themselves. Let a group admin see which ancestor
admins hold oversight of their group; people generally expect to know who can see their
work.

### 5. A preset request becomes a flat list of grants — closed

Each grant now records the preset that supplied it, whether an admin issued it directly or
an approval expanded it, so the Access tab names the preset rather than listing access
types with no shape. A grant an item named directly, or that two presets both supply,
records no preset, because a label naming one of two is worse than none.

### 6. Intra-preset partial approval forces manual decomposition — mostly dissolved

The premise was a preset of six independent access types. Access types carry a partial
order, and issuance reduces a preset to the types the order does not already supply, so no
seeded preset is worth more than two grants. A reviewer wanting "four of six" has almost
nothing left to decompose.

What survives is the narrow case of a preset whose reduced set still holds two incomparable
types, such as downloading and viewing sensitive metadata. A reviewer who wants one of the
two must still reject the preset item and add that type individually. The review UI should
state the constraint inline rather than let a reviewer discover it by failing.

@see [decision 7](./decisions.md#_7-access-types-imply-one-another) and
[Design — What a preset expands to](./design.md#what-a-preset-expands-to).

### 7. Membership on an archived group is frozen with no way through

Archiving freezes membership: no adds, no removes. A legitimate change — a departing
member, a replacement — needs a platform admin, and the design names no path to one.
For a group admin this is an unexplained wall.

**Mitigations.** Record an escalation contact as part of the archive action, so there is
a named recipient afterwards. Give group admins of archived groups a single in-system
action that files a tracked membership-change request to a platform admin. Notify all
group admins on archival, saying what changed, what is now prohibited, and who to reach.

### 8. Zero-default access produces unexplained empty pages — partly built

The design is explicit that a user with no grants and no structural authority cannot
know a resource exists. That is correct for security. It also means a new user, or one
whose grants have expired, meets an empty interface with nothing to explain it, and may
reasonably conclude the system is broken.

**Built.** A caller who reaches nothing and belongs to nowhere lands on a dashboard that
says access here is granted rather than assumed, that an empty page means nothing has been
shared with them, and offers the way to browse what they can see. That covers the landing
surface. The per-listing distinction below still needs the query layer to report that rows
were filtered out, which touches every listing.

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
outcome explicitly — one of a preset's two remaining access types, for instance — instead
of blocking or silently narrowing. That posture applies to every revocation and
supersession path. The revoke dialog carries it too: it says when a removal changes nothing
because a wider grant still confers the access, and it names what else a removal takes.

**A preset is retired rather than deleted.** `grant_preset.is_active` soft-disables one, so
a historical request still resolves the name it referenced. Snapshotting the name onto the
request item was designed and is not built; retirement without deletion covers the same
risk while presets stay platform configuration.

**Supersession is labelled, not silent.** `SUPERSEDED` distinguishes an early closure
from a deliberate revocation, and the audit record can point at the replacing grant.

**Ownership transfer needs dual consent.** Requiring authority over both the source and
the target group protects against unilateral control shifts and leaves a clear record
that two parties agreed.

**Explainability is a hard invariant.** Every authorization decision traces to a specific
grant and membership chain. Maintained, this is the design's strongest long-run trust
asset — which is why item 5 above matters more than its size suggests.

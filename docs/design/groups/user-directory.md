---
title: The user directory
status: design
implemented: full
last_verified: 2026-09-18
---

# The user directory

Several forms in v2 ask an admin to name a person. This page says who may search for people,
what a search returns, and what stays with the platform-admin listing.

`GET /v2/users` answers two different questions depending on who asks. What separates them is
the shape of the row, not the size of the result.

## Who may search, and what a search returns

| Caller | May search | Gets per person |
|---|---|---|
| Platform admin | Yes | The account record: roles, last login, login method, deletion state |
| Admin of any group | Yes | `subject_id`, `name`, `username`, `email` |
| Member of a group, holding no admin role | No — 403 | Nothing |
| Signed in, in no group | No — 403 | Nothing |
| Anonymous | No — 401 | Nothing |

The gate is the `list` action on the `user` policy, whose rule is `isAdminOfAnyGroup`. The
platform-admin short-circuit in the engine admits a platform admin before it runs.

## A group admin sees every account

The search matches `name`, `username`, and `email`, and it is not narrowed by any relationship
between the searcher and the person found. A lab admin can find somebody in a department they
have never worked with.

**This is the point rather than a gap.** Every surface that opens this search exists to bring in
somebody who is not already there. Giving access to a collaborator in another centre, adding a
new postdoc to a lab, naming the admin of a subgroup — in each case the person sought is by
definition outside the searcher's current groups. A directory narrowed to "people I already
share a group with" would answer none of these, and the admin would fall back to asking the
person for their exact username over email, which is the same disclosure with more friction.

The accounts are institutional. A name, a username, and a university address are what a campus
directory already publishes and what appears on any paper the person has written. The
searchers are people the system has already trusted with governance authority over data. Making
this particular lookup awkward protects very little and costs the primary workflow a great deal.

**What is withheld is the account as an account.** Roles, last login, login method, and deletion
state say how somebody uses the system rather than how to address them, and they are the facts
an attacker would want. Those stay with the platform-admin listing, which is the page for
administering accounts rather than for finding people. `DIRECTORY_FIELDS` in
`api/src/services/user_directory.js` is the one place the four disclosed columns are named.

Deleted accounts are absent from the directory at every level below platform admin. Somebody
who has left should not be offerable as a grant subject.

## Any term, including none

A search takes a term of any length, and an empty term lists the directory. `take` defaults to
ten and is capped at `MAX_PEOPLE_PER_PAGE`; `skip` pages, and `metadata.count` is the whole
match rather than the page, so a picker can say how much it is not showing.

There was a floor of three characters, defended as a privacy rule on the grounds that a shorter
term matches most of the directory. It did not survive contact with the form. A person typing
a name they half remember gets one or two characters in and sees "No results found", which is
the same thing the box says for a name nobody has, so the search reads as broken rather than as
withholding. Meanwhile the floor stopped nothing: three characters of a common surname still
returns a page, and paging past it was never prevented.

The honest position is the one above. Either this caller may look people up or they may not,
and that question is settled by the policy. Once it is settled, making the lookup hard to use
is friction rather than protection.

## Where the search is used

Three components wrap `UserSearchSelect`, and they reach five surfaces. All five are held by a
group admin or a platform admin, which is why `isAdminOfAnyGroup` is the right gate.

| Surface | Component | Who opens it |
|---|---|---|
| Give Access on a dataset | `grants/issue/SubjectSelector` via `DatasetGrantsTab` | Admin of the owning group |
| Give Access on a collection | `grants/issue/SubjectSelector` via `CollectionGrantsTab` | Admin of the owning group |
| Add a member to a group | `groups/AddGroupMemberModal` | Admin of that group |
| Initial admins of a new group | `groups/UserAdminSelect` via `GroupCreateModal` | Platform admin |
| Initial admins of a new subgroup | `groups/UserAdminSelect` via `GroupSubgroupsTab` | Admin of the parent |

The access-request subject picker is not on this list. It chooses between the requester
themselves and a group they administer, and never names another person.

## What this does not settle

**Rate limiting.** Nothing caps how fast a group admin may page the directory. If harvesting
ever becomes a concern, a request-rate limit is the control that addresses it, and it addresses
it without making the search useless. None exists today.

**A person's own visibility.** There is no setting by which somebody keeps themselves out of the
directory. Every active account is findable by every group admin. A system serving people who
need to be unlisted would need one, and it would have to answer what happens to a grant already
held by a hidden subject.

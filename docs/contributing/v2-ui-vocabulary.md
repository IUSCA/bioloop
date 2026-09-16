---
title: V2 UI Vocabulary
order: 8
---

# V2 UI Vocabulary

This page lists the words the v2 UI shows people for access-control concepts. It applies to
every string a user can read. That covers template text, labels, titles, empty states, toasts,
and API error messages that the UI displays in a toast.

Code keeps the domain names. The `grant` table, `GrantService`, `/grants` routes, `manage_grants`
capabilities, and `grant` audit event types stay as they are. The design record uses the domain
names too, as in the [groups design record](/design/groups/). Only the words on screen change.

## Say "permission" and "give access", never "grant"

Bioloop serves research labs. To that audience, "grant" means a research grant. A label such as
"Grants expiring soon" reads as a funding deadline. The UI therefore avoids "grant", "grants",
"granted", "granting", and "grant holder" in every user-facing string.

| Concept in code | Word on screen | Example |
|---|---|---|
| a grant, counted or listed | permission | "3 active permissions will be revoked" |
| creating a grant | give access | the **Give Access** button, "Give access to a user or group" |
| a grant's creation, in a detail row | given | "Given 2026-03-01", "Given manually by Alice" |
| the path by which a caller holds access | given to | "Given to you", "Given to Lab X, a group you belong to" |
| a heading or filter about access in general | Access | the **Access** tab, "Access expiring soon" |
| the `GRANT_HOLDER` standing | Has Access | the role badge |
| a grant whose resource is a collection | Applies to | "Applies to: Collection: BRCA Cohort" |
| a grant's expiry | this access | "This access will automatically expire at…" |
| a grant's creation, in the audit log | Permission … created | "Permission Download created on dataset X for user Y" |
| ending a grant | revoke | the **Revoke Access** button, "Access revoked successfully." |
| a subject, when its name is known | the name | "Alice will lose access associated with this permission" |
| a subject, with no name to hand | user or group | "Unknown user or group", "Users and groups whose access derives from this collection" |
| every subject with access | everyone | "Everyone with active permissions on this collection" |

Pick "permission" when the sentence counts or lists individual items. Pick "access" when the
sentence talks about what someone can do. "Access" does not take a plural, so "3 accesses" is
never correct.

## Name the user or group, never "the subject"

The code calls the user or group that holds a permission a subject. Readers do not know that
term. Use the name whenever the screen has one. Say "user or group" when it does not. Avoid
"member", which means group membership, and "recipient", which reads as email.

## Say "revoke", never "remove"

Ending a permission is always "revoke". Buttons say **Revoke** and **Revoke Access**. The bulk
action says **Revoke All Access**. Toasts say "Access revoked successfully." The badge on an
ended permission says "Revoked". The audit log says "revoked".

"Remove" stays correct for other things. People are removed from a group, and datasets are
removed from a collection. Both change membership, not a permission. Keeping one verb per
action lets a reader tell the two apart.

## Checking a change

Run the checker before merging a change that adds user-facing text:

```sh
bin/check-ui-vocabulary.sh
```

It reads template text, static attribute values, and string literals in the v2 UI and in the
API code whose messages reach a toast. It prints each hit as `file:line: [grant|remove|subject] text`.
It exits 1 when it prints anything.

The checker skips text that never reaches a user. That covers comments, identifiers such as
`grants.value` and `manage_grants`, SQL, all-caps enum values, `description:` and `reason:`
fields, logger and console calls, and thrown `Error`s.

The checker is a heuristic, so read every hit. It was measured against two known answers. On
the tree before the vocabulary change, it flagged 77 of the 78 changed hunks. The remaining
hunk was the second line of a sentence it had already flagged. On the "remove" wording, it
flagged 16 of 19 changes. The "subject" rule was added after both runs and found 16 strings on the current tree, all genuine once SQL fragments were excluded. Every other hit in both runs was genuine old wording. It misses
"remove" wording that does not sit near "access" or "permission", such as a bare "Removed"
badge, "Also removes", or "each removal". Treat an empty result as a good sign, not as proof.

Update the API test in `api/tests/state/rules.test.js` when you change a refusal message in
`api/src/state/builtin/grant.js`. That test asserts the exact wording.

## Keeping this page current

Add a row to the table when you introduce a new user-facing word for an access-control concept.
When a word on this page stops matching the screen, correct the page in the same change. Extend
`bin/check-ui-vocabulary.sh` when you add a rule it can test. Agents editing v2 UI text should
read this page first and amend it when they meet a case it does not cover.

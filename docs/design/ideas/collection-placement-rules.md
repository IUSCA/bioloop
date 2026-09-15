---
title: Collection Placement Rules
status: idea
implemented: none
last_verified: 2026-09-15
---

::: danger Idea — not committed to
**Nobody has committed to building this.** It proposes rules that place newly created
datasets into collections automatically. No `collection_rule` table, no `DATASET_CREATED`
hook, and no collection picker in the creation dialogs exist in the codebase.
:::

# Placing incoming datasets into collections automatically

## The problem

Every dataset in v2 has an owning group, and it reaches the system by one of three routes.
The watch script registers each new subdirectory of a watched directory. A user imports a
directory that already exists on a filesystem the API can read. A user uploads files from
the browser. All three converge on `createDataset` in `api/src/services/datasets_v2/create.js`.
@see [Dataset creation](../groups/dataset-creation.md)

A collection is how a group shares many datasets at once. A dataset is not in any
collection when it is created, so a group admin has to open the collection and add the
day's new datasets by hand. For a core facility whose instrument writes several datasets a
day, that is a daily chore with one obvious answer each time: everything from this
instrument goes into this collection.

Two things make the answer less obvious than it looks. Adding a dataset to a collection
changes who can read it, because a collection is an authorization container, and every
subject holding a grant on the collection reads the new dataset the moment its membership
row opens. And membership rows are history, not state. A row is closed rather than
deleted, so that "who could see this last March" is answerable from the data.
@see [Design — Collection Membership Control](../groups/design.md#collection-membership-control)
@see [Decision 1](../groups/decisions.md#_1-membership-and-collection-history-are-preserved)

So the feature is not "a saved search". It is automation that makes access decisions on
an admin's behalf, and it has to be as explainable and as auditable as a person doing the
same thing.

The use-cases record already anticipates this under item 50, policy-based access, which
"needs rule-based collection membership" and is marked `Later`. This page is the design
for that piece alone.
@see [Group use cases — item 50](../groups/use-cases.md#_4-1-scale-and-automation)

## What other systems do

The systems that solve this fall into two families, and the split matters more than any
individual feature.

**Live-query collections.** The collection *is* a query. Membership is recomputed as the
library changes, items enter and leave on their own, and in the strict versions nothing
can be added by hand. Lightroom Classic smart collections, Apple Photos smart albums, Plex
smart collections, Jellyfin smart lists, Microsoft Entra dynamic groups, and Configuration
Manager query rules all work this way. Entra is explicit that "you can't manually add or
remove a member of a dynamic membership group", and that members are removed when they
stop matching. Configuration Manager is the exception that allows direct rules, query
rules, include rules, and exclude rules on one collection, and it resolves conflicts with
one sentence: the exclude rule takes priority.

**Ingest-time routing.** A rule fires once, when an item arrives, and the result is an
ordinary static membership. Gmail filters and Outlook rules apply to incoming mail only.
Applying a new rule to what already exists is a separate, explicit step: Gmail's "also
apply filter to matching conversations" checkbox, or Outlook's "run rules now". iRODS
runs policy at the `acPostProcForPut` enforcement point after each upload. OMERO's import
targets derive the destination dataset from the directory path with a regex at import
time. Globus Flows are trigger-action rules started by a new-data event. The
community-built `immich-dynamic-albums` tool runs daily, adds matching assets to albums,
and never removes anything.

**A hybrid with a memory.** Okta group rules re-evaluate on attribute change, like the
live-query family, but a user an admin removes by hand goes onto the rule's exception list
and is not re-added, and deactivating a rule leaves its members in place. That is the
model for a system where membership carries consequences.

Two more observations from the same research shaped this design.

- Entra's documentation carries a security warning that applies here word for word: the
  safety of a rule-managed group "is only as strong as the write controls on the
  attributes in the rule". If the person who names a file can also name it into a group,
  the rule is a privilege escalation.
- The most upvoted Immich request asked for albums that update live *and* accept manual
  additions. Users want both mechanisms on one container. The strict live-query model
  cannot give them that.

DSpace is worth a sentence for the contrast. An item mapped into a second collection
"does not receive new access rights" there, because access follows the owning collection.
In Bioloop the opposite holds: access is exactly what a collection confers. So a DSpace-style
mapping is casual, and a Bioloop membership is not.

## Why the live-query model does not fit

A collection in Bioloop cannot be a query, for four reasons that all come from the
authorization design rather than from taste.

- **Rows must exist.** Effective access is computed from `collection_dataset` rows, and
  the history question is answered from their validity columns. A query has no rows and
  no history.
- **Every membership needs an actor.** `addDatasets` writes a `COLLECTION_DATASET_ADDED`
  audit event naming the actor. A recomputed membership has nobody
  to name.
- **Access must not change silently.** Use case 54 requires that a user learns when they
  gain or lose access. A rule that stops matching and silently closes a row breaks that
  for everyone reading through the collection.
- **Explanations come from the same query that decides access.** "You can read this
  through collection Aim 2 Release" is computed from a row. A membership that exists only
  while a predicate is true has no stable thing to point at.

So this design keeps membership as rows, and makes a rule a *producer* of rows. A rule
adds. A rule never removes. That is the Okta shape, with the exception list built from the
closed rows Bioloop already keeps.

## The proposal

There are three pieces, in increasing order of effort, and each is useful without the
next.

### 1. A collection picker in the creation dialogs

The import and upload modals gain an optional multi-select of collections owned by the
chosen owning group. The v2 creation routes accept `collection_ids` on the same per-item
body shape they take today, bulk included. `createDataset` calls
`collectionService.addDatasets` inside its own transaction, so the dataset and its
memberships commit together and the existing same-owning-group check and audit event run
unchanged.

The picker is shown only to a caller who holds `collection.add_dataset` on the collection,
which today means an admin of the owning group. A contributor uploading into a group with
`allow_user_contributions` does not see it. This is the point of keeping the picker and
the rules separate: the picker is a person choosing, and the person must have the
authority to grant access. A rule is the admin choosing in advance, and the contributor's
upload merely triggers it.

The watch script gets no picker, because a watched directory is a static fact and a rule
on `origin_path` expresses it with no worker change at all. See the first worked example
below.

### 2. Placement rules

A **placement rule** belongs to one collection and says which newly created datasets of
the collection's owning group should be added to it.

**Shape of a rule.** One rule is a flat list of predicates joined by AND. A collection may
hold several rules, joined by OR. A rule is either an `include` rule or an `exclude` rule,
and a dataset is placed when at least one include rule matches and no exclude rule does.
Exclude wins, as in Configuration Manager. There are no nested groups and no expression
language. Gmail has organised mail for two decades on exactly this shape, and the
authorization engine already has a precedent for "restrictions compose by AND and grants
stay additive".
@see [Decision 6](../groups/decisions.md#_6-restrictions-compose-by-and-grants-stay-additive)

**What a predicate can look at.** Only attributes that exist at creation time and that the
rule can be evaluated against in SQL, so that the preview below is one query.

| Attribute | Operators | Set by | Changes later? |
|---|---|---|---|
| `type` | equals, in | the creator | no |
| `create_method` | equals, in | the route: `SCAN`, `IMPORT`, `UPLOAD` | no |
| `name` | equals, starts with, ends with, contains, glob | the creator | yes, by `edit_metadata` |
| `origin_path` | starts with, glob | the watch config, the import source, or the upload layout | no v2 write path |
| `metadata.<key>` | equals, in | the watch config entry, or the creator | yes, by workers and `edit_metadata` |
| import source | equals, in | the importer, from a list the admin registered | no |
| creator | equals, in | the JWT `subject_id` | no |

A rule reads each value as it was when the dataset was created. The re-evaluation section
says what that means for the two attributes that can change.

Glob means `*` only, so that it translates to `LIKE`. Regular expressions are left out on
purpose. Entra supports them and its own guidance is to avoid them.

Attributes computed later, such as `num_files` and `du_size`, are not available. They are
written by the `integrated` workflow after creation, and a rule that depended on them would
need a second evaluation point. That is deferred, and the section on re-evaluation says
why it is cheap to add later.

**Where a rule is evaluated.** `createDataset` runs a `DATASET_CREATED` hook inside its
transaction, in the same way `services/user.js` runs `USER_CREATED`. The placement service
registers a handler in `hooks/subscribers.js`. The handler loads the enabled rules of
every collection owned by the dataset's owning group, evaluates them against the row in
memory, and calls `addDatasets` for each collection that matched. The whole thing commits
or rolls back with the dataset, so a dataset is never observed outside a collection it
should be in.
@see [Group invitations — User provisioning](../groups/invitations.md#user-provisioning-the-user-created-hook)

This is the synchronous choice. Entra evaluates asynchronously and documents minutes of
latency. Synchronous is simpler and correct here because a group owns a handful of
collections and each has a handful of rules, and because the check is a few string
comparisons. If a group ever holds hundreds of rules, that is the trigger to move the
handler behind a queue, and the hook boundary is where the cut would be made.

**Provenance on the row.** `collection_dataset` gains `added_by_rule_id`, nullable, a
foreign key to the rule. `added_by` stays as it is and records the actor who created the
dataset, because that is the person whose action caused the row. The
`COLLECTION_DATASET_ADDED` audit event carries the rule id in its metadata. A membership
page can then say "added on 12 Sep by rule *Sequencer intake* when frank uploaded it",
which is the full provenance the design asks of a grant.

**A rule never removes.** Editing a rule so that a current member no longer matches,
disabling a rule, and deleting a rule all leave existing rows open. Removing a dataset from
a collection is a person's action and closes the row with `removed_by` set, exactly as
today. This is the single most important decision on this page, and it follows directly
from use case 54.

**A manual removal is remembered.** When the evaluator considers a dataset for a
collection, it skips any dataset that has a closed `collection_dataset` row for that
collection with a human `removed_by`. That is Okta's exception list, and it costs no new
table because the closed rows are already kept. An admin who removes a rule-placed
dataset does not have to fight the rule the next morning.

**Ownership is never crossed.** The evaluator only ever considers rules on collections
whose `owner_group_id` equals the dataset's, and `addDatasets` checks the same thing
again. No rule can place a dataset into another group's collection, so no group can
grant access to data it does not own. This is the collection invariant, restated for
automation.

### 3. Re-evaluation

The question "when do rules run again" has a short answer once the attributes are
sorted by whether they can change. Four cannot: `type`, `create_method`, the import
source, and the creator are fixed when the row is written, and `origin_path` has no v2
write path. Two can: `name` through `PATCH /v2/datasets/:id`, and `metadata`, which the
workflow steps and the patch service both merge into.

**A rule reads the value a dataset had when it arrived.** This is the Gmail model, and it
is the only model consistent with "a rule never removes". A later rename adds nothing and
removes nothing. A dataset renamed into matching is picked up by the "run rules now"
action below, and the preview shows exactly what that run would add. A dataset renamed
out of matching stays where it is, as any member does. The rule form marks `name` and
`metadata` predicates as "read at creation" so the admin knows a rename moves nothing.

Restricting predicates to the immutable attributes was considered and rejected. It would
throw away a core facility's naming convention, which is the only signal available for
imports and uploads, and it buys nothing once rules are read at creation.

So re-evaluation is a *rule-edit* concern, not an attribute-change concern, and the
design treats it as one.

**On rule create or edit, the form previews.** Before saving, the API answers "which
existing datasets of this group match this rule and are not in the collection", as a
count and a list. This is one SQL query over `dataset` with the predicates translated to
`WHERE` clauses, minus current open members, minus datasets with a human removal. The
admin sees exactly what the rule would have done had it always existed.

**Applying to existing datasets is an explicit choice.** The save dialog offers "also
add the 37 matching datasets now", unchecked by default, following Gmail. Ticking it runs
the same `addDatasets` call with the admin as `added_by` and the rule as
`added_by_rule_id`, in one transaction, with one audit event per row. Leaving it unticked
means the rule applies to future datasets only.

**A collection has a "run rules now" action.** It is the same preview-then-apply flow
over all of the collection's enabled rules, for the case where an admin wants to catch up
after a period with rules disabled. It is also the recovery path if a hook ever fails and
the dataset was created without its memberships, which cannot happen under the
transactional design above but is cheap to have.

**There is no scheduled sweep.** Creation is covered by the hook, rule edits by the
preview, and gaps by the manual action. A nightly job that re-adds things would either do
nothing or hide a bug.

**What is deferred, and how it would slot in.** Two events could later warrant automatic
re-evaluation: a metadata edit on a dataset, and the `integrated` workflow finishing and
writing `num_files` and `du_size`. Each would be one more hook event, `DATASET_UPDATED`
or `DATASET_PROCESSED`, running the same handler against the changed row. Because rules
only add, re-running them is idempotent, and `addDatasets` already uses
`ON CONFLICT DO NOTHING`. Nothing in the first version has to be redone to get there.

One caution belongs with that deferral. Evaluating only at creation is what keeps the
contributor-controlled-attribute problem below from getting worse: a contributor who
renames a dataset after upload cannot place it anywhere, because nothing re-evaluates on
rename. A `DATASET_UPDATED` hook would reopen that, so if it is ever added it should skip
predicates on `name` and `metadata` unless the editor holds `collection.add_dataset`.

## Who may author a rule

Group admins write rules themselves, in the collection's own page. Rules are not code and
not deployed configuration, and there is no path where a group emails the application's
maintainers to have one written.

The reason is the same invariant that shapes everything else on this page. A rule is a
standing decision to grant access. A rule written into config by a maintainer puts a
person outside the owning group into the access chain, with no audit row naming them and
no way for the group to see or revoke it, which is what "no group may grant access to data
it does not own" exists to prevent. The watch config is not a precedent: `owner_group_id`
there records custody, and custody is decided before a row exists. Grants, membership,
invitations, and access requests are all self-service for the owning group's admins, and
rules follow them. A platform admin passes the same check, by decision 11.

Creating, editing, enabling, disabling, and deleting a rule requires the same authority as
adding a dataset to the collection by hand, `collection.add_dataset` on that collection.
The design's invariant is that collection membership mutations meet the same bar as grant
creation, and a rule is a standing membership mutation.
@see [Decision 11](../groups/decisions.md#_11-platform-admin-is-one-check-in-the-engine)

The policy engine needs one new action, `collection.manage_rules`, and it resolves to the
same check as `add_dataset` today. It exists as a separate name so that it can diverge
later without a migration of intent, and so that the boot-time check that every action is
defined covers it.

## The contributor-controlled-attribute problem

This is the Entra warning applied to Bioloop, and it is the one part of the design that
needs a decision rather than a mechanism.

A contributor who uploads into a group chooses the dataset's name and its metadata. If an
admin writes the rule "name starts with `IRB-2024`" on a collection that has a grant to an
outside group, then any contributor can put a dataset in front of that outside group by
naming it. The admin did not intend to delegate that.

The attributes an admin controls are `origin_path` for watched and imported data, the
import source, `create_method`, and the creator. The attributes a contributor controls
are `name` and, on the import and upload routes, `metadata`.

The recommended handling is two rules of the form, not a new mechanism.

- The rule form shows a plain warning when a rule uses `name` or `metadata` and the
  collection carries any grant to a subject outside the owning group, and it names the
  grant. The admin can proceed. The point is that they know.
- The form suggests, and the worked examples use, a `create_method` or creator predicate
  alongside any `name` predicate, so that "name starts with `IRB-2024`" becomes "created
  by the watch script and name starts with `IRB-2024`".

A stricter option, refusing `name` and `metadata` predicates outright on collections with
outward grants, was considered and is not recommended. A core facility's own naming
convention is often the only signal available for imports, and the facility's admins are
the ones who wrote it.

## Worked examples

**A sequencing core's intake.** The watch config entry `raw_data` polls
`/data/origin/raw_data` and registers every subdirectory under the Genomics Core group.
The core's admin creates the collection *Sequencer intake* and one include rule:
`origin_path` starts with `/data/origin/raw_data/`. From then on every run the instrument
writes is in the collection before the `integrated` workflow starts, and the collection's
one grant to the Bioinformatics Core makes each run readable to the analysts the same
minute. No worker configuration changed.

**Keeping a test directory out.** The same admin adds an exclude rule on the same
collection: `name` glob `*_test*`. A run named `2026-09-15_test_calibration` is
registered as a dataset, owned by the core, and left out of the collection. Exclude wins.

**A retroactive rule.** Six months in, the admin creates *Long reads* with the rule
`metadata.instrument` equals `promethion`, which the watch config entry has stamped on
every dataset from that directory. The preview lists 212 existing datasets. The admin
ticks "also add these now", and 212 rows open in one transaction with 212 audit events
naming the admin and the rule.

**A removal that sticks.** A dataset turns out to have been mislabelled and the admin
removes it from *Long reads*. The row closes with the admin as `removed_by`. When the
admin later edits the rule and runs "run rules now", the evaluator sees the human closure
and does not re-add it.

## Data model, in outline

A new table and one new column. Migration written by hand, as for every schema change in
this repository.
The `prisma-schema-changes` project skill covers how.

```
collection_rule
  id              uuid, primary key
  collection_id   → collection.id, on delete cascade
  name            text            a label the admin reads, such as "Sequencer intake"
  kind            include | exclude
  predicates      jsonb           [{ attribute, operator, value }], AND-ed
  is_enabled      boolean         default true
  created_by      → user.id
  created_at, updated_at

collection_dataset
  + added_by_rule_id   → collection_rule.id, nullable
```

`predicates` is validated on write against the closed attribute and operator vocabulary
above, and the same validator produces both the in-memory evaluation used by the hook and
the Prisma `where` clause used by the preview. One source of truth for what a predicate
means is the property that keeps the two from disagreeing.

`collection_dataset.dataset_id` references `dataset.resource_id`, not `dataset.id`. The
hook has the resource row in hand because `createDataset` creates it, so this is a note
for the implementer rather than a design point.

## Routes, in outline

All under the existing collection router and the `collection.manage_rules` action.

- `GET /collections/:id/rules` and `POST /collections/:id/rules`
- `PATCH /collections/:id/rules/:ruleId` and `DELETE /collections/:id/rules/:ruleId`
- `POST /collections/:id/rules/preview`, taking a rule body and answering the matching
  datasets not yet in the collection
- `POST /collections/:id/rules/apply`, running every enabled rule and adding the matches

The creation routes, `POST /v2/datasets`, `/bulk`, `/imports`, and `/uploads`, accept the
optional `collection_ids` from piece 1.

## Interface, in outline

The collection page gains a *Rules* section beside its dataset list, listing each rule
as a sentence, "Include when origin path starts with /data/origin/raw_data/", with its
kind, its state, and the count of datasets it has placed. The rule form is a list of
predicate rows, each an attribute, an operator, and a value, plus the preview panel and
the "also add now" checkbox. The membership list shows a small rule marker on rows with
`added_by_rule_id`, and the row's detail names the rule.

The dataset page's access explanation already says "through collection X". It gains
"placed by rule Y" when the membership row carries one.

## What is deliberately left out

Each of these was considered and dropped because the simple version is genuinely simple
and the complicated version buys little.

- **An expression language or nested boolean groups.** Flat AND inside a rule and OR
  across rules covers every example anyone has offered. Configuration Manager needed a
  full query language because it targets machine inventory; Bioloop has seven attributes.
- **Rules that remove.** Silent access loss is forbidden by use case 54, and the Okta
  precedent shows that even systems built on live evaluation end up keeping members
  when a rule goes away.
- **Scheduled re-evaluation.** Nothing a rule can see changes after creation. A sweep
  would run to do nothing.
- **Rules on attributes computed after creation.** Deferred behind a second hook event,
  which the additive design makes a small change.
- **Cross-group placement.** Forbidden by the collection invariant, and the evaluator
  never looks outside the owning group.
- **Rules on groups, or rules that create collections.** Both were mentioned in the Immich
  and Plex ecosystems. Neither has a Bioloop use case yet.

## Open questions

- Should a rule be able to require a **consent code**? Consent codes are captured at
  creation and not enforced, and a rule keyed on them would be the first enforcement
  point. That is a policy question for the groups design, not for this page.
- Should the **preview cap** its list, and at what number? Configuration Manager caps at
  10,000 rows and defaults to 5,000. A core facility's backlog is hundreds.
- Is `collection.manage_rules` worth a separate name, or should the routes authorize
  against `add_dataset` directly? The argument for the name is legibility in the audit
  log; the argument against is one more action to wire.

## Sources

Consulted on 2026-09-15.

- Adobe, [Lightroom Classic collections](https://helpx.adobe.com/lightroom-classic/help/photo-collections.html);
  Lenscraft, [Smart collections: how they work](https://lenscraft.co.uk/photo-editing-tutorials/using-lightroom-smart-collections/)
- Apple, [Create Smart Albums in Photos on Mac](https://support.apple.com/guide/photos/create-smart-albums-pht6d60ca71/mac)
- Plex, [Collections](https://support.plex.tv/articles/201273953-collections/);
  Kometa, [Plex smart filter](https://kometa.wiki/en/latest/files/builders/plex/smart-filter/)
- jyourstone, [jellyfin-smartlists-plugin](https://github.com/jyourstone/jellyfin-smartlists-plugin)
- Microsoft, [Manage rules for dynamic membership groups in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/users/groups-dynamic-membership)
- Microsoft, [Create collections in Configuration Manager](https://learn.microsoft.com/en-us/intune/configmgr/core/clients/manage/collections/create-collections)
- Okta, [Group rules](https://help.okta.com/oie/en-us/content/topics/users-groups-profiles/usgp-about-group-rules.htm);
  Okta Support, [Removing users from the exception list in group rules](https://support.okta.com/help/s/article/removing-user-from-exception-list-in-group-rule?language=en_US)
- Google, via Truehost, [Apply a filter to existing mail in Gmail](https://truehost.com/apply-a-filter-to-existing-mail-in-gmail/)
- Microsoft, [Manage email messages by using rules in Outlook](https://support.microsoft.com/en-us/outlook/mail/manage-email-messages-by-using-rules-in-outlook)
- iRODS, [Rule language](https://docs.irods.org/4.2.10/plugins/irods_rule_language/)
- OMERO, [Import targets](https://omero.readthedocs.io/en/stable/users/cli/import-target.html)
- Globus, [Research automation](https://www.globus.org/automation);
  Chard et al., [Globus automation services](https://www.sciencedirect.com/science/article/pii/S0167739X23000183)
- Immich, [Feature: rule-based smart albums, discussion 1673](https://github.com/immich-app/immich/discussions/1673);
  kvalev, [immich-dynamic-albums](https://github.com/kvalev/immich-dynamic-albums)
- LYRASIS, [DSpace 8: mapping items to multiple collections](https://wiki.lyrasis.org/pages/viewpage.action?pageId=315720749)
- AWS, [Adding filters to S3 Lifecycle rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/intro-lifecycle-filters.html)

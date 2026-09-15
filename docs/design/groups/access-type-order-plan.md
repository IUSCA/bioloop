# Access type order plan

The ordered work to make the rest of the system agree with
[decision 7](./decisions.md#_7-access-types-imply-one-another). Access types carry a partial
order. Evaluation closes over it. Nothing else does.

The design record is [Decisions](./decisions.md) for the order itself and
[Access presets](./access-presets.md) for the preset layer above it. This page carries the
gaps, the sequence, and the decisions each phase needs.

**All four phases are built.** The gap list below is what they closed, kept because it says
why each change exists. Two defects the plan did not predict are recorded at the end.

## What already agrees with the order

The read path is complete and correct. `getGrantAccessTypesForUser` widens what a subject
holds, and `userHasGrant` widens what a check accepts. Both live in
`services/grants/holdings.js` and read the grant rows of `accessPathsQuery`.

The policy layer inherits that for free. `ContextHydrator` loads `access_paths` once per
resource per request, with its grant types already widened, so every `userHasGrant(...)`
inside a policy is a set lookup against an already-closed set. No authorization decision can
disagree with the order.

Restrictions stay separate, as decision 7 requires. `builtin/restrictions.js` keys on
qualified policy actions such as `dataset.download`, never on access types, so widening a
holding cannot weaken a restriction.

## The gaps

Nine, ordered by how much harm each does. Two are wrong answers shown to a reviewer today.

### 1. `covered_elsewhere` is empty for every preset request

`getAccessSummaryForRequest` in `services/access_requests/access_summary.js` selects
approved items with `item.access_type_id != null`. A preset item stores `preset_id` and
leaves `access_type_id` null, so a request made entirely of presets yields an empty access
type list and returns `covered_elsewhere: []`.

Presets are what the request form offers first, so this is the majority path. The detail
page renders the field at `ui/src/pages/v2/access-requests/[id].vue:93`, and it never
appears.

The data is already loaded. `INCLUDES_CONFIG` in `services/access_requests/fetch.js` pulls
`preset.access_type_items.access_type`, so the fix reads what the include already fetched.

### 2. Coverage never widens through the order

`getEffectiveCoverage` in `services/grants/coverage.js` filters on
`g.access_type_id IN (...)` with no widening. Two callers pass a narrow list and get a
wrong answer.

Alice's lab holds `DATASET:DOWNLOAD` on dataset D. Alice requests `DATASET:LIST_FILES`. The
dry run at `POST /grants/compute-effective-grants` passes access type 4, the lab's grant is
access type 5, nothing matches, and `indirect_coverage` comes back empty. The reviewer is
told this is new access. Alice can already list those files.

The function exists to let a reviewer decline a redundant request. It reports redundancy
only when the covering grant names the same access type, which is the case the order was
built to stop mattering.

### 3. Preset expansion writes rows the order already implies

`_buildAccessTypeIdToExpirationsMap` in `services/grants/issue.js` expands a preset to its
listed access type ids and deduplicates by id. It never consults the closure.

Decision 7 states the consequence that should follow: "most now collapse to a single access
type, so an approval creates one grant row instead of four". That is not built.

Measured over all four seeded presets, from `GRANT_PRESETS` and
`GRANT_ACCESS_TYPE_IMPLICATIONS` in `api/src/constants.js`:

| Preset | Rows written | Rows needed | Reduces to |
|---|---|---|---|
| Discoverable | 4 | 2 | `DATASET:REQUEST_ACCESS`, `COLLECTION:LIST_CONTENTS` |
| Standard Research Use | 5 | 2 | `DATASET:DOWNLOAD`, `COLLECTION:LIST_CONTENTS` |
| Discoverable (Dataset) | 2 | 1 | `DATASET:REQUEST_ACCESS` |
| Standard Research Use (Dataset) | 3 | 1 | `DATASET:DOWNLOAD` |

Fourteen rows where six suffice. Every seeded preset is redundant under the order.

The two dataset presets were later removed, because each reduced to a single access type.
The seed retires them. [Access presets](./access-presets.md) section 2.11 records why.
Both `REQUEST_ACCESS` types were later deleted, so *Discoverable* now lists only the two
`VIEW_METADATA` types.

The codebase already disagrees with itself here. The owning-group seed writes one
`LIST_FILES` row and says why in a comment at `services/grants/issue.js:110`. The preset
path writes the whole chain.

### 4. Supersession never widens

`fetchExistingGrants` in `services/grants/issue.js` matches on exact `access_type_id`.

Alice holds `DATASET:DOWNLOAD` for a year. She requests `DATASET:LIST_FILES` for three days.
Access-presets section 2.8 calls this Case 2 and skips the write. The code writes a new
`LIST_FILES` grant, because it never sees that `DOWNLOAD` covers it.

Nobody gains access they should not have. The cost is a redundant row and an audit trail
that reports a grant where none was needed.

### 5. The UI teaches the model the order replaced

`AccessTypeSelector.vue` greys out and checks the types a selected preset covers, labelled
"via preset". It has no equivalent for implication. An admin selecting `DOWNLOAD` sees
`LIST_FILES` and `VIEW_METADATA` unchecked, selectable, and apparently still required.

The explanation hop does not exist anywhere. Decision 7 promises "you can view metadata
because you hold download, which implies it". No file under `ui/src` mentions implication.

Neither `RevokeGrantModal.vue` nor `RevokeAllGrantsModal.vue` warns about a revoke with no
effect. Decision 7 names that case directly: revoking `VIEW_METADATA` from a `DOWNLOAD`
holder does nothing.

### 6. Redundant policy disjunctions

The `GRANT_HOLDER` role in `authorization/builtin/policies/dataset.js` is a five-way
disjunction. Four of the five imply `DATASET:VIEW_METADATA`, so the first check alone is
now equivalent. `authorization/builtin/policies/collection.js` has the same shape with two.

Behaviour is correct, because the hydrated set is already closed. The code misleads a
reader into thinking the five are independent.

### 7. `DATASET:REMOTE_ACCESS` is grantable and unchecked

Access type 10 is seeded and carries an implication edge to `DATASET:LIST_FILES`. No policy
action checks it. Its only effect is the edge, so granting "Path to storage" confers file
listing and nothing named remote access.

### 8. Documents contradict the order

`design.md` holds two direct contradictions. Lines 547 and 548 give "Idempotent preset
application" and "one grant = one permission fact" as benefits of the no-overlap
constraint. A grant of `DOWNLOAD` is one row and three permission facts. Both lines sit
seventy lines above the section that states the order.

Lines 628 to 668 describe presets expanding into `view_metadata`, `read_data`, and
`download`. Decision 7 settled that no `DATASET:READ_DATA` access type exists. The section
also describes visibility and composite presets that were never built.

Three downstream premises assume a preset yields six independent access types.
`trust-and-communication.md` risk 6, `access-requests-plan.md` line 87, and the worked
example in `access-presets.md` section 2.8 all rest on it. No seeded preset has six
independent types, and the largest reduces to two.

`use-cases.md` line 495 is current and needs no change.

### 9. Tests lock in the flat expansion

`accessTypeClosure.test.js` covers the graph well, asserting the graph has no cycles and covers
every seeded type. Nothing asserts that expansion is closure-minimal, and nothing asserts
that coverage widens.

`access-request.presets.test.js` asserts one grant per listed access type, so it must change
with phase 2. `access-request.access-summary.test.js` never asserts `covered_elsewhere`,
which is why gap 1 shipped.

## Decisions this plan needs

Three choices belong to the reviewer, not to the implementation.

**Reduction changes what a revoke removes.** Today Alice's approved preset writes three
rows, and revoking `DOWNLOAD` leaves her listing files. After phase 2 it writes one row, and
revoking it removes everything the preset conferred. This follows from decision 7 treating
the order as an invariant rather than a convention. It is a visible change in admin
behaviour, and it should be stated in the release note.

**Existing grants are not rewritten.** Rows written before phase 2 stay as they are. They
are inert rather than wrong, because the order makes the extra rows redundant rather than
harmful. The cost is a period where the Access tab shows three rows for an old approval and
one row for a new one. Revoking a redundant row is destructive and irreversible, so a
backfill is the worse trade.

**`REMOTE_ACCESS` needs an owner.** Either a policy action checks it, or it leaves the
seeded set. Leaving a grantable type that only acts through an edge is the option to reject.

## The phases

### Phase 1 — the previews tell the truth

Two wrong answers, both shown to a reviewer, both fixable without touching a write path.

**1a.** `getAccessSummaryForRequest` expands approved preset items to their access types
before asking for coverage. The include already loads them.

**1b.** `getEffectiveCoverage` widens its access type filter through
`accessTypeClosure.satisfiedBy`. Both callers benefit, and neither changes.

Verified by a test asserting `covered_elsewhere` names a lab's `DOWNLOAD` grant when the
request asked for `LIST_FILES` through a preset. That one case fails on both gaps today.

### Phase 2 — the write path stops writing implied rows

**2a.** `_buildAccessTypeIdToExpirationsMap` reduces its access type set to the maximal
elements under the closure. The expiry rule is unchanged, and the later expiry still wins.

**2b.** The preset provenance map from C5 follows the reduced set. The existing rule holds:
an access type named directly by an item maps to null, and one supplied by two presets maps
to null. Reduction shrinks the set the rule runs over, so a preset that collapses to one
access type now labels exactly one grant.

**2c.** `fetchExistingGrants` widens its lookup, so a covering grant of a wider type reaches
the Case 2 skip.

Verified by updating `access-request.presets.test.js` to the reduced counts, and by a new
test asserting that expanding every seeded preset produces a set with no implied member.

### Phase 3 — the UI names the order

**3a.** `AccessTypeSelector` greys implied types with a "via download" style label, reusing
the `presetCoveredIds` mechanism against a closure-derived set.

**3b.** The Access tab shows the explanation hop decision 7 promises, on any access a
subject holds by implication rather than by its own row.

**3c.** The revoke modals say when a revoke will not change effective access, and name the
grant that still confers it.

Phase 3 needs the closure in the client. The smallest option is a `/grants/access-types`
response carrying each type's implied set, which the selector already fetches.

### Phase 4 — code and document sweep

**4a.** Collapse the two redundant disjunctions to the single check each now needs, with a
comment naming decision 7.

**4b.** Resolve `REMOTE_ACCESS` per the decision above.

**4c.** Sweep the documents in gap 8. `design.md` lines 544 to 548 and 628 to 668 come
first, because they contradict the order rather than merely predating it. The three
downstream premises follow. A measurement already recorded stays, with what changed added
beside it.

## What the live run found that the plan did not

Both were caught driving the real API rather than by the suite, and both now have tests.

**Coverage was filed under the wrong access type.** The dry-run route grouped coverage rows
by each row's own access type. Once the query widened through the order, a lab's `DOWNLOAD`
grant answered a request for `LIST_FILES`, and keying by the row's own type filed it under a
type the reviewer never asked about, so the reviewer saw nothing. The route now attaches each
row to every access type it answers for.

**Revoking a grant was a 500 for anyone but a platform admin.** `isAdminOfResourceGroup`
requires `resource_type`, which is not a column on `grant`, and no hydrator supplied it. Every
grant action authorized from an id alone failed with
`HydrationError: [grant] Unknown attributes: resource_type`. `POST /grants/:id/revoke` is the
visible one. A platform admin never saw it, because the engine allows them before any policy
runs, and the browser passes were driven as one.

This predates the order work and arrived with the access-requests phases. `grantHydrator`
now resolves `resource_type` from the grant's resource row, mirroring the same fix already
made for `access_request`. `tests/authorization/grantHydrator.test.js` pins it.

## Out of scope

**Presets as named levels.** Once phase 2 lands, every seeded preset is one or two maximal
access types, which makes a preset a name for a point in the order rather than a bundle. That
reframing is worth doing and it is a separate design change, not a consequence of this plan.

**Preset versioning, per-group presets, and atomic preset revocation.** All three stay
deferred for the reasons in `access-presets.md` section 6. Nothing here changes them.

**The exclusion constraint.** It stays as it is, for the reasons in decision 14. Reduction
lowers how often it is reached, and it does not change what it enforces.

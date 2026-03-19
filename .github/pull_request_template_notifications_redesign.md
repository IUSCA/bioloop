**Description**

This PR delivers the notifications redesign across API, UI, and E2E coverage, including route/service refactors, ownership-aware authorization alignment, deterministic recipient precedence, pagination + total-count API behavior for filters/search, UI interaction/accessibility improvements, and test hardening.

Because this is a large change set (roughly 80-100 files), the implementation is organized so reviewers can follow it in layers:
1) API contracts and authorization behavior
2) notification service extraction/organization and deduplication
3) UI behavior/state synchronization changes
4) E2E helper consolidation and scenario coverage
5) docs/changelog updates

**Related Issue(s)**

Closes #N/A

No single tracker issue was used for this redesign. The work consolidated findings from notifications handoff/audit notes, regression follow-ups, and E2E stability gaps.

**Changes Made**

List the main changes made in this PR. Be as specific as possible.

- [x] Feature added
- [x] Bug fixed
- [x] Code refactored
- [x] Tests changed
- [x] Documentation updated
- [x] Other changes: security hardening and test-infra workflow updates

Implementation details:
- API
  - Added/updated ownership-aware notification endpoints and SSE behavior for user role flows.
  - Added paginated notifications response contract (`items`, `total`, `offset`, `limit`, `has_more`) and applied it to active filters and search combinations.
  - Added/standardized conflict responses for race-condition scenarios (for example, state update or recipient assignment after global dismissal).
  - Refactored notification helper logic out of routes into `api/src/services/notifications/*`.
  - Implemented deterministic delivery-role precedence in recipient resolution without duplicate recipient creation.
  - Centralized role-aware feature checks and removed duplicate notification-specific checks.
  - Removed dead notification service shim files after import migration.

- UI
  - Reworked notification menu filter/search/chip synchronization to prevent stale/duplicate chip behavior.
  - Stabilized menu width behavior by breakpoint and fixed action-control layout consistency.
  - Added loading/disabled-state behavior during notification API operations.
  - Updated bell badge count semantics to use unread count by default and total matched count under active filters/search.
  - Fixed keyboard navigation/focus-order behavior in the dropdown.
  - Consolidated notification service paths under `ui/src/services/notifications/*`.

- E2E
  - Added/updated scenarios for:
    - filter-chip regressions and clear behavior
    - search + filter pagination and total-count correctness
    - race-condition user feedback via toasts
    - trusted/untrusted link flows
    - user-role SSE connection/authorization behavior (no polling-only false positives)
    - responsive layout and notification theme-color behavior
    - keyboard accessibility flows
  - Extracted notification test helpers into shared modules and removed duplicated utilities.
  - Reduced unnecessary timeout usage and improved deterministic assertions.

- Documentation
  - Updated notifications changelog entries in `.ai/features/notifications.md`.
  - Added/updated notifications implementation notes and supporting docs.
  - Added notifications design document in `docs/features/notifications_design.md`.

**Screenshots (if applicable)**

Intentionally omitted in this template copy. Visual validation artifacts were generated separately and are not embedded here.

**Checklist**

Before submitting this PR, please make sure that:

- [x] Your code passes linting and coding style checks.
- [x] Documentation has been updated to reflect the changes.
- [x] You have reviewed your own code and resolved any merge conflicts.
- [x] You have requested a review from at least one team member.
- [x] Any relevant issue(s) have been linked to this PR.

**Additional Information**

Recommended review order for this PR:
1. `api/src/routes/notifications.js` and `api/src/services/notifications/*` for contracts/authorization/recipient logic
2. `ui/src/stores/notification.js`, `ui/src/components/notifications/*`, and `ui/src/services/notifications/*` for UX/state behavior
3. `tests/src/tests/view/authenticated/notifications/*` and helper modules for scenario coverage and stability
4. docs/changelog updates for design decisions and behavior contracts

Known constraint:
- SSE invalidation fanout currently uses in-memory process-local pub/sub. Cross-instance propagation requires a shared adapter (for example Redis pub/sub) if/when multi-instance push consistency is required.

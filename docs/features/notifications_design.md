# Notifications Feature Design

## Purpose

This document defines the current design for the notifications redesign across API, UI, and E2E testing.

The redesign goals were to:
- stabilize filter/search behavior and eliminate chip/UI desynchronization
- improve accessibility and interaction consistency in the notification menu
- support paginated, filter-aware querying with reliable total counts
- harden role/ownership authorization behavior and race-condition handling
- increase confidence with targeted, deterministic E2E coverage

## Scope

Included:
- notification menu UX behavior (filters, search, chips, actions)
- API contract for listing, state updates, global dismissal, SSE
- role/ownership enforcement for user/admin/operator flows
- pagination semantics for filters and search
- E2E test coverage and helper refactor for maintainability

Out of scope:
- replacing polling fallback with SSE-only architecture
- multi-instance pub/sub implementation for SSE fanout
- broad cross-feature UI redesign outside notifications

## User Roles and Access Model

- `admin` and `operator` can access general notification routes and can globally dismiss notifications.
- `user` role uses ownership-scoped routes (`/:username/...`) with `checkOwnership: true`.
- User role cannot globally dismiss notifications.
- Resolver identity visibility:
  - visible to `admin`/`operator`
  - hidden for `user`

## Data Model and Concepts

Notification model is split into:
- global event: `notification`
- per-recipient state: `notification_recipient`

Per-recipient state fields:
- `is_read`
- `is_archived`
- `is_bookmarked`

Global lifecycle fields:
- `is_resolved` (global dismissal)
- `resolved_at`
- `resolved_by_id`

Delivery metadata:
- `DIRECT` (explicit user targeting)
- `ROLE_BROADCAST` (role-targeted recipient resolution)
- `delivery_role_id` persisted for role-broadcast provenance

## UI Design

### Menu Structure

- Top controls row contains filter toggles and supporting controls.
- Search input supports combined filter + search behavior.
- Active filters are represented as chips with explicit clear actions.
- Notification cards display delivery badges and action controls.

### Interaction Rules

- Menu width is deterministic per breakpoint and does not fluctuate by content.
- Filter buttons/chips/search stay synchronized from a single source of truth.
- Controls are disabled and loading state is shown during notification API requests.
- Bell badge count behavior:
  - no active filters: unread count
  - active filters/search: total matched count for current query

### Accessibility

- Keyboard flow is deterministic:
  - open via keyboard from notification-open control
  - tab order enters top controls first, then search, then per-item actions
  - reverse tab order works without focus traps

## API Design

### Listing and Pagination

Notification listing supports:
- filters: `read`, `archived`, `bookmarked`, `globally_dismissed`
- `search`
- pagination: `limit`, `offset`

Response shape:
- `items`: paginated notification records
- `total`: total matched records for the active query
- `offset`, `limit`
- `has_more`

Contract requirement:
- pagination applies to all query combinations, including search + active filters

### State Updates and Conflict Semantics

Per-user state update on globally dismissed notification:
- returns `409 NOTIFICATION_GLOBALLY_DISMISSED`

Adding recipients to globally dismissed notification:
- returns `409 NOTIFICATION_GLOBALLY_DISMISSED`

UI behavior on conflict:
- show explicit toast
- refresh relevant list state

### Global Dismissal

- allowed for admin/operator only
- user role denied
- resolver metadata persisted for auditability

### SSE and Polling

- SSE used for invalidation signaling (`ready`, `notification` events)
- polling remains fallback for resilience
- current SSE fanout is in-memory emitter (single-process scope)
- multi-instance consistency requires external pub/sub adapter

## Recipient Resolution Policy

Recipient resolution is centralized in notifications services:
- deduplicates recipients by user
- enforces notifications feature gating by role
- applies deterministic role precedence for `ROLE_BROADCAST`
- prevents duplicate recipient rows and duplicate notifications per target user

Precedence behavior:
- role-broadcast candidates for the same user are reduced to one deterministic winner
- direct targeting of the same user wins over role-broadcast delivery type

## Security and Link Handling

Allowed notification links:
- relative links (trusted)
- `http/https` links (subject to trust policy)

Blocked schemes:
- `javascript:`
- `data:`
- `file:`
- `vbscript:`

Untrusted external links:
- require explicit confirmation in UI before navigation

## Service Organization

Notification logic is organized under:
- `api/src/services/notifications/*`
- `ui/src/services/notifications/*`

Route/helper logic was moved into services where appropriate.
Legacy notification service shims were removed after imports were migrated.

## Testing Strategy

### E2E Coverage Areas

- filter and chip synchronization (including clear behavior)
- search + filter combinations
- pagination with correct totals and on-demand loading behavior
- loading/disabled control behavior during API calls
- keyboard accessibility and focus order
- role-specific authorization behavior
- SSE connection behavior for ownership endpoint
- race-condition UX handling via toasts
- trusted/untrusted link behavior
- responsive layout and theme-color scenarios

### Test Stability Principles

- prefer deterministic DOM/testid assertions over broad timing waits
- reduce unnecessary `test.slow`, explicit timeouts, and sleep-based waits
- share notification test helpers to reduce duplication and maintenance burden

## Known Constraints and Follow-ups

- SSE fanout is currently process-local; cross-instance propagation is not guaranteed without pub/sub.
- Polling fallback remains intentionally enabled for reliability.
- Additional production-scale observability can be added for SSE lifecycle metrics if needed.

# Notifications Design

## Purpose

This document describes the current notifications design across API, UI, and E2E tests.

Primary goals:
- keep filter/search/chip state synchronized and deterministic
- provide consistent keyboard and pointer interactions
- support paginated, filter-aware queries with accurate totals
- enforce role/ownership boundaries for all state transitions
- preserve predictable behavior under race conditions

## Scope

Included:
- notification menu UX (filters, chips, search, row actions)
- listing/state/global-dismiss APIs
- role and ownership authorization behavior
- SSE invalidation plus polling fallback
- E2E coverage for behavior, accessibility, and role differences

Out of scope:
- replacing polling fallback with SSE-only behavior
- multi-instance SSE fanout infrastructure (for example Redis pub/sub)
- unrelated UI redesign outside notifications

## Roles and Access

- `admin` and `operator` can use general notification routes and global dismissal.
- `user` uses ownership-scoped routes (`/:username/...`) with `checkOwnership: true`.
- `user` cannot globally dismiss notifications.
- Resolver identity visibility:
  - visible to `admin` and `operator`
  - hidden for `user`

## Data Model

Notifications are split between:
- `notification` (global event and global lifecycle)
- `notification_recipient` (per-user delivery and per-user state)

Per-recipient fields:
- `is_read`
- `is_archived`
- `is_bookmarked`

Global lifecycle fields:
- `is_resolved`
- `resolved_at`
- `resolved_by_id`

Delivery metadata:
- `DIRECT` for direct user targeting
- `ROLE_BROADCAST` for role-based delivery
- `delivery_role_id` to preserve role-broadcast provenance

## UI Behavior

### Menu Structure

- Top control row includes unread/read/archived/bookmarked/globally-dismissed toggles and mark-all-read.
- Search input combines with active filters.
- Active filters render as chips with explicit clear controls.
- Row-level actions are available per notification card.

### Interaction Rules

- Menu width is deterministic by breakpoint.
- Filter/search state is driven from a single reactive source.
- During mutation/list loading states, actionable controls are disabled.
- Bell badge count:
  - no active filters: unread count
  - active filters or search: matched total for the active query

### Accessibility

- Keyboard opening from the bell moves focus into menu controls.
- Forward and reverse tab order are deterministic and trap-free.
- Chip clear controls are keyboard actionable with `Enter`/`Space`.
- Chip clear controls expose a visible `:focus-visible` ring so keyboard focus is discoverable.

## API Behavior

### Listing and Pagination

Supported query inputs:
- filters: `read`, `archived`, `bookmarked`, `globally_dismissed`
- `search`
- pagination: `limit`, `offset`

Response contract:
- `items`
- `total`
- `offset`
- `limit`
- `has_more`

Pagination semantics apply to all combinations of filters and search.

### State Updates and Conflict Semantics

When a notification is globally dismissed:
- per-user state updates return `409` with code `NOTIFICATION_GLOBALLY_DISMISSED`
- recipient assignment operations return `409` with code `NOTIFICATION_GLOBALLY_DISMISSED`

UI conflict handling:
- show a clear conflict toast
- refresh relevant list state

Recommended error shape:

```json
{
  "code": "NOTIFICATION_GLOBALLY_DISMISSED",
  "message": "Notification is globally dismissed and no longer actionable."
}
```

### Global Dismissal Rules

- allowed: `admin`, `operator`
- denied: `user` (`403`)
- `resolved_by_id` and `resolved_at` are persisted for auditability

## Global Resolve Edge Cases

1. User toggles read/unread while an admin globally dismisses:
   - stale per-user action returns `409`
   - UI shows conflict feedback and refreshes
2. Recipient assignment attempted after global dismissal:
   - operation returns `409`
   - UI surfaces conflict and refreshes list/form state
3. Role drift after dismissal:
   - audit fields preserve resolver identity and timestamp
4. Filter semantics:
   - default unread view excludes globally dismissed notifications
   - globally dismissed filter explicitly includes resolved notifications
5. Badge semantics:
   - unread count excludes globally dismissed notifications
   - filtered/search views use `total` for matched-count badge behavior
6. Authorization boundaries:
   - server authorization is authoritative even when UI hides controls

## Real-Time Model

- SSE provides invalidation (`ready`, `notification`) for near-real-time refresh.
- Polling remains enabled as a resilience fallback.
- Current fanout is process-local; multi-instance consistency requires shared pub/sub.

## Recipient Resolution Policy

Recipient resolution is centralized in notifications services and:
- deduplicates recipients by user id
- enforces feature gating by role
- applies deterministic precedence for role-broadcast collisions
- prevents duplicate recipient rows per notification/user

Precedence rules:
- when multiple broadcast roles match the same user, choose one deterministic winner
- direct targeting takes precedence over broadcast delivery for the same target user

## Link Security

Allowed link categories:
- relative links (trusted)
- `http/https` links under trust policy

Blocked schemes:
- `javascript:`
- `data:`
- `file:`
- `vbscript:`

Untrusted external links require explicit user confirmation before navigation.

## Service Organization

Notifications code is organized by feature:
- API services: `api/src/services/notifications/*`
- UI services: `ui/src/services/notifications/*`

Routes and components keep orchestration concerns, while feature behavior belongs in these service modules.

## Testing Strategy

### E2E Coverage Areas

- filter/chip synchronization and clear behavior
- search and filter combinations
- pagination and matched-count correctness
- loading/disabled control behavior during mutations
- keyboard accessibility and focus ordering
- role-based authorization and visibility behavior
- SSE invalidation behavior for ownership/general views
- race-condition conflict handling via user-visible feedback
- trusted/untrusted link behavior
- responsive layout and theme color behavior

### Stability Principles

- prefer deterministic `data-testid` assertions
- minimize broad sleeps and unnecessary global timeouts
- keep shared helpers for repeated notification flows

## Constraints and Follow-ups

- process-local SSE fanout is not sufficient for multi-instance consistency
- polling fallback remains intentionally enabled for reliability
- additional SSE lifecycle observability can be added if production needs it

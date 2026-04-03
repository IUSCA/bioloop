# Notifications

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
- listing and per-recipient state APIs
- role and ownership authorization behavior
- periodic polling refresh for list and badge updates (`ui/src/config.js` `notifications.pollingInterval`)
- E2E coverage for behavior, accessibility, and role differences

## Roles and Access

- `admin` and `operator` can use general notification routes (`/notifications/...`) without per-username ownership checks for reads, listing, and mutations that the API allows for those roles.
- `user` uses ownership-scoped routes (`/notifications/:username/...`) with `checkOwnership: true`.
- Elevated viewers (`admin` / `operator`) see extra delivery metadata for role-broadcast notifications (target role chips in the UI; broadcast role names in the API when applicable). The `user` role does not see that privileged metadata.

## Data Model

Notifications are split between:

- `notification` (global event: label, text, type, metadata, creator)
- `notification_recipient` (per-user delivery and per-user state)

Read and bookmark state are **per recipient row** (`notification_recipient.is_read` / `is_bookmarked`). One user marking a notification read or bookmarked does not change another user's row.

Per-recipient fields:

- `is_read`
- `is_bookmarked`

Delivery metadata:

- `DIRECT` for direct user targeting
- `ROLE_BROADCAST` for role-based delivery
- `delivery_role_id` to preserve role-broadcast provenance

There is no shared read/bookmark state on the `notification` row. User-visible state is recipient-scoped and driven by each user's `notification_recipient` row.

## UI Behavior

### Menu Structure

- Top control row: unread, read, bookmarked toggles, and mark-all-read (four controls in a responsive grid).
- Search input combines with active filters.
- Active filters render as chips with explicit clear controls.
- Row-level actions: mark read/unread and bookmark/unbookmark.

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

### Endpoints

Read/list:

- `GET /api/notifications` for `admin` and `operator`
- `GET /api/notifications/:username/all` for ownership-scoped `user` access

State updates:

- `PATCH /api/notifications/:id/state` for `admin` and `operator`
- `PATCH /api/notifications/:username/:id/state` for ownership-scoped `user` access
- `PATCH /api/notifications/mark-all-read` for `admin` and `operator`
- `PATCH /api/notifications/:username/mark-all-read` for ownership-scoped `user` access

Creation:

- `POST /api/notifications` creates a notification with recipient resolution from `role_ids` and/or `user_ids`
- `POST /api/notifications/:id/recipients` extends an existing notification to additional eligible recipients

Notification **type** values are plain strings in `api/src/constants.js` (`NOTIFICATION_TYPES`), not database enums. System-generated notifications use `createNotificationForType` in `api/src/services/notifications/typeService.js`:

- **`DATASET_CREATED`** — on new dataset create; role-broadcast to users in roles listed in `NOTIFICATIONS_TYPES_ROLE_MAP` (default: `admin`, `operator`).
- **`INCOMING_DUPLICATE_DATASET`** — when a duplicate candidate is registered (`register_duplicate`, excluding `NOT_DUPLICATE` near-misses); recipients use the same map; payload includes links to the duplicate and original dataset pages.

### Listing and Pagination

Supported query inputs:

- filters: `read`, `bookmarked`
- `search`
- pagination: `limit`, `offset`

Response contract:

- `items`
- `total`
- `offset`
- `limit`
- `has_more`

Pagination semantics apply to all combinations of filters and search.

### List item shape (summary)

Each item includes:

- `state`: `is_read`, `is_bookmarked`
- `delivery` (type, role metadata as appropriate for the viewer)
- `allowed_links` (resolved, trust-filtered links)
- core fields: `id`, `type`, `label`, `text`, `metadata`, timestamps

### State Updates

`PATCH` on per-user state updates `notification_recipient` only. Responses return the updated read/bookmark state for the authenticated user.

### Mark all read

Marks all unread recipient rows for the acting user as read (ownership-scoped or general route, matching role rules). Does not modify other users' rows.

## Real-Time Model

- Notifications are refreshed by polling only.
- Polling interval comes from `ui/src/config.js` (`notifications.pollingInterval`).
- Each poll refreshes both:
  - paginated list data (`fetchNotifications`)
  - unread badge total (`fetchUnreadCount`)
- Polling is skipped while the search input is focused to avoid interrupting active typing.

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
- polling-driven refresh for new notifications (within the configured interval)
- trusted/untrusted link behavior
- responsive layout and theme color behavior
- cross-user isolation for read/bookmark (API matrix + UI smoke per role); mark-all-read scoped to the acting user only
- extending recipients on an existing notification (admin API)

### Stability Principles

- prefer deterministic `data-testid` assertions
- minimize broad sleeps and unnecessary global timeouts
- keep shared helpers for repeated notification flows

## Constraints and Follow-ups

- updates from other tabs or devices appear after the next poll cycle
- cross-client update latency is bounded by `notifications.pollingInterval`

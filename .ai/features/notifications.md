# Notifications Feature Changelog

## 2026-03-18

- Fix: Notification dropdown menu content now remounts deterministically on filter/search/feed state changes (`menuRenderKey`) to prevent stale/duplicate active-filter chip DOM nodes under repeated read-filter toggle/clear cycles.
- Fix: Removed read-filter microtask double-write in dropdown filter application path; read filter state now updates once per interaction to reduce render churn during menu interactions.
- Fix: Notification dropdown top control bar now uses a fixed six-column full-width layout with centered icon content, and the search input is explicitly full width to match the controls row.
- Fix: Notification dropdown top control bar now switches responsively to a full-width 3x2 control layout on narrower screens (while remaining 6 columns on larger screens).
- Fix: Notification dropdown menu width is now fixed per UI breakpoint (sm/md/lg thresholds) so menu width does not fluctuate with filter state, chip count, or result content.
- Clarification: Responsive behavior follows the app breakpoint system from non-AI UI sources (`ui/vuestic.config.js` thresholds used by Vuestic `useBreakpoint`: `sm=640`, `md=768`, `lg=1024`, `xl=1280`, `2xl=1536`).
- Test: Added dedicated notification theme-color E2E coverage in `tests/src/tests/view/authenticated/notifications/notification_theme_colors.spec.js` for top filter controls, active filter chips, and per-notification action controls.
- Refactor: Moved notification theme mapping from `ui/src/services/notificationTheme.js` into shared `ui/src/constants.js` (`notificationTheme`) and updated notification components to consume the constants export.
- Fix: Per-notification state action controls now use equal-width grid columns with uniform gaps and full-row distribution; column count adapts to visible actions (4 when global dismiss is shown, otherwise 3) so the row width is fully utilized.
- Fix: Notification dropdown keyboard focus flow now anchors on top filter controls when menu opens and applies deterministic Tab/Shift+Tab traversal within the menu to prevent reverse-tab focus loops.
- Fix: Notification dropdown now binds controls to store loading state (`va-inner-loading` + disabled controls/buttons/inputs) during notification-related API calls.
- Decision: Bell badge count now reflects the currently active notification view when filters/search are active, and falls back to unread count when no filters are active.
- Test: Added admin/operator notification E2E coverage for in-flight loading disabled states and bell badge count behavior under active filters/search.
- Validation: Re-ran targeted admin regression (`read filter toggles chip cleanly with no duplicates`), grouped admin filter regressions, and full notifications projects (`admin_notifications`, `operator_notifications`, `user_notifications`) with green results (30 passed, 2 skipped).

- Fix: Added CI auth mappings in `api/.env.default` (`E2E_ADMIN`, `E2E_OPERATOR`, `E2E_USER`) so mocked CAS tickets in CI resolve to concrete test users and create missing users correctly.
- Fix: Corrected Playwright setup config path for `operator_login` (`tests/playwright.config.js`) so operator storage state is created consistently.
- Fix: Enabled notifications feature for `user` role in `ui/src/config.js`; user role now sees notification bell/dropdown and can use per-user read/archive/bookmark features.
- Fix: Updated notification dropdown menu to stay open while interacting with controls (`close-on-content-click=false` in `ui/src/components/notifications/NotificationDropdown.vue`), preventing action/filter clicks from collapsing the menu.
- Validation: Performed live UI walkthrough flows (admin/operator/user) against running app and verified read/unread toggle, bookmark/archive actions, filter chips/buttons, search filter behavior, delivery badges, and untrusted-link confirmation modal path.
- Validation: Verified global dismiss behavior end-to-end in UI: admin/operator can globally dismiss, user cannot; globally dismissed notifications move out of default feed and appear under globally dismissed filter; resolver identity is shown for privileged roles.
- Fix: Notification filter controls were migrated to icon-only actions with Vuestic popover tooltips to keep controls compact while preserving discoverability/accessibility.
- Fix: Archived/Bookmarked/GloballyDismissed chip-clear interactions now use explicit clear handlers (instead of generic toggles), preventing stale state where chip clear did not actually remove the filter.
- Fix: Notification badge count now reflects unread count independently of active filters/search, so filter toggles do not mutate bell count unexpectedly.
- Fix: Search input now stops keydown propagation in dropdown menu (`@keydown.stop`) to prevent focus loss while typing.
- Fix: Search is now applied client-side over already-fetched filtered rows to avoid request-driven rerenders during typing and reduce UI jitter.
- Fix: Added `PATCH /notifications/mark-all-read` and `PATCH /notifications/:username/mark-all-read` to support bulk mark-as-read for requester/owned scope.
- Fix: Added icon control in dropdown for `Mark all as read` and wired it to store/service/API flow.
- Decision: Default notification feed behavior is unread-first (`read=false` baseline). Read notifications disappear from default menu after read actions (single or mark-all), and remain accessible through the `Read` filter.
- Fix: Introduced API-side typed notification service (`notificationTypeService`) so `DATASET_CREATED` has encapsulated business logic for label/text/link resolution from metadata/context.
- Fix: Dataset creation flow now builds notifications through typed payload builder, ensuring `DATASET_CREATED` metadata includes dataset context and deterministic link generation.
- Fix: Seeded additional `DATASET_CREATED` fixtures in notification seed script (direct + role-broadcast examples) for repeatable UI/E2E coverage of type-specific behavior.
- Test: Synced `docker-compose-e2e.yml` with current `docker-compose.yml` runtime conventions (healthchecks, volumes, node_modules cache mounts, key volumes, entrypoint parity), while keeping E2E-only project naming and isolated host ports.
- Test: Added test config env mapping for `baseURL` and `apiBaseURL` (`tests/config/custom-environment-variables.json`) and aligned notification feature enablement roles in test config with UI config (`admin`, `operator`, `user`).
- Test: Added/expanded notification UI-DOM-focused Playwright specs for admin/operator/user (`tests/src/tests/view/authenticated/notifications/*`) covering read/unread transitions, bookmark/archive controls, mark-all-read, global-dismiss visibility/flow, and per-role visibility constraints.
- Test: Added reusable generic action helper `clearInputByTestId` for clearable text inputs in `tests/src/actions/index.js`.
- Validation: Running targeted notification projects through the E2E compose stack currently exposes a reproducible failure where clearing search via input clear control does not always remove the `Search: ...` chip state in admin notifications flow; this remains a tracked UI behavior gap.
- Test: Added E2E-specific lifecycle scripts `bin/deploy_containerized_e2e.sh` and `bin/reset_docker_e2e.sh`, both bound to `docker-compose-e2e.yml` and its declared project name for isolated test-stack management.
- Validation: Notification Playwright projects pass in E2E compose stack (`admin_notifications`, `operator_notifications`, `user_notifications`) with all scenarios active (no `fixme`/skip retained in notification specs).
- Test: Added additional non-duplicate notification E2E coverage in existing role specs:
  - user-owned state transitions (`read`, `bookmark`, `archive`) in user flow
  - unread badge stability under filter toggles
  - combined filter intersection semantics (`read` + `bookmarked`)
  - clear-filters behavior with simultaneous search + filter state
- Validation: Expanded notification suite (`admin_notifications`, `operator_notifications`, `user_notifications`) currently passes in E2E compose stack with 21/21 tests green.
- Clarification: Direct (individual-user-targeted) notifications are recipient-scoped by `notification_recipient.user_id` query filtering; non-recipients (including admin/operator) do not receive or see those rows unless explicitly targeted.
- Test: Added explicit E2E visibility coverage for direct user-targeted notifications:
  - user sees direct notifications targeted to self
  - admin/operator do not see direct notifications targeted only to user
- Validation: Expanded notification suite now passes with 24/24 tests green across `admin_notifications`, `operator_notifications`, and `user_notifications`.
- Fix: Added notification SSE invalidation stream endpoint (`GET /notifications/stream`) that emits per-user `notification` events for create/state-change/mark-all-read/global-dismiss/recipient-add/archive-all mutations.
- Fix: Notification dropdown now opens an SSE stream and triggers immediate refresh on invalidate events, while keeping polling as an automatic fallback when SSE is disconnected.
- Security: SSE stream auth supports bearer token in query parameter only for the `/notifications/stream` route to accommodate browser `EventSource` constraints.
- Fix: SSE create-notification fanout now resolves recipients from `notification_recipient` rows after transaction commit, ensuring newly created notifications trigger invalidate events for all targeted recipients.
- Test: Added E2E cross-user state-isolation coverage (`same notification keeps recipient state independent across users`) validating admin and operator can mutate the same notification independently without cross-user state bleed.
- Test: Added no-reload visibility coverage for newly created notifications (`new notifications appear without reload (realtime or polling fallback)`), validating live refresh behavior without page reload.
- Test: Hardened notification E2E helpers to derive actor/recipient identities from CAS-issued JWT payloads instead of static test-config usernames, removing dependency on populated `tests/config/default.json` usernames.
- Test: Upgraded SSE validation to strict timing coverage (`new notifications appear before polling interval when SSE is ready`) by opening a direct API SSE watcher in test runtime and asserting invalidate event arrival in `<4.5s` after notification creation.
- Test Infra: Added E2E direct API host mapping (`docker-compose-e2e.yml` api `127.0.0.1:14303:3030`) and `TEST_DIRECT_API_BASE_URL` support for deterministic SSE stream assertions.
- Fix: Refactored notification active-filter chips to explicit per-filter chip blocks with dedicated `*-clear` controls and updated notifications E2E selectors to target clear controls directly.
- Fix: Notification store filter updates now replace filter objects immutably (`setFilter` and `clearFilters`) to reduce stale nested-reactivity edge cases.
- Clarification: Read-chip regression remains open; probe runs confirm clear paths execute (`read=false` requests emitted) while stale/duplicate read chip nodes can still remain visible in dropdown DOM under admin project regression flow.

### Additional Feature Todos

- Todo: Validate icon-only filter controls for keyboard-only users (tab order, tooltip visibility, and aria-label clarity).
- Todo: Review and standardize seeded notification fixtures so deterministic unread/read/archive states are guaranteed for every role before UI walkthroughs and E2E runs.
- Todo: Add/keep E2E coverage for cross-user state isolation and SSE-driven refresh timing in CI runs and guard against regressions.
- Todo: Test notification UI controls on all screen sizes (mobile, tablet, desktop) to verify row/wrap behavior and prevent spacing regressions.
- Todo: Fix filter-chip lifecycle bugs end-to-end:
  - read chip does not clear reliably when read filter is toggled off or chip clear is clicked
  - duplicate read chips can appear after repeated enable/clear cycles
  - top filter controls and active chips can get out of sync in mixed filter flows
- Todo: Fix runtime DOM errors in mixed filter combinations (including read + archived) and verify no `HierarchyRequestError` in console.
- Todo: Ensure count indicator behavior is explicit and test-covered for filtered views.
- Todo: Add full E2E coverage (non-duplicative) for:
  - read filter chip clear via chip control
  - duplicate-chip prevention under repeated toggles
  - read+archived / read+bookmarked / archived+bookmarked combinations without runtime errors
  - top-button and chip single-source-of-truth synchronization
- Todo: UI polish pass for notification menu:
  - small filter chips
  - full-width top controls + search
  - full-width per-notification state action controls
  - coherent color/icon mapping across top controls, chips, and per-notification actions
  - role-broadcast/direct chip color semantics

## 2026-03-14

- Clarification: Notifications feature work is tracked in this changelog file.
- Constraint: Backward compatibility with existing notification data is not required because current notification tables are empty.
- Clarification: Current notification persistence is global-status based (`notification.status`) with a single `acknowledged_by_id`, not per-recipient state.
- Clarification: Current UI only polls and displays active notifications and does not implement read/archive/favorite actions.
- Decision: Recipient interaction state is tracked per user (read/unread, archived, bookmarked) rather than globally on the notification event.
- Decision: Notification filtering supports three independent user-level filters: read/unread, archived, and bookmarked.
- Decision: "Favorite" terminology is replaced with "Bookmark" in code and API contracts.
- Decision: Redirect destination supports arbitrary application URIs and is not constrained to entity-based patterns.
- Decision: Notification events support extensibility through a JSON metadata column in addition to standard title/body fields.
- Todo (Critical): Confirm and enforce multi-role user behavior for recipient resolution and visibility filtering.
- Decision: Prefer deriving redirect destinations at runtime from trusted server-side route resolvers instead of storing raw redirect URIs in the database.
- Constraint: If redirect data is persisted, treat it as untrusted input and enforce strict allowlist-based validation before persistence and before response.
- Clarification: Metadata-based overrides may include display/content overrides and redirect override instructions, but redirect overrides must use constrained keys/params, not arbitrary URLs.
- Todo: Add notification menu search input to filter notifications by label/title and body text.
- Decision: Notification `type` is optional; one-off notifications are supported without introducing new predefined types.
- Decision: API returns server-computed, trusted clickable links per notification (allowlist for that notification), and UI only allows navigation to links present in that trusted list.
- Clarification: Link trust decisions are authoritative on API; UI enforcement is an additional guard, not the source of truth.
- Constraint: Implementation scope is limited to agreed behavior only; no extra speculative enhancements.
- Decision: Metadata supports both role-based overrides and role-based additive content for notification presentation and links.
- Clarification: Untrusted allowed links are opened in a new tab only after explicit user confirmation.
- Decision: Admin/operator can resolve selected notifications globally so they no longer appear as unread for any recipient.
- Constraint: Global resolve is authorization-gated to admin/operator and is distinct from per-user archive/read/bookmark state.
- Decision: Notification UI must visually indicate whether a notification was delivered via role-targeted broadcast versus direct user targeting.
- Decision: Users can filter to view only globally dismissed notifications.
- Decision: Global dismissal audit must persist both `resolved_by` user and `resolved_at` timestamp.
- Clarification: API responses for notifications must include delivery source metadata and global dismissal metadata needed for UI badges/filters.
- Decision: Per-user state updates on globally dismissed notifications return conflict (`409`) so clients can refresh and avoid stale actions.
- Decision: Recipient assignment to an already globally dismissed notification returns conflict (`409`), and UI handles it with a targeted toast.
- Decision: Globally dismissed notification details include resolver identity only for admin/operator viewers; user-role viewers do not see resolver identity.
- Decision: Global dismissal permission is restricted to admin/operator roles regardless of notification creator.
- Decision: Personal notification state updates use username-scoped ownership routes (`/:username/...`) with `checkOwnership` for user-role access.
- Decision: Notification creation permission is restricted to admin/operator roles; user role has no notification create permission.
- Decision: User-role notification reads and personal state updates use own-scope access declarations (`read:own`, `update:own`) and ownership routes.
- Clarification: Container startup/reset scripts accept both `APP_ENV=docker` and `APP_ENV=ci`; workers resolve `APP_ENV=ci` to docker config behavior.
- Todo: Decide whether to introduce SSE for near-real-time global dismissal propagation or keep polling-only behavior.
- Todo (Next): Implement SSE-based notification invalidation so global dismissals propagate to connected clients immediately.
- Todo (Notification Producer Integration): Migrate all notification producers to emit recipient-aware payloads (`role_ids` and/or `user_ids`) and metadata link descriptors.
- Todo (Notification Producer Integration): Update worker-side notification payload helpers to use recipient-aware contracts and metadata link descriptors.

### E2E Edge Cases To Cover

- Verify two users receiving the same notification can independently mark read/unread, archive/unarchive, and bookmark/unbookmark without affecting each other.
- Verify combined filters (`read`/`unread`, `archived`, `bookmarked`) support intersection behavior and can be cleared independently.
- Verify notification search matches label and body text and composes correctly with active filters.
- Verify role-based overrides and role-based additive links are applied correctly for multi-role users (including deterministic precedence).
- Verify untrusted links require confirmation and open in a new tab without breaking the current app session.
- Verify users only see notifications when they are eligible recipients and the notifications feature is enabled for their role.
- Verify admin/operator global resolve removes notifications from unread counts for all recipients while preserving recipient history fields as designed.
- Verify non-admin/operator users cannot call global resolve endpoints.
- Verify per-user state updates on globally dismissed notifications return `409` and trigger client refresh behavior.
- Verify recipient additions to globally dismissed notifications return `409`.
- Verify delivery-source badges render correctly for direct vs role-broadcast notifications (including role label visibility).
- Verify per-notification header chips (e.g., `Direct`, `Role Broadcast`, role-name chip, and global-dismiss-status chip when applicable) are rendered for all roles, not only admin/operator.
- Verify globally dismissed filter shows only globally dismissed notifications and default feed excludes them.
- Verify resolver identity is visible to admin/operator viewers and hidden for user-role viewers.
- Verify user-role notification read/update requests through username-scoped ownership routes enforce `checkOwnership` correctly.
- Verify notification creation is forbidden for user role and allowed for admin/operator.
- Verify icon-only controls expose tooltips and clear visual on/off state for all filters (`Unread`, `Read`, `Archived`, `Bookmark`, `Globally dismissed`).
- Verify active-filter chips clear the exact same underlying filters as icon controls (single source of truth for filter state).
- Verify every active-filter chip close (`x`) removes that chip immediately and clears the corresponding filter state (`Read`, `Archived`, `Bookmarked`, `Globally dismissed`, `Search`) with no stale chip leftovers.
- Verify clearing the search input via input clear control (`x`) removes the `Search: ...` chip immediately, and clearing via the chip close control (`x`) restores the unsearched result set.
- Verify archived filter can always be cleared through chip-close and the clear-filters control.
- Verify bookmark filter can be enabled/disabled via icon and chip and always returns to baseline feed after clearing.
- Verify bell badge behavior across baseline vs filtered/search modes (baseline unread count vs active-view count) and ensure no drift/regression.
- Verify search input retains focus while typing inside dropdown and does not lose characters due to menu keyboard handling.
- Verify search-only, filter-only, and search+filter intersection results produce consistent rows and reset correctly when cleared.
- Verify the search filter chip clears in both directions: clearing via input clear button (`x`) removes the chip, and clearing via chip close (`x`) clears the input and filter state.
- Verify `Mark all as read` marks unread visible notifications, empties default unread feed, and keeps read items accessible under `Read` filter.
- Verify per-notification `Mark read` removes the row from default unread feed immediately.
- Verify per-notification `Mark unread` inside `Read` filter removes the row from `Read` view and returns it to default unread feed.
- Verify `DATASET_CREATED` notifications resolve deterministic `View dataset` links from typed metadata/context and display correctly in UI for all eligible recipients.

### Playwright Test Plan (Focused)

- `tests/src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js`
  - `admin_can_create_notification_and_delivery_badge_is_visible`
  - `operator_can_create_notification`
  - `role_broadcast_and_direct_delivery_badges_render_correctly`
  - `global_dismiss_by_admin_removes_unread_for_other_users`
  - `global_dismiss_by_operator_removes_unread_for_other_users`
  - `add_recipients_to_globally_dismissed_notification_returns_409`
  - `recipient_state_update_after_global_dismiss_returns_409`
  - `resolver_identity_visible_for_admin_and_operator_views`

- `tests/src/tests/view/authenticated/notifications/user_role_notifications.spec.js`
  - `user_can_read_archive_bookmark_own_notifications_via_forSelf_flow`
  - `user_cannot_create_notifications`
  - `user_cannot_global_dismiss_notification`
  - `resolver_identity_hidden_for_user_view`
  - `checkOwnership_blocks_user_from_accessing_other_username_notification_routes`

- `tests/src/tests/view/authenticated/notifications/notification_filters_and_search.spec.js` (new)
  - `read_unread_archived_bookmarked_filters_support_intersection`
  - `globally_dismissed_filter_shows_only_dismissed`
  - `search_matches_label_and_text_and_composes_with_filters`
  - `clear_filters_resets_all_notification_filters`

### Notification Producer Integration Todos

- Update any remaining API call sites that create notifications to include explicit recipients and metadata link descriptors.
- Update worker-originated notification publishers to the new recipient-aware API contract.
- Update e2e notification API helpers/spec fixtures that still assume global notification state (`status=CREATED`) semantics.

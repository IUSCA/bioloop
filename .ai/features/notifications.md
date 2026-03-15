# Notifications Feature Changelog

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
- Todo (Notification Producer Integration): Migrate all notification producers to emit recipient-aware payloads (`role_ids` and/or `user_ids`) and metadata link descriptors.
- Todo (Notification Producer Integration): Update worker-side notification payload helpers to use recipient-aware contracts and metadata link descriptors.

### E2E Edge Cases To Cover

- Verify two users receiving the same notification can independently mark read/unread, archive/unarchive, and bookmark/unbookmark without affecting each other.
- Verify combined filters (`read`/`unread`, `archived`, `bookmarked`) support intersection behavior and can be cleared independently.
- Verify notification search matches label and body text and composes correctly with active filters.
- Verify role-based overrides and role-based additive links are applied correctly for multi-role users (including deterministic precedence).
- Verify untrusted links require confirmation and open in a new tab without breaking the current app session.
- Verify users only see notifications when they are eligible recipients and the notifications feature is enabled for their role.

### Notification Producer Integration Todos

- Update any remaining API call sites that create notifications to include explicit recipients and metadata link descriptors.
- Update worker-originated notification publishers to the new recipient-aware API contract.
- Update e2e notification API helpers/spec fixtures that still assume global notification state (`status=CREATED`) semantics.

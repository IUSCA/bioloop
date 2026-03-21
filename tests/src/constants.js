/**
 * FEATURE_ROLE_SYNC_NOTE
 *
 * Describes role-gated feature sync expectations for CI/e2e.
 * Kept as a shared message for test failures that indicate matrix/config drift.
 */
export const FEATURE_ROLE_SYNC_NOTE = `
Role-gated feature misconfiguration detected.

When a feature is enabled only for certain roles, two things must stay in sync:

  1. Runtime UI feature config  —  source of truth for whether the feature
     renders for a given role. For e2e/ci, this should come from env overrides
     in ui config (VITE_*_ENABLED_FOR_ROLES).

  2. Playwright project definitions  —  each role needs its own project entry
     that routes it to either:
       a) the full functional test suite  (roles WITH access)
          — the access-control spec must be excluded from this project, because
            these roles reach the real feature UI and should not see the alert.
       b) the access-control spec only  (roles WITHOUT access)
          — asserts the "feature disabled" alert is shown instead of the UI.
     The two cases are mutually exclusive: a project must never run both.

To add a role to a feature's access list:
  — Add the role to the runtime UI env override list.
  — Ensure Playwright project routing sends that role to functional specs.

To remove a role's access, reverse the steps above.
`.trim();

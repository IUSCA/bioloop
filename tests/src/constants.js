/**
 * FEATURE_ROLE_SYNC_NOTE
 *
 * Describes the three-way sync requirement for any feature whose access is
 * restricted to a subset of roles.  Exported as a string so it can be used
 * as a skip/fail message in spec files, making the requirement visible in
 * test reports whenever a misconfiguration is detected.
 */
export const FEATURE_ROLE_SYNC_NOTE = `
Role-gated feature misconfiguration detected.

When a feature is enabled only for certain roles, three things must stay in sync:

  1. Runtime UI feature config  —  the source of truth for whether the feature
     renders for a given role.  Each feature has an enabledForRoles list that
     the application reads at startup.

  2. Test environment feature config (this project's config package)  —  must
     mirror the runtime UI config exactly.  Spec files read this config to
     decide whether to run or skip tests (e.g. skipping the access-control
     assertion when a feature is enabled for all roles, or skipping functional
     tests when a feature is disabled).  If the two diverge, tests silently
     skip when they should run, or fail when they should be skipped.

  3. Playwright project definitions  —  each role needs its own project entry
     that routes it to either:
       a) the full functional test suite  (roles WITH access)
          — the access-control spec must be excluded from this project, because
            these roles reach the real feature UI and should not see the alert.
       b) the access-control spec only  (roles WITHOUT access)
          — asserts the "feature disabled" alert is shown instead of the UI.
     The two cases are mutually exclusive: a project must never run both.

To add a role to a feature's access list:
  — Add the role to both the runtime UI config and the test config (items 1 & 2).
  — Switch the role's Playwright project to the full functional glob and
    exclude the access-control spec (item 3).

To remove a role's access, reverse the steps above.
`.trim();

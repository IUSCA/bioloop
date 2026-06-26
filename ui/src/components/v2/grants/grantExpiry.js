/**
 * Pure helper functions for grant expiry logic.
 * Shared by SubjectPanelHeader (preview pills) and GrantRow (date row).
 */

/**
 * Returns days remaining until a grant's expiry.
 * Returns Infinity for grants that never expire.
 * Returns a negative number for already-expired grants.
 */
export function daysUntilExpiry(grant) {
  if (!grant.expiry || grant.expiry.type === "never") return Infinity;
  return Math.floor((new Date(grant.expiry.value) - Date.now()) / 86400000);
}

/**
 * Returns true if the grant is expiring within 14 days.
 */
export function isGrantExpiring(grant) {
  const days = daysUntilExpiry(grant);
  return days !== Infinity && days <= 14;
}

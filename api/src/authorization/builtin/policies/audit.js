const PolicyContainer = require('../../core/policies/PolicyContainer');
const { platformAdminOnly } = require('./utils/index');

/**
 * Visibility of the platform-wide audit query.
 *
 * `GET /audit/records` returns actors, subjects, resource names, and decisions across every
 * resource in the system. No per-resource policy scopes an answer that spans all of them, so
 * platform admin is the rule rather than a placeholder for one.
 *
 * Owning-group admins and oversight authorities read the records for the resources they
 * govern through each resource's own endpoint, bound to `dataset.view_audit_logs`,
 * `collection.view_audit_logs`, or `group.view_audit_logs`. This container does not cover
 * those.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */
const auditPolicies = new PolicyContainer({
  resourceType: 'audit',
  version: '1.0.0',
  description: 'Policy for the platform-wide audit query',
});

// No policy below names the platform-admin role. The engine allows a platform admin every
// action before any of these run, so repeating the term here would be dead weight.
// platformAdminOnly says that nobody else qualifies.
auditPolicies.actions({
  read_records: platformAdminOnly,
});

module.exports = {
  auditPolicies,
};

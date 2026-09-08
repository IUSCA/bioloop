const PolicyContainer = require('../../core/policies/PolicyContainer');
const { platformAdminOnly } = require('./utils/index');

/**
 * Audit record visibility.
 *
 * `GET /audit/records` returns actors, subjects, resource names, and decisions across the
 * whole platform, and it carried no authorization at all. Any authenticated user could read
 * every record.
 *
 * Platform admin is the floor, not the intended end state. Use case 57 wants owning-group
 * admins and oversight admins to read the records for resources they govern, which needs
 * the query to be scoped by the caller's authority rather than merely gated. Closing the
 * hole does not wait for that.
 *
 * @see docs/design/groups/decisions.md — 11. Platform admin is one check in the engine
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */
const auditPolicies = new PolicyContainer({
  resourceType: 'audit',
  version: '1.0.0',
  description: 'Policies for platform audit records',
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

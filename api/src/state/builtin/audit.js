const StateContainer = require('../core/StateContainer');
const { always } = require('../core/rules');

/**
 * What the audit trail's state admits.
 *
 * Audit records are append-only and are never in a state that closes reading. Archiving a group
 * deliberately leaves its history readable.
 *
 * @see docs/design/groups/design.md — What Archiving Preserves
 */
const auditState = new StateContainer({
  resourceType: 'audit',
  description: 'Audit records are readable in every state',
}).rules({
  read_records: always,
});

module.exports = { auditState };

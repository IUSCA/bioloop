/* eslint-disable global-require */
const prisma = require('@/db');
const { AUTH_EVENT_TYPE } = require('./events');
const { TARGET_TYPE, SUBJECT_TYPE } = require('./types');
const AuditBuilder = require('./AuditBuilder');

/**
 * Get audit records with comprehensive filtering, sorting, and pagination
 *
 * @param {Object} options - Query options
 * @param {Object} options.filter - Filter criteria
 * @param {string} options.filter.event_type - Comma-separated event types
 * @param {string} options.filter.actor_id - Filter by actor ID
 * @param {string} options.filter.subject_id - Filter by subject ID
 * @param {string} options.filter.resource_id - Filter by resource ID
 * @param {string} options.filter.resource_type - Filter by resource type
 * @param {string} options.filter.target_type - Filter by target type (legacy)
 * @param {string} options.filter.target_id - Filter by target ID (legacy)
 * @param {string} options.start_date - Include events on or after this date (ISO 8601)
 * @param {string} options.end_date - Include events before or on this date (ISO 8601)
 * @param {string} options.sort_by - Sort field: "timestamp", "actor_id", "event_type" (default: "timestamp")
 * @param {string} options.sort_order - Sort direction: "asc" or "desc" (default: "desc")
 * @param {number} options.limit - Max records to return, 1-500 (default: 50)
 * @param {number} options.offset - Pagination offset (default: 0)
 * @returns {Promise<Array>} The matching audit records, newest first by default
 */
async function getAuditRecords({
  filter = {},
  start_date,
  end_date,
  sort_by = 'timestamp',
  sort_order = 'desc',
  limit = 50,
  offset = 0,
}) {
  // Build where clause
  const where = {};

  // if end_date is not provided, default to current date to prevent postgres from searching partitions with future dates
  const effectiveEndDate = end_date || new Date().toISOString();
  where.timestamp = { lte: new Date(effectiveEndDate) };

  // Event type filter (comma-separated list)
  if (filter.event_type) {
    const eventTypes = filter.event_type.split(',').map((t) => t.trim());
    if (eventTypes.length === 1) {
      // eslint-disable-next-line prefer-destructuring
      where.event_type = eventTypes[0];
    } else if (eventTypes.length > 1) {
      where.event_type = { in: eventTypes };
    }
  }

  // Actor ID filter
  if (filter.actor_id) {
    where.actor_id = filter.actor_id;
  }

  // Subject ID filter
  if (filter.subject_id) {
    where.subject_id = filter.subject_id;
  }

  // Resource ID filter
  if (filter.resource_id) {
    where.resource_id = filter.resource_id;
  }

  // Resource type filter
  if (filter.resource_type) {
    where.resource_type = filter.resource_type;
  }

  // Target type filter (legacy)
  if (filter.target_type) {
    where.target_type = filter.target_type;
  }

  // Target ID filter (legacy)
  if (filter.target_id) {
    where.target_id = filter.target_id;
  }

  // Date range filter
  if (start_date) {
    where.timestamp.gte = new Date(start_date);
  }

  // Build order by clause
  const orderBy = {};
  const validSortFields = ['timestamp', 'actor_id', 'event_type'];
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'timestamp';
  const sortDir = sort_order === 'asc' ? 'asc' : 'desc';
  orderBy[sortField] = sortDir;

  const records = await prisma.authorization_audit.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
  });

  return records;
}

/**
 * Audit records about one resource, for that resource's own audit tab.
 *
 * A record belongs to a resource when the resource is either the thing being changed
 * (`target_id`) or the thing the change is about (`resource_id`). Both are needed. A
 * collection lifecycle event names the collection as the target, while a grant on that same
 * collection names the grant as the target and the collection as the resource. A dataset is
 * never a target at all — no `TARGET_TYPE` value for it exists — so a dataset's records are
 * found only through `resource_id`.
 *
 * The id to pass is the resource's UUID as the audit table stores it: `dataset.resource_id`
 * for a dataset, `collection.id` for a collection (which is its resource id), and `group.id`
 * for a group. A group is not a resource, so only its `target_id` rows match; grants issued
 * *to* a group are recorded against the group as subject and are deliberately not included.
 *
 * Callers must authorize first. This function applies no access filtering of its own.
 *
 * @param {Object} options
 * @param {string} options.resource_id - UUID of the dataset, collection, or group
 * @param {string} [options.event_type] - Comma-separated event types to include
 * @param {string} [options.start_date] - Include events on or after this date (ISO 8601)
 * @param {string} [options.end_date] - Include events before or on this date (ISO 8601)
 * @param {string} [options.sort_order] - "asc" or "desc" (default: "desc")
 * @param {number} [options.limit] - Max records to return (default: 50)
 * @param {number} [options.offset] - Pagination offset (default: 0)
 * @returns {Promise<{metadata: {count: number}, data: Array}>}
 * @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
 */
async function getResourceAuditRecords({
  resource_id,
  event_type,
  start_date,
  end_date,
  sort_order = 'desc',
  limit = 50,
  offset = 0,
}) {
  // Bound the scan the same way getAuditRecords does. The table is partitioned by timestamp,
  // and an open upper bound makes postgres search partitions for future dates.
  const timestamp = { lte: new Date(end_date || Date.now()) };
  if (start_date) {
    timestamp.gte = new Date(start_date);
  }

  const where = {
    timestamp,
    OR: [
      { target_id: resource_id },
      { resource_id },
    ],
  };

  if (event_type) {
    const eventTypes = event_type.split(',').map((t) => t.trim()).filter(Boolean);
    if (eventTypes.length === 1) {
      [where.event_type] = eventTypes;
    } else if (eventTypes.length > 1) {
      where.event_type = { in: eventTypes };
    }
  }

  const [count, data] = await Promise.all([
    prisma.authorization_audit.count({ where }),
    prisma.authorization_audit.findMany({
      where,
      orderBy: { timestamp: sort_order === 'asc' ? 'asc' : 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return { metadata: { count }, data };
}

module.exports = {
  // Reading the audit trail
  getAuditRecords,
  getResourceAuditRecords,

  // Writing it: services record each access change inside the transaction that makes it
  AUTH_EVENT_TYPE,
  TARGET_TYPE,
  SUBJECT_TYPE,
  AuditBuilder,
};

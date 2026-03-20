/* eslint-disable global-require */
const prisma = require('@/db');

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
 * @returns {Object} { data: Array, pagination: { total, limit, offset, returned } }
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
  if (start_date || end_date) {
    where.timestamp = {};
    if (start_date) {
      where.timestamp.gte = new Date(start_date);
    }
    if (end_date) {
      where.timestamp.lte = new Date(end_date);
    }
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

module.exports = {
  getAuditRecords,
};

const express = require('express');
const { query } = require('express-validator');
const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const auditService = require('@/services/audit');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');

const router = express.Router();

// Get audit records with comprehensive filtering, sorting, and pagination
router.get(
  '/records',
  // These records span the whole platform, so reading them is platform admin only.
  // @see docs/design/groups/use-cases.md — 57. The audit log is readable only by people with a reason
  authorize('audit', 'read_records', { resourceIdFn: () => null }),
  validate([
    query('filter[event_type]').optional().isString().trim(),
    query('filter[actor_id]').optional().isUUID(),
    query('filter[subject_id]').optional().isUUID(),
    query('filter[subject_type]').optional().isString().trim(),
    query('filter[target_type]').optional().isString().trim(),
    query('filter[target_id]').optional().isUUID(),
    query('filter[resource_id]').optional().isUUID(),
    query('filter[resource_type]').optional().isString().trim(),
    query('start_date').optional().isISO8601().toDate(),
    query('end_date').optional().isISO8601().toDate(),
    query('sort_by').optional().isIn(['timestamp', 'actor_id', 'event_type']),
    query('sort_order').optional().isIn(['asc', 'desc']),
    query('limit').default(50).isInt({ min: 1, max: 500 }).toInt(),
    query('offset').default(0).isInt({ min: 0 }).toInt(),
  ]),
  asyncHandler(async (req, res) => {
    const {
      filter = {},
      start_date,
      end_date,
      sort_by = 'timestamp',
      sort_order = 'desc',
      limit = 50,
      offset = 0,
    } = req.query;

    const result = await auditService.getAuditRecords({
      filter,
      start_date,
      end_date,
      sort_by,
      sort_order,
      limit,
      offset,
    });

    res.json(result);
  }),
);

module.exports = router;

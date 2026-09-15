const express = require('express');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { restrictions } = require('@/authorization');

const router = express.Router();

/**
 * The actions a restriction type blocks, for the dialogs that say what applying it stops.
 *
 * Any signed-in caller may read it. It describes the rule, not any resource.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — Phase 6: restrictions, operations, and creates
 */
router.get(
  '/:type/blocked-actions',
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['Restrictions']
    // #swagger.summary = 'The actions a restriction type blocks'
    const { type } = req.params;
    if (!restrictions.RESTRICTION_TYPES[type]) {
      return next(createError.NotFound(`No restriction type ${type}`));
    }
    return res.json({ type, blocked_actions: restrictions.blockedActions(type) });
  }),
);

module.exports = router;

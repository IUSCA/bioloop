const express = require('express');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const state = require('@/state');

const router = express.Router();

/**
 * What a named state forbids for one resource type, for the dialogs that confirm entering it.
 *
 * Archiving a group tells its admin which steps stop. The answer comes from the resource's own
 * state rules, run against the row that resource declares for the state, so this route and the
 * 409 a service returns cannot drift apart. Which state reaches a resource is the resource's
 * business: a collection reads its own column, and a dataset reads its owning group's.
 *
 * Any signed-in caller may read it. It describes the rules, not any resource.
 *
 * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
 * @see docs/design/groups/implementation/restrictions-plan.md — Phase 3: the state route
 */
router.get(
  '/:resource_type/:state_name/forbidden-actions',
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['States']
    // #swagger.summary = 'The actions a named state forbids for a resource type'
    const { resource_type, state_name } = req.params;

    if (!state.stateRegistry.has(resource_type)) {
      return next(createError.NotFound(`No state rules for ${resource_type}`));
    }
    // A resource type with no such state is a gap to report rather than an empty list, because
    // an empty list reads as "this state forbids nothing".
    if (!state.stateRegistry.get(resource_type).getExampleNames().includes(state_name)) {
      return next(createError.NotFound(`No ${state_name} state for ${resource_type}`));
    }

    return res.json({
      resource_type,
      state: state_name,
      forbidden_actions: state.forbiddenActions(resource_type, state_name),
    });
  }),
);

module.exports = router;

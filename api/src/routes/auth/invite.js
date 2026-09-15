const express = require('express');
const { body } = require('express-validator');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { authenticate } = require('@/middleware/auth');
const invitationService = require('@/services/invitations');

/**
 * Spending an invitation token.
 *
 * `/check` is public, because the person holding a link has not signed in yet and the page
 * has to decide what to show them. `/apply` is authenticated, because applying an invitation
 * means putting a specific account into a group.
 *
 * @see docs/design/groups/implementation/invitations.md — API Reference
 */
const router = express.Router();

const tokenBody = validate([
  body('token')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 100 }),
]);

// Is this link still good? Public, and answers without spending the token.
router.post(
  '/check',
  tokenBody,
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Whether an invitation token can still be used'

    // Only valid or invalid. The caller is unauthenticated, so a reason would turn this into
    // an oracle for the state of someone else's invitation; the reason is logged instead.
    res.json(await invitationService.checkInvitationToken(req.body.token));
  }),
);

// Spend it. The invited address is in the row, so the server decides who the link belongs to.
router.post(
  '/apply',
  authenticate,
  tokenBody,
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['Auth']
    // #swagger.summary = 'Apply an invitation to the authenticated account'

    res.json(await invitationService.acceptInvitationByToken({
      token: req.body.token,
      user: req.user,
    }));
  }),
);

module.exports = router;

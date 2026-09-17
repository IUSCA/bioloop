const express = require('express');
const { param } = require('express-validator');
const createError = require('http-errors');
const rateLimit = require('express-rate-limit');
const fsPromises = require('fs/promises');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const { optionalAuthenticate } = require('@/middleware/auth');
const { createAuthorizationMiddleware: authorize } = require('@/authorization');
const profileService = require('@/services/profiles');
const avatarService = require('@/services/profiles/avatar');

/**
 * The only routes reachable without a token.
 *
 * Three properties hold here and are asserted by
 * `tests/authorization/public_router.test.js`, because each one is the kind of thing a
 * later edit removes without noticing.
 *
 *  - Every route is a GET. Nothing on this router changes anything.
 *  - Every route authorizes `view_profile`, the one action an unauthenticated caller can
 *    satisfy.
 *  - A refusal is a 404, never a 403. A 403 on a private group confirms the group exists,
 *    so an unpublished profile and an id that was never issued answer identically.
 *
 * @see docs/design/groups/profiles.md — The public router
 */

const router = express.Router();

/**
 * A person reading one profile issues a handful of requests. Sixty a minute sits two
 * orders of magnitude above that and far below the rate an address-space scan would need.
 * It is a ceiling on abuse, not a tuned value.
 */
const PUBLIC_REQUESTS_PER_MINUTE = 60;

const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: PUBLIC_REQUESTS_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Try again shortly.' },
});

/**
 * Five minutes is short enough that an admin who switches a profile back to private sees
 * it disappear while they are still at the keyboard.
 */
const PUBLIC_CACHE_SECONDS = 300;

router.use(publicRateLimit);
// `initializePolicyContext` already ran at app level, before req.user existed, so its own
// seeding branch never fires on a route. `optionalAuthenticate` puts the caller into the
// cache it created.
router.use(optionalAuthenticate);

function setPublicCacheHeaders(res) {
  res.set('Cache-Control', `public, max-age=${PUBLIC_CACHE_SECONDS}`);
}

/**
 * Turn an authorization refusal into a 404.
 *
 * `authorize()` answers 403, which distinguishes "exists but you may not read it" from
 * "does not exist". On this router that distinction is itself the disclosure.
 */
function hideRefusals(err, req, res, next) {
  if (err?.status === 403) return next(createError.NotFound());
  return next(err);
}

// ── Group profile ───────────────────────────────────────────────────────────
router.get(
  '/groups/:id',
  validate([param('id').isUUID()]),
  authorize('group', 'view_profile'),
  asyncHandler(async (req, res) => {
    const group = await profileService.getGroupForProfile(req.params.id);
    if (!group) throw createError.NotFound();

    const admins = (group.members ?? []).map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      email: m.user.email,
    }));

    setPublicCacheHeaders(res);
    res.json({
      ...req.permission.filter({ ...group, admins }),
      citation: profileService.resolveCitation(group, 'groups'),
    });
  }),
);

// ── Collection profile ──────────────────────────────────────────────────────
router.get(
  '/collections/:id',
  validate([param('id').isUUID()]),
  authorize('collection', 'view_profile'),
  asyncHandler(async (req, res) => {
    const collection = await profileService.getCollectionForProfile(req.params.id);
    if (!collection) throw createError.NotFound();

    setPublicCacheHeaders(res);
    res.json({
      ...req.permission.filter(collection),
      citation: profileService.resolveCitation(collection, 'collections'),
    });
  }),
);

// ── Group avatar ────────────────────────────────────────────────────────────
router.get(
  '/groups/:id/avatar',
  validate([param('id').isUUID()]),
  authorize('group', 'view_profile'),
  asyncHandler(async (req, res) => {
    const group = await profileService.getGroupForProfile(req.params.id);
    if (!group?.avatar_key) throw createError.NotFound();

    const file = avatarService.avatarPath(group.avatar_key);
    if (!avatarService.isInsideAvatarDir(file)) throw createError.NotFound();
    await fsPromises.access(file).catch(() => { throw createError.NotFound(); });

    setPublicCacheHeaders(res);
    res.type(avatarService.contentTypeFor(group.avatar_key));
    res.sendFile(file);
  }),
);

router.use(hideRefusals);

module.exports = router;

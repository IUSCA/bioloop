const express = require('express');

const asyncHandler = require('@/middleware/asyncHandler');
const importSourceService = require('@/services/import_sources');

const router = express.Router();

/**
 * Import sources this caller may browse.
 *
 * Scoped to the groups the caller belongs to, has oversight of, or administers. The legacy
 * `GET /datasets/imports/sources` lists every source to every user and stays as it is until
 * cut-over.
 *
 * SUSPENDED sources are listed with their reason, so an unreadable path says so instead of
 * appearing as an empty directory.
 *
 * @see docs/design/groups/dataset-creation.md — Import sources are visible to everyone
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // #swagger.tags = ['import sources']
    // #swagger.summary = 'Import sources the caller may browse'
    res.json(await importSourceService.listImportSourcesForUser(req.user));
  }),
);

module.exports = router;

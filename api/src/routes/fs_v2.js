const path = require('node:path');
const express = require('express');
const { query } = require('express-validator');
const createError = require('http-errors');

const asyncHandler = require('@/middleware/asyncHandler');
const { validate } = require('@/middleware/validators');
const importSourceService = require('@/services/import_sources');
const { browseImportSource } = require('@/services/fs_v2');

const router = express.Router();

/**
 * Browse inside an import source the caller may reach.
 *
 * The requested path is resolved against the caller's own sources rather than against every
 * row. Scoping the source list without scoping this would be decoration: the contents would
 * still be served to anyone who guessed a path.
 *
 * A path outside every reachable source is refused without saying whether such a source
 * exists, so the refusal reveals nothing about another group's filesystem.
 *
 * @see docs/design/groups/implementation/dataset-creation-plan.md — B2
 */
router.get(
  '/',
  validate([
    query('path').isString().trim().notEmpty(),
    query('dirs_only').optional().toBoolean().default(false),
    query('extension').optional().isString().trim(),
  ]),
  asyncHandler(async (req, res, next) => {
    // #swagger.tags = ['fs']
    // #swagger.summary = 'Browse a directory inside an import source the caller may reach'
    const requestedPath = req.query.path;

    const normalized = path.normalize(requestedPath);
    if (!path.isAbsolute(normalized)) {
      return next(createError.BadRequest('path must be absolute'));
    }
    const resolved = path.resolve(normalized);

    const source = await importSourceService.resolveImportSourceForUser(req.user, resolved);
    if (!source) {
      return next(createError.Forbidden('Path is not inside an import source you can browse'));
    }
    if (source.unavailable) {
      return next(createError.ServiceUnavailable(
        source.status_reason || `Import source ${source.label} is currently unavailable`,
      ));
    }

    // resolveImportSourceForUser normalises away the trailing slash, which decides whether
    // the answer is the directory itself or its contents. Put it back.
    const withSlash = requestedPath.endsWith('/') ? `${resolved}/` : resolved;

    return res.json(await browseImportSource({
      source,
      requestedPath: withSlash,
      dirs_only: req.query.dirs_only,
      extension: req.query.extension,
    }));
  }),
);

module.exports = router;
